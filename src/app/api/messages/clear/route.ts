import { handler, requireCouple } from "@/server/api";
import { all, run } from "@/server/db";
import { sendToUser } from "@/server/realtime";

/** "Clear chat": hides every current message for you. Your partner keeps theirs. */
export const POST = handler(async () => {
  const { user, coupleId } = await requireCouple();
  const ids = all<{ id: number }>("SELECT id FROM messages WHERE couple_id = ?", coupleId).map((r) => r.id);
  run(
    "INSERT OR IGNORE INTO message_hidden (message_id, user_id) SELECT id, ? FROM messages WHERE couple_id = ?",
    user.id,
    coupleId,
  );
  sendToUser(user.id, { t: "message:hidden", ids });
  return Response.json({ ok: true });
});
