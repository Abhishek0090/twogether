import { createSession, hashPassword } from "@/server/auth";
import { clientIp, handler, HttpError, rateLimit, readJson, setSessionCookie, text } from "@/server/api";
import { insert, one } from "@/server/db";
import { newChannelKey } from "@/server/realtime";

export const POST = handler(async (req) => {
  await rateLimit(`register:${clientIp(req)}`, 10, 60 * 60 * 1000);
  const body = await readJson<{ name: string; email: string; password: string }>(req);
  const name = text(body.name, "Name", { max: 40 });
  const email = text(body.email, "Email", { max: 120 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address.");
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 8) throw new HttpError(400, "Password must be at least 8 characters.");
  if (password.length > 200) throw new HttpError(400, "Password is too long.");
  if (await one("SELECT id FROM users WHERE email = ?", email)) throw new HttpError(409, "An account with this email already exists.");

  const id = await insert(
    "INSERT INTO users (email, name, password_hash, channel_key, created_at) VALUES (?, ?, ?, ?, ?)",
    email,
    name,
    hashPassword(password),
    newChannelKey(),
    Date.now(),
  );
  await setSessionCookie(req, await createSession(id));
  return Response.json({ ok: true });
});
