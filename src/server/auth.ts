import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { one, run } from "./db";
import type { UserRow } from "./users";

export const SESSION_COOKIE = "tg_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 60; // 60 days, in seconds

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string) {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(expected, actual);
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  await run(
    "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    sha256(token),
    userId,
    now + SESSION_MAX_AGE * 1000,
    now,
  );
  await run("DELETE FROM sessions WHERE expires_at < ?", now);
  return token;
}

export async function userFromToken(token: string | undefined | null): Promise<UserRow | undefined> {
  if (!token) return undefined;
  return one<UserRow>(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
    sha256(token),
    Date.now(),
  );
}

export async function deleteSession(token: string) {
  await run("DELETE FROM sessions WHERE token_hash = ?", sha256(token));
}
