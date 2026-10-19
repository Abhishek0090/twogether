import { handler, HttpError, readJson, requireUser, text } from "@/server/api";
import { hashPassword, verifyPassword } from "@/server/auth";
import { one, run } from "@/server/db";
import { sendToUser } from "@/server/realtime";
import { getPartner, getUser, toMe } from "@/server/users";

interface ProfileBody {
  name: string;
  partnerNickname: string | null;
  moodEmoji: string | null;
  moodText: string | null;
  avatarMediaId: number | null;
  currentPassword: string;
  newPassword: string;
}

export const PATCH = handler(async (req) => {
  const user = await requireUser();
  const body = await readJson<ProfileBody>(req);

  if (body.name !== undefined) run("UPDATE users SET name = ? WHERE id = ?", text(body.name, "Name", { max: 40 }), user.id);
  if (body.partnerNickname !== undefined) {
    const nick = body.partnerNickname ? text(body.partnerNickname, "Nickname", { max: 30 }) : null;
    run("UPDATE users SET partner_nickname = ? WHERE id = ?", nick, user.id);
  }
  if (body.moodEmoji !== undefined || body.moodText !== undefined) {
    const emoji = body.moodEmoji ? text(body.moodEmoji, "Mood", { max: 16 }) : null;
    const moodText = body.moodText ? text(body.moodText, "Mood text", { max: 60 }) : null;
    run(
      "UPDATE users SET mood_emoji = ?, mood_text = ?, mood_at = ? WHERE id = ?",
      emoji,
      moodText,
      emoji || moodText ? Date.now() : null,
      user.id,
    );
  }
  if (body.avatarMediaId !== undefined) {
    const mediaId = body.avatarMediaId === null ? null : Number(body.avatarMediaId);
    if (mediaId !== null) {
      const media = one<{ mime: string }>("SELECT mime FROM media WHERE id = ? AND uploader_id = ?", mediaId, user.id);
      if (!media?.mime.startsWith("image/")) throw new HttpError(400, "Upload an image for your photo.");
    }
    run("UPDATE users SET avatar_media_id = ? WHERE id = ?", mediaId, user.id);
  }
  if (body.newPassword !== undefined) {
    if (!verifyPassword(String(body.currentPassword ?? ""), user.password_hash)) throw new HttpError(400, "Current password is wrong.");
    if (String(body.newPassword).length < 8) throw new HttpError(400, "New password must be at least 8 characters.");
    run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(String(body.newPassword)), user.id);
  }

  const partner = getPartner(user);
  if (partner) sendToUser(partner.id, { t: "refresh", what: "couple" });
  sendToUser(user.id, { t: "refresh", what: "couple" });
  return Response.json({ me: toMe(getUser(user.id)!) });
});
