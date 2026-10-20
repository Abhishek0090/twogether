import { handler, idParam, readJson, requireCouple } from "@/server/api";
import { run } from "@/server/db";
import { sendToUsers } from "@/server/realtime";
import { listBucket } from "@/server/together";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (req, ctx: Ctx) => {
  const { user, partner, coupleId } = await requireCouple();
  const { done } = await readJson<{ done: boolean }>(req);
  await run(
    "UPDATE bucket_items SET done_at = ?, done_by = ? WHERE id = ? AND couple_id = ?",
    done ? Date.now() : null,
    done ? user.id : null,
    await idParam(ctx),
    coupleId,
  );
  await sendToUsers([user.id, partner.id], { t: "refresh", what: "bucket" });
  return Response.json({ items: await listBucket(coupleId) });
});

export const DELETE = handler(async (_req, ctx: Ctx) => {
  const { user, partner, coupleId } = await requireCouple();
  await run("DELETE FROM bucket_items WHERE id = ? AND couple_id = ?", await idParam(ctx), coupleId);
  await sendToUsers([user.id, partner.id], { t: "refresh", what: "bucket" });
  return Response.json({ items: await listBucket(coupleId) });
});
