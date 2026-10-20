import { randomInt } from "node:crypto";
import { handler, HttpError, requireUser } from "@/server/api";
import { insert, one, run } from "@/server/db";
import { newChannelKey } from "@/server/realtime";
import { getCouple, getPartner } from "@/server/users";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

async function newCode() {
  for (;;) {
    const code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    if (!(await one("SELECT id FROM couples WHERE invite_code = ?", code))) return code;
  }
}

/** Returns the user's invite code, creating their one-person couple on first use. */
export const POST = handler(async () => {
  const user = await requireUser();
  if (await getPartner(user)) throw new HttpError(409, "You are already connected with your partner.");
  const couple = user.couple_id ? await getCouple(user.couple_id) : undefined;
  if (couple?.invite_code) return Response.json({ code: couple.invite_code });
  const code = await newCode();
  if (couple) {
    await run("UPDATE couples SET invite_code = ? WHERE id = ?", code, couple.id);
  } else {
    const id = await insert("INSERT INTO couples (invite_code, channel_key, created_at) VALUES (?, ?, ?)", code, newChannelKey(), Date.now());
    await run("UPDATE users SET couple_id = ? WHERE id = ?", id, user.id);
  }
  return Response.json({ code });
});
