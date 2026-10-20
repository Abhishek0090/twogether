import { handler, requireCouple } from "@/server/api";
import { all, run } from "@/server/db";
import { sendToUser } from "@/server/realtime";

/** "Clear chat": hides every current message for you. Your partner keeps theirs. */
export const POST = handler(async () => {
  const { user, coupleId } = await requireCouple();
  const ids = (await all<{ id: number }>("SELECT id FROM messages WHERE couple_id = ?", coupleId)).map((r) => r.id);
  await run(
    "INSERT INTO message_hidden (message_id, user_id) SELECT id, ? FROM messages WHERE couple_id = ? ON CONFLICT DO NOTHING",
    user.id,
    coupleId,
  );
  await sendToUser(user.id, { t: "message:hidden", ids });
  return Response.json({ ok: true });
});
