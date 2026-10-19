import { randomInt } from "node:crypto";
import { handler, HttpError, requireUser } from "@/server/api";
import { one, run } from "@/server/db";
import { getCouple, getPartner } from "@/server/users";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newCode() {
  for (;;) {
    const code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    if (!one("SELECT id FROM couples WHERE invite_code = ?", code)) return code;
  }
}

/** Returns the user's invite code, creating their one-person couple on first use. */
export const POST = handler(async () => {
  const user = await requireUser();
  if (getPartner(user)) throw new HttpError(409, "You are already connected with your partner.");
  const couple = user.couple_id ? getCouple(user.couple_id) : undefined;
  if (couple?.invite_code) return Response.json({ code: couple.invite_code });
  const code = newCode();
  if (couple) {
    run("UPDATE couples SET invite_code = ? WHERE id = ?", code, couple.id);
  } else {
    const { id } = run("INSERT INTO couples (invite_code, created_at) VALUES (?, ?)", code, Date.now());
    run("UPDATE users SET couple_id = ? WHERE id = ?", id, user.id);
  }
  return Response.json({ code });
});
