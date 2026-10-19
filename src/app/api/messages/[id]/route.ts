import { rmSync } from "node:fs";
import { join } from "node:path";
import { DELETE_WINDOW_MS, EDIT_WINDOW_MS } from "@/lib/limits";
import { handler, HttpError, idParam, readJson, requireCouple } from "@/server/api";
import { one, run, tx, UPLOAD_DIR } from "@/server/db";
import { getMessageRow, publishMessage } from "@/server/messages";
import { sendToUser } from "@/server/realtime";

type Ctx = { params: Promise<{ id: string }> };

async function load(ctx: Ctx) {
  const session = await requireCouple();
  const row = getMessageRow(await idParam(ctx));
  if (!row || row.couple_id !== session.coupleId) throw new HttpError(404, "Message not found.");
  return { ...session, row };
}

/** Edit your own text message within 15 minutes. */
export const PATCH = handler(async (req, ctx: Ctx) => {
  const { user, partner, row } = await load(ctx);
  const b = await readJson<{ body: string }>(req);
  if (row.sender_id !== user.id || row.type !== "text" || row.deleted_at) throw new HttpError(403, "You can only edit your own messages.");
  if (Date.now() - row.created_at > EDIT_WINDOW_MS) throw new HttpError(403, "Messages can only be edited for 15 minutes.");
  const body = typeof b.body === "string" ? b.body.trim() : "";
  if (!body || body.length > 4000) throw new HttpError(400, "Message must be 1 to 4000 characters.");
  if (body !== row.body) run("UPDATE messages SET body = ?, edited_at = ? WHERE id = ?", body, Date.now(), row.id);
  publishMessage("message:update", getMessageRow(row.id)!, [user.id, partner.id]);
  return Response.json({ ok: true });
});

/** ?scope=me hides the message for you; ?scope=everyone deletes your own message for both. */
export const DELETE = handler(async (req, ctx: Ctx) => {
  const { user, partner, row } = await load(ctx);
  const scope = new URL(req.url).searchParams.get("scope");

  if (scope === "everyone") {
    if (row.sender_id !== user.id || row.type === "system") throw new HttpError(403, "You can only delete your own messages for everyone.");
    if (Date.now() - row.created_at > DELETE_WINDOW_MS) throw new HttpError(403, "Messages can be deleted for everyone within 48 hours.");
    const file = tx(() => {
      const media = row.media_id ? one<{ file: string }>("SELECT file FROM media WHERE id = ?", row.media_id) : undefined;
      run("UPDATE messages SET deleted_at = ?, body = NULL, media_id = NULL, meta = NULL WHERE id = ?", Date.now(), row.id);
      run("DELETE FROM reactions WHERE message_id = ?", row.id);
      if (row.media_id) run("DELETE FROM media WHERE id = ?", row.media_id);
      return media?.file;
    });
    if (file) rmSync(join(UPLOAD_DIR, file), { force: true });
    publishMessage("message:update", getMessageRow(row.id)!, [user.id, partner.id]);
    return Response.json({ ok: true });
  }

  run("INSERT OR IGNORE INTO message_hidden (message_id, user_id) VALUES (?, ?)", row.id, user.id);
  sendToUser(user.id, { t: "message:hidden", ids: [row.id] });
  return Response.json({ ok: true });
});
