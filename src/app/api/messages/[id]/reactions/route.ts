import { handler, HttpError, idParam, readJson, requireCouple } from "@/server/api";
import { run } from "@/server/db";
import { getMessageRow, publishMessage } from "@/server/messages";

type Ctx = { params: Promise<{ id: string }> };

/** Sets, changes or (with emoji: null) removes your reaction. */
export const POST = handler(async (req, ctx: Ctx) => {
  const { user, partner, coupleId } = await requireCouple();
  const row = await getMessageRow(await idParam(ctx));
  if (!row || row.couple_id !== coupleId || row.deleted_at || row.type === "system") throw new HttpError(404, "Message not found.");
  const { emoji } = await readJson<{ emoji: string | null }>(req);
  if (emoji) {
    if (typeof emoji !== "string" || emoji.length > 16) throw new HttpError(400, "Invalid reaction.");
    await run(
      `INSERT INTO reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = excluded.emoji, created_at = excluded.created_at`,
      row.id,
      user.id,
      emoji,
      Date.now(),
    );
  } else {
    await run("DELETE FROM reactions WHERE message_id = ? AND user_id = ?", row.id, user.id);
  }
  await publishMessage("message:update", row, [user.id, partner.id]);
  return Response.json({ ok: true });
});
