import type { MediaInfo, Message, MessageMeta, MessageType, NudgeKind, ReplyPreview } from "@/lib/types";
import { after } from "next/server";
import { all, one } from "./db";
import { pushToUser } from "./push";
import { isActive, sendEach } from "./realtime";
import { getPartner, type UserRow } from "./users";

export interface MessageRow {
  id: number;
  couple_id: number;
  sender_id: number;
  client_id: string | null;
  type: MessageType;
  body: string | null;
  media_id: number | null;
  meta: string | null;
  reply_to: number | null;
  view_once: number;
  viewed_at: number | null;
  edited_at: number | null;
  deleted_at: number | null;
  created_at: number;
  delivered_at: number | null;
  read_at: number | null;
}

export interface MediaRow {
  id: number;
  uploader_id: number;
  file: string;
  mime: string;
  name: string | null;
  size: number;
  created_at: number;
}

export const mediaUrl = (id: number) => `/api/media/${id}`;

const placeholders = (n: number) => Array(n).fill("?").join(",");

function toMediaInfo(m: MediaRow): MediaInfo {
  return { id: m.id, mime: m.mime, name: m.name, size: m.size, url: mediaUrl(m.id) };
}

/** Turns rows into API messages, with reactions, stars, replies and media for one viewer. */
export async function hydrate(rows: MessageRow[], viewerId: number): Promise<Message[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const replyIds = [...new Set(rows.map((r) => r.reply_to).filter((v): v is number => v != null))];

  const replies = new Map(
    (replyIds.length ? await all<MessageRow>(`SELECT * FROM messages WHERE id IN (${placeholders(replyIds.length)})`, ...replyIds) : []).map(
      (r) => [r.id, r],
    ),
  );
  const mediaIds = [
    ...new Set([...rows, ...replies.values()].map((r) => r.media_id).filter((v): v is number => v != null)),
  ];
  const media = new Map(
    (mediaIds.length ? await all<MediaRow>(`SELECT * FROM media WHERE id IN (${placeholders(mediaIds.length)})`, ...mediaIds) : []).map(
      (m) => [m.id, m],
    ),
  );
  const reactions = await all<{ message_id: number; user_id: number; emoji: string }>(
    `SELECT message_id, user_id, emoji FROM reactions WHERE message_id IN (${placeholders(ids.length)}) ORDER BY created_at`,
    ...ids,
  );
  const starred = new Set(
    (await all<{ message_id: number }>(
      `SELECT message_id FROM stars WHERE user_id = ? AND message_id IN (${placeholders(ids.length)})`,
      viewerId,
      ...ids,
    )).map((s) => s.message_id),
  );

  return rows.map((r) => {
    const deleted = r.deleted_at != null;
    const reply = r.reply_to != null ? replies.get(r.reply_to) : undefined;
    const m = r.media_id != null ? media.get(r.media_id) : undefined;
    let replyTo: ReplyPreview | null = null;
    if (reply) {
      const rm = reply.media_id != null ? media.get(reply.media_id) : undefined;
      const replyDeleted = reply.deleted_at != null;
      replyTo = {
        id: reply.id,
        senderId: reply.sender_id,
        type: reply.type,
        body: replyDeleted ? null : (reply.body?.slice(0, 200) ?? null),
        deleted: replyDeleted,
        mediaUrl: !replyDeleted && rm && !reply.view_once && rm.mime.startsWith("image/") ? mediaUrl(rm.id) : null,
      };
    }
    // A view-once photo is only reachable through /api/messages/[id]/open, so hide its URL.
    const mediaInfo = !deleted && m ? toMediaInfo(m) : null;
    if (mediaInfo && r.view_once) mediaInfo.url = "";
    return {
      id: r.id,
      clientId: r.client_id,
      senderId: r.sender_id,
      type: r.type,
      body: deleted ? null : r.body,
      media: mediaInfo,
      meta: !deleted && r.meta ? (JSON.parse(r.meta) as MessageMeta) : null,
      replyTo: deleted ? null : replyTo,
      viewOnce: r.view_once === 1,
      viewedAt: r.viewed_at,
      editedAt: r.edited_at,
      deletedAt: r.deleted_at,
      createdAt: r.created_at,
      deliveredAt: r.delivered_at,
      readAt: r.read_at,
      reactions: deleted ? [] : reactions.filter((x) => x.message_id === r.id).map((x) => ({ userId: x.user_id, emoji: x.emoji })),
      starred: starred.has(r.id),
    };
  });
}

