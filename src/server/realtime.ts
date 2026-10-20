import { randomBytes } from "node:crypto";
import type { ServerEvent } from "@/lib/types";
import { all, one } from "./db";
import { broadcast } from "./supabase";

/**
 * Realtime delivery through Supabase Realtime (Broadcast).
 *
 * Every user listens on their own channel `u:<users.channel_key>`. The key is a long random secret that only
 * that user's browser receives (in the page data after sign-in), so nobody else can subscribe to it.
 * Partners also share `c:<couples.channel_key>` for typing, calls and presence (sent browser to browser).
 */
export const USER_EVENT = "event";

export const newChannelKey = () => randomBytes(24).toString("base64url");

export const userTopic = (channelKey: string) => `u:${channelKey}`;
export const coupleTopic = (channelKey: string) => `c:${channelKey}`;

/** Sends one event to every open tab and device of each user. */
export async function sendToUsers(userIds: number[], event: ServerEvent) {
  if (!userIds.length) return;
  const rows = await all<{ channel_key: string }>(
    `SELECT channel_key FROM users WHERE id IN (${userIds.map(() => "?").join(",")})`,
    ...userIds,
  );
  await broadcast(rows.map((r) => ({ topic: userTopic(r.channel_key), event: USER_EVENT, payload: event })));
}

export async function sendToUser(userId: number, event: ServerEvent) {
  await sendToUsers([userId], event);
}

/** Sends a different event to each user in one request (e.g. each partner's own view of a message). */
export async function sendEach(items: { userId: number; event: ServerEvent }[]) {
  if (!items.length) return;
  const ids = [...new Set(items.map((i) => i.userId))];
  const rows = await all<{ id: number; channel_key: string }>(
    `SELECT id, channel_key FROM users WHERE id IN (${ids.map(() => "?").join(",")})`,
    ...ids,
  );
  const keyOf = new Map(rows.map((r) => [r.id, r.channel_key]));
  await broadcast(
    items.filter((i) => keyOf.has(i.userId)).map((i) => ({ topic: userTopic(keyOf.get(i.userId)!), event: USER_EVENT, payload: i.event })),
  );
}

/** The app is on screen right now (the browser sends a heartbeat every 25 s while visible). */
export async function isActive(userId: number) {
  const row = await one<{ active_until: number }>("SELECT active_until FROM users WHERE id = ?", userId);
  return !!row && row.active_until > Date.now();
}
