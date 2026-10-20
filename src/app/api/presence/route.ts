import { handler, readJson, requireUser } from "@/server/api";
import { run } from "@/server/db";

/** Keep in step with the 25 s heartbeat in AppProvider: a missed beat or two still counts as on screen. */
const ACTIVE_FOR_MS = 60_000;

/**
 * Heartbeat from the browser while the app is on screen (`visible: true`), and once when it is hidden.
 * The server uses it to decide whether to send a push notification, and for "last seen".
 * Live "online" dots come from Supabase Realtime presence instead, without this endpoint.
 */
export const POST = handler(async (req) => {
  const user = await requireUser();
  const { visible } = await readJson<{ visible: boolean }>(req);
  const now = Date.now();
  await run("UPDATE users SET active_until = ?, last_seen = ? WHERE id = ?", visible ? now + ACTIVE_FOR_MS : 0, now, user.id);
  return Response.json({ ok: true });
});
