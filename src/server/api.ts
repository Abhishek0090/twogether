import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_MAX_AGE, userFromToken } from "./auth";
import { one, run } from "./db";
import { getPartner } from "./users";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Rejects cross-site writes. Cookies are SameSite=Lax already; this closes the gap for old browsers. */
function checkOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (new URL(origin).host !== host) throw new HttpError(403, "Cross-site request blocked");
}

/** Wraps a route handler with origin checks and JSON error responses. */
export function handler<Ctx = unknown>(fn: (req: Request, ctx: Ctx) => Promise<Response> | Response) {
  return async (req: Request, ctx: Ctx) => {
    try {
      checkOrigin(req);
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
      console.error(err);
      return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}

export async function currentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return userFromToken(token);
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Please sign in again.");
  return user;
}

export async function requireCouple() {
  const user = await requireUser();
  const partner = user.couple_id ? await getPartner(user) : undefined;
  if (!user.couple_id || !partner) throw new HttpError(409, "You are not connected with your partner yet.");
  return { user, partner, coupleId: user.couple_id };
}

export async function readJson<T>(req: Request): Promise<Partial<T>> {
  try {
    const data = await req.json();
    return data && typeof data === "object" ? data : {};
  } catch {
    throw new HttpError(400, "Invalid request body.");
  }
}

/** Trims a string field and enforces a length range. */
export function text(value: unknown, field: string, { min = 1, max = 200 } = {}) {
  const s = typeof value === "string" ? value.trim() : "";
  if (s.length < min) throw new HttpError(400, `${field} is required.`);
  if (s.length > max) throw new HttpError(400, `${field} is too long (max ${max} characters).`);
  return s;
}

export async function idParam(ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, "Not found.");
  return id;
}

export async function setSessionCookie(req: Request, token: string) {
  const secure = req.headers.get("x-forwarded-proto") === "https" || new URL(req.url).protocol === "https:";
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

/**
 * Fixed-window limiter, e.g. for login attempts. Stored in the database because serverless
 * functions do not share memory between requests.
 */
export async function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  await run(
    `INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.reset_at < ? THEN 1 ELSE rate_limits.count + 1 END,
       reset_at = CASE WHEN rate_limits.reset_at < ? THEN excluded.reset_at ELSE rate_limits.reset_at END`,
    key,
    now + windowMs,
    now,
    now,
  );
  const row = await one<{ count: number }>("SELECT count FROM rate_limits WHERE key = ?", key);
  if (row && row.count > limit) throw new HttpError(429, "Too many attempts. Please wait a few minutes.");
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
}
