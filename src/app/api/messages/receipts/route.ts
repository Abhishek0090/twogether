import { handler, HttpError, readJson, requireCouple } from "@/server/api";
import { run } from "@/server/db";
import { sendToUsers } from "@/server/realtime";

/**
 * The browser confirms it received (`delivered`) or showed (`read`) the partner's messages up to `upTo`.
 * The partner's ticks update through a `receipt` event. Your other devices also get it (clears their unread badge).
 */
export const POST = handler(async (req) => {
  const { user, partner, coupleId } = await requireCouple();
  const body = await readJson<{ kind: "delivered" | "read"; upTo: number }>(req);
  const kind = body.kind;
  const upTo = Number(body.upTo);
  if ((kind !== "delivered" && kind !== "read") || !Number.isInteger(upTo) || upTo <= 0) throw new HttpError(400, "Invalid receipt.");
  const at = Date.now();
  const { changes } =
    kind === "read"
      ? await run(
          `UPDATE messages SET read_at = ?, delivered_at = COALESCE(delivered_at, ?)
           WHERE couple_id = ? AND sender_id = ? AND read_at IS NULL AND id <= ?`,
          at,
          at,
          coupleId,
          partner.id,
          upTo,
        )
      : await run(
          "UPDATE messages SET delivered_at = ? WHERE couple_id = ? AND sender_id = ? AND delivered_at IS NULL AND id <= ?",
          at,
          coupleId,
          partner.id,
          upTo,
        );
  if (changes) await sendToUsers(kind === "read" ? [partner.id, user.id] : [partner.id], { t: "receipt", kind, readerId: user.id, upTo, at });
  return Response.json({ ok: true, changed: changes });
});
