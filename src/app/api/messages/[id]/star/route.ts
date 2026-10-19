import { handler, HttpError, idParam, readJson, requireCouple } from "@/server/api";
import { run } from "@/server/db";
import { getMessageRow, publishMessage } from "@/server/messages";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler(async (req, ctx: Ctx) => {
  const { user, coupleId } = await requireCouple();
  const row = getMessageRow(await idParam(ctx));
  if (!row || row.couple_id !== coupleId || row.deleted_at) throw new HttpError(404, "Message not found.");
  const { starred } = await readJson<{ starred: boolean }>(req);
  if (starred) run("INSERT OR IGNORE INTO stars (message_id, user_id, created_at) VALUES (?, ?, ?)", row.id, user.id, Date.now());
  else run("DELETE FROM stars WHERE message_id = ? AND user_id = ?", row.id, user.id);
  // Stars are private, so only your own devices hear about it.
  publishMessage("message:update", row, [user.id]);
  return Response.json({ ok: true });
});
