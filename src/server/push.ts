import webpush from "web-push";
import { all, kvGet, kvSet, run } from "./db";

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

let cached: VapidKeys | undefined;

/** VAPID keys from the environment, or generated once and stored in the database. */
async function vapidKeys(): Promise<VapidKeys> {
  if (cached) return cached;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    cached = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    return cached;
  }
  const stored = await kvGet("vapid");
  if (stored) {
    cached = JSON.parse(stored) as VapidKeys;
  } else {
    cached = webpush.generateVAPIDKeys();
    await kvSet("vapid", JSON.stringify(cached));
  }
  return cached;
}

export async function vapidPublicKey() {
  return (await vapidKeys()).publicKey;
}

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  icon?: string;
}

interface SubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function saveSubscription(userId: number, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  await run(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    sub.endpoint,
    userId,
    sub.keys.p256dh,
    sub.keys.auth,
    Date.now(),
  );
}

export async function removeSubscription(userId: number, endpoint: string) {
  await run("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?", endpoint, userId);
}

export async function pushToUser(userId: number, payload: PushPayload) {
  const subs = await all<SubscriptionRow>("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?", userId);
  if (!subs.length) return 0;
  const { publicKey, privateKey } = await vapidKeys();
  const subject = process.env.VAPID_SUBJECT || "mailto:hello@twogether.local";
  let delivered = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24, urgency: "high", vapidDetails: { subject, publicKey, privateKey } },
        );
        delivered++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // The browser dropped this subscription; forget it.
        if (status === 404 || status === 410) await run("DELETE FROM push_subscriptions WHERE endpoint = ?", s.endpoint);
        else console.warn("[push] failed:", status ?? err);
      }
    }),
  );
  return delivered;
}
