import type { MessageMeta, MessageType, NudgeKind } from "@/lib/types";
import { handler, HttpError, readJson, requireCouple } from "@/server/api";
import { all, one, run } from "@/server/db";
import {
  getMessageRow,
  hydrate,
  listMessages,
  NUDGES,
  notifyPartner,
  publishMessage,
  searchMessages,
  unreadCount,
  type MediaRow,
  type MessageRow,
} from "@/server/messages";
import { isOnline, sendToUser } from "@/server/realtime";

const MEDIA_KIND: Partial<Record<MessageType, (mime: string) => boolean>> = {
  image: (m) => m.startsWith("image/"),
  video: (m) => m.startsWith("video/"),
  audio: (m) => m.startsWith("audio/") || m === "video/webm",
  file: () => true,
};

export const GET = handler(async (req) => {
  const { user, coupleId } = await requireCouple();
  const url = new URL(req.url);
  const num = (k: string) => (url.searchParams.has(k) ? Number(url.searchParams.get(k)) : undefined);
  const limit = Math.min(Math.max(num("limit") ?? 40, 1), 100);
  const q = url.searchParams.get("q")?.trim();
  const kind = url.searchParams.get("kind");

  if (q) return Response.json({ messages: hydrate(searchMessages(coupleId, user.id, q.slice(0, 100)), user.id) });

  if (kind) {
    const where: Record<string, string> = {
      media: "m.type IN ('image', 'video') AND m.view_once = 0",
      files: "m.type IN ('file', 'audio')",
      links: "m.type = 'text' AND (m.body LIKE '%http://%' OR m.body LIKE '%https://%')",
      starred: "m.id IN (SELECT message_id FROM stars WHERE user_id = ?)",
    };
    if (!where[kind]) throw new HttpError(400, "Unknown kind.");
    const params = kind === "starred" ? [user.id] : [];
    const rows = all<MessageRow>(
      `SELECT * FROM messages m WHERE m.couple_id = ? AND m.deleted_at IS NULL AND ${where[kind]}
         AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.message_id = m.id AND h.user_id = ?)
         AND m.id < ? ORDER BY m.id DESC LIMIT ?`,
      coupleId,
      ...params,
      user.id,
      num("before") ?? Number.MAX_SAFE_INTEGER,
      limit + 1,
    );
    return Response.json({ messages: hydrate(rows.slice(0, limit), user.id), hasMore: rows.length > limit });
  }

  const around = num("around");
  if (around) {
    const older = listMessages(coupleId, user.id, { before: around + 1, limit: 30 });
    const newer = listMessages(coupleId, user.id, { after: around, limit: 30 });
    const latest = one<{ id: number }>("SELECT MAX(id) AS id FROM messages WHERE couple_id = ?", coupleId)?.id ?? 0;
    return Response.json({
      messages: hydrate([...older, ...newer], user.id),
      hasMore: older.length === 30,
      hasNewer: newer.length > 0 && newer[newer.length - 1].id < latest,
    });
  }

  const after = num("after");
  if (after != null) {
    const rows = listMessages(coupleId, user.id, { after, limit: 200 });
    return Response.json({ messages: hydrate(rows, user.id), unread: unreadCount(coupleId, user.id) });
  }

  const rows = listMessages(coupleId, user.id, { before: num("before"), limit: limit + 1 });
  const hasMore = rows.length > limit;
  return Response.json({
    messages: hydrate(hasMore ? rows.slice(1) : rows, user.id),
    hasMore,
    unread: unreadCount(coupleId, user.id),
  });
});

interface SendBody {
  clientId: string;
  type: MessageType;
  body: string | null;
  mediaId: number | null;
  replyTo: number | null;
  viewOnce: boolean;
  meta: MessageMeta | null;
}

function cleanMeta(type: MessageType, meta: MessageMeta | null | undefined): MessageMeta | null {
  if (!meta || typeof meta !== "object") return null;
  const n = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v * 100) / 100 : undefined);
  const out: MessageMeta = {};
  if (type === "image" || type === "video") {
    out.w = n(meta.w, 20000);
    out.h = n(meta.h, 20000);
  }
  if (type === "audio" || type === "video" || type === "call") out.duration = n(meta.duration, 60 * 60 * 12);
  if (type === "audio" && Array.isArray(meta.peaks)) out.peaks = meta.peaks.slice(0, 64).map((p) => Math.min(1, Math.max(0, Number(p) || 0)));
  if (type === "call") {
    out.video = !!meta.video;
    out.status = meta.status === "missed" || meta.status === "declined" ? meta.status : "ended";
  }
  return JSON.parse(JSON.stringify(out)) as MessageMeta;
}

export const POST = handler(async (req) => {
  const { user, partner, coupleId } = await requireCouple();
  const b = await readJson<SendBody>(req);
  const type = b.type as MessageType;
  const clientId = typeof b.clientId === "string" ? b.clientId.slice(0, 64) : null;

  if (clientId) {
    const existing = one<MessageRow>("SELECT * FROM messages WHERE sender_id = ? AND client_id = ?", user.id, clientId);
    if (existing) return Response.json({ message: hydrate([existing], user.id)[0] });
  }

  let body: string | null = typeof b.body === "string" ? b.body.trim() : null;
  let mediaId: number | null = null;

  if (type === "text") {
    if (!body) throw new HttpError(400, "Message is empty.");
    if (body.length > 4000) throw new HttpError(400, "Message is too long (max 4000 characters).");
  } else if (type === "nudge") {
    if (!body || !(body in NUDGES)) throw new HttpError(400, "Unknown nudge.");
    body = body as NudgeKind;
  } else if (type === "call") {
    body = null;
  } else if (MEDIA_KIND[type]) {
    const media = one<MediaRow>("SELECT * FROM media WHERE id = ? AND uploader_id = ?", Number(b.mediaId), user.id);
    if (!media || !MEDIA_KIND[type]!(media.mime)) throw new HttpError(400, "Attachment is missing. Try again.");
    mediaId = media.id;
    if (type === "audio" || type === "file") body = null;
    if (body && body.length > 1000) throw new HttpError(400, "Caption is too long.");
    body = body || null;
  } else {
    throw new HttpError(400, "Unknown message type.");
  }

  let replyTo: number | null = null;
  if (b.replyTo) {
    const target = one<{ id: number }>("SELECT id FROM messages WHERE id = ? AND couple_id = ?", Number(b.replyTo), coupleId);
    replyTo = target?.id ?? null;
  }
  const viewOnce = (type === "image" || type === "video") && b.viewOnce ? 1 : 0;
  const meta = cleanMeta(type, b.meta);
  const now = Date.now();

  const { id } = run(
    `INSERT INTO messages (couple_id, sender_id, client_id, type, body, media_id, meta, reply_to, view_once, created_at, delivered_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    coupleId,
    user.id,
    clientId,
    type,
    body,
    mediaId,
    meta ? JSON.stringify(meta) : null,
    replyTo,
    viewOnce,
    now,
    isOnline(partner.id) ? now : null,
  );
  const row = getMessageRow(id)!;
  sendToUser(partner.id, { t: "typing", userId: user.id, state: null });
  publishMessage("message", row, [user.id, partner.id]);
  notifyPartner(user, row);
  return Response.json({ message: hydrate([row], user.id)[0] });
});
