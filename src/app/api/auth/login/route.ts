import { createSession, verifyPassword } from "@/server/auth";
import { clientIp, handler, HttpError, rateLimit, readJson, setSessionCookie } from "@/server/api";
import { one } from "@/server/db";
import type { UserRow } from "@/server/users";

export const POST = handler(async (req) => {
  const body = await readJson<{ email: string; password: string }>(req);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  await rateLimit(`login:${clientIp(req)}:${email}`, 8, 15 * 60 * 1000);
  const user = await one<UserRow>("SELECT * FROM users WHERE email = ?", email);
  if (!user || typeof body.password !== "string" || !verifyPassword(body.password, user.password_hash)) {
    throw new HttpError(401, "Wrong email or password.");
  }
  await setSessionCookie(req, await createSession(user.id));
  return Response.json({ ok: true });
});
