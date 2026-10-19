import { clientIp, handler, HttpError, rateLimit, readJson, requireUser } from "@/server/api";
import { all, one, run, tx } from "@/server/db";
import { getMessageRow, publishMessage } from "@/server/messages";
import { sendToUser, updateCoupleOf } from "@/server/realtime";
import { getPartner, type CoupleRow } from "@/server/users";

export const POST = handler(async (req) => {
  const user = await requireUser();
  rateLimit(`join:${clientIp(req)}`, 20, 15 * 60 * 1000);
  const body = await readJson<{ code: string }>(req);
  const code = String(body.code ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (code.length !== 6) throw new HttpError(400, "Invite codes have 6 letters and numbers.");
  if (getPartner(user)) throw new HttpError(409, "You are already connected with your partner.");

  const couple = one<CoupleRow>("SELECT * FROM couples WHERE invite_code = ?", code);
  if (!couple) throw new HttpError(404, "No one is waiting with that code. Check it and try again.");
  const members = all<{ id: number }>("SELECT id FROM users WHERE couple_id = ?", couple.id);
  if (members.some((m) => m.id === user.id)) throw new HttpError(400, "That is your own code. Send it to your partner instead.");
  if (members.length !== 1) throw new HttpError(409, "This code has already been used.");
  const partnerId = members[0].id;

  const messageId = tx(() => {
    if (user.couple_id) run("DELETE FROM couples WHERE id = ?", user.couple_id); // the user's own unused invite
    run("UPDATE users SET couple_id = ? WHERE id = ?", couple.id, user.id);
    run("UPDATE couples SET invite_code = NULL WHERE id = ?", couple.id);
    return run(
      "INSERT INTO messages (couple_id, sender_id, type, body, created_at) VALUES (?, ?, 'system', ?, ?)",
      couple.id,
      user.id,
      "You are now connected. Say hi 💞",
      Date.now(),
    ).id;
  });

  updateCoupleOf(user.id, couple.id);
  updateCoupleOf(partnerId, couple.id);
  publishMessage("message", getMessageRow(messageId)!, [partnerId]);
  sendToUser(partnerId, { t: "refresh", what: "couple" });
  return Response.json({ ok: true });
});
