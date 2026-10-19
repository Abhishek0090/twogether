import { handler, HttpError, readJson, requireUser } from "@/server/api";
import { pushToUser, removeSubscription, saveSubscription, vapidPublicKey } from "@/server/push";

export const GET = handler(async () => {
  await requireUser();
  return Response.json({ publicKey: vapidPublicKey() });
});

interface SubscriptionBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export const POST = handler(async (req) => {
  const user = await requireUser();
  const sub = await readJson<SubscriptionBody>(req);
  if (typeof sub.endpoint !== "string" || !sub.endpoint.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) {
    throw new HttpError(400, "Invalid push subscription.");
  }
  saveSubscription(user.id, sub as SubscriptionBody);
  return Response.json({ ok: true });
});

export const DELETE = handler(async (req) => {
  const user = await requireUser();
  const { endpoint } = await readJson<{ endpoint: string }>(req);
  if (typeof endpoint === "string") removeSubscription(user.id, endpoint);
  return Response.json({ ok: true });
});

/** PUT sends a test notification to all of your devices. */
export const PUT = handler(async () => {
  const user = await requireUser();
  const sent = await pushToUser(user.id, { title: "Twogether", body: "Notifications are working 💞", tag: "test", url: "/settings" });
  return Response.json({ sent });
});
