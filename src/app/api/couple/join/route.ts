import { clientIp, handler, HttpError, rateLimit, readJson, requireUser } from "@/server/api";
import { all, one, tx } from "@/server/db";
import { getMessageRow, publishMessage } from "@/server/messages";
import { sendToUser } from "@/server/realtime";
import { getPartner, type CoupleRow } from "@/server/users";

export const POST = handler(async (req) => {
  const user = await requireUser();
  await rateLimit(`join:${clientIp(req)}`, 20, 15 * 60 * 1000);
  const body = await readJson<{ code: string }>(req);
  const code = String(body.code ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (code.length !== 6) throw new HttpError(400, "Invite codes have 6 letters and numbers.");
  if (await getPartner(user)) throw new HttpError(409, "You are already connected with your partner.");

  const couple = await one<CoupleRow>("SELECT * FROM couples WHERE invite_code = ?", code);
  if (!couple) throw new HttpError(404, "No one is waiting with that code. Check it and try again.");
  const members = await all<{ id: number }>("SELECT id FROM users WHERE couple_id = ?", couple.id);
  if (members.some((m) => m.id === user.id)) throw new HttpError(400, "That is your own code. Send it to your partner instead.");
  if (members.length !== 1) throw new HttpError(409, "This code has already been used.");
  const partnerId = members[0].id;

  const messageId = await tx(async (db) => {
    if (user.couple_id) await db.run("DELETE FROM couples WHERE id = ?", user.couple_id); // the user's own unused invite
    await db.run("UPDATE users SET couple_id = ? WHERE id = ?", couple.id, user.id);
    await db.run("UPDATE couples SET invite_code = NULL WHERE id = ?", couple.id);
    return db.insert(
      "INSERT INTO messages (couple_id, sender_id, type, body, created_at) VALUES (?, ?, 'system', ?, ?)",
      couple.id,
      user.id,
      "You are now connected. Say hi 💞",
      Date.now(),
    );
  });

  await publishMessage("message", (await getMessageRow(messageId))!, [partnerId]);
  await sendToUser(partnerId, { t: "refresh", what: "couple" });
  return Response.json({ ok: true });
});
