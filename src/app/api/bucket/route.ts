import { handler, readJson, requireCouple, text } from "@/server/api";
import { run } from "@/server/db";
import { sendToUsers } from "@/server/realtime";
import { listBucket } from "@/server/together";

export const GET = handler(async () => {
  const { coupleId } = await requireCouple();
  return Response.json({ items: listBucket(coupleId) });
});

export const POST = handler(async (req) => {
  const { user, partner, coupleId } = await requireCouple();
  const b = await readJson<{ title: string }>(req);
  run(
    "INSERT INTO bucket_items (couple_id, title, created_by, created_at) VALUES (?, ?, ?, ?)",
    coupleId,
    text(b.title, "Idea", { max: 120 }),
    user.id,
    Date.now(),
  );
  sendToUsers([user.id, partner.id], { t: "refresh", what: "bucket" });
  return Response.json({ items: listBucket(coupleId) });
});