export function getMessageRow(id: number) {
  return one<MessageRow>("SELECT * FROM messages WHERE id = ?", id);
}

const VISIBLE = "NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.message_id = m.id AND h.user_id = ?)";

export async function listMessages(coupleId: number, viewerId: number, opts: { before?: number; after?: number; limit: number }) {
  if (opts.after != null) {
    return all<MessageRow>(
      `SELECT * FROM messages m WHERE couple_id = ? AND id > ? AND ${VISIBLE} ORDER BY id ASC LIMIT ?`,
      coupleId,
      opts.after,
      viewerId,
      opts.limit,
    );
  }
  const rows = await all<MessageRow>(
    `SELECT * FROM messages m WHERE couple_id = ? AND id < ? AND ${VISIBLE} ORDER BY id DESC LIMIT ?`,
    coupleId,
    opts.before ?? 2147483647,
    viewerId,
    opts.limit,
  );
  return rows.reverse();
}

export function searchMessages(coupleId: number, viewerId: number, q: string) {
  const like = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
  return all<MessageRow>(
    `SELECT * FROM messages m WHERE couple_id = ? AND deleted_at IS NULL AND type IN ('text', 'file')
       AND (body ILIKE ? ESCAPE '\\' OR media_id IN (SELECT id FROM media WHERE name ILIKE ? ESCAPE '\\'))
       AND ${VISIBLE} ORDER BY id DESC LIMIT 50`,
    coupleId,
    like,
    like,
    viewerId,
  );
}

export async function unreadCount(coupleId: number, viewerId: number) {
  return (
    (await one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM messages m WHERE couple_id = ? AND sender_id != ? AND read_at IS NULL
         AND type != 'system' AND ${VISIBLE}`,
      coupleId,
      viewerId,
      viewerId,
    ))?.n ?? 0
  );
}

/** Sends the current version of a message to both partners (each gets their own view of stars). */
export async function publishMessage(kind: "message" | "message:update", row: MessageRow, userIds: number[]) {
  const items = [];
  for (const userId of userIds) items.push({ userId, event: { t: kind, message: (await hydrate([row], userId))[0] } as const });
  await sendEach(items);
}

export const NUDGES: Record<NudgeKind, { emoji: string; label: string }> = {
  hug: { emoji: "🤗", label: "sent you a hug" },
  kiss: { emoji: "😘", label: "sent you a kiss" },
  miss: { emoji: "🥺", label: "misses you" },
  thinking: { emoji: "💭", label: "is thinking of you" },
  love: { emoji: "❤️", label: "loves you" },
};

export function previewText(row: Pick<MessageRow, "type" | "body" | "meta" | "view_once">, media?: MediaRow) {
  const meta = row.meta ? (JSON.parse(row.meta) as MessageMeta) : null;
  switch (row.type) {
    case "text":
      return row.body ?? "";
    case "image":
      return row.view_once ? "📷 Photo (view once)" : row.body ? `📷 ${row.body}` : "📷 Photo";
    case "video":
      return row.body ? `🎥 ${row.body}` : "🎥 Video";
    case "audio":
      return "🎤 Voice message";
    case "file":
      return `📄 ${media?.name ?? "Document"}`;
    case "nudge": {
      const n = NUDGES[row.body as NudgeKind];
      return n ? `${n.emoji} ${n.label}` : "💗";
    }
    case "call":
      return meta?.status === "missed" ? `📞 Missed ${meta.video ? "video" : "voice"} call` : `📞 ${meta?.video ? "Video" : "Voice"} call`;
    default:
      return row.body ?? "";
  }
}

/**
 * Pushes a notification to the partner when they do not have the app on screen.
 * Runs after the response is sent (`after`), so the sender does not wait for the push service.
 */
export function notifyPartner(sender: UserRow, row: MessageRow) {
  after(async () => {
    const partner = await getPartner(sender);
    if (!partner || (await isActive(partner.id))) return;
    if (row.type === "call" && row.meta && (JSON.parse(row.meta) as MessageMeta).status !== "missed") return;
    const media = row.media_id ? await one<MediaRow>("SELECT * FROM media WHERE id = ?", row.media_id) : undefined;
    await pushToUser(partner.id, {
      title: partner.partner_nickname || sender.name,
      body: previewText(row, media),
      tag: row.type === "nudge" ? "nudge" : "chat",
      url: "/",
      icon: sender.avatar_media_id ? `/api/media/${sender.avatar_media_id}` : undefined,
    });
  });
}
