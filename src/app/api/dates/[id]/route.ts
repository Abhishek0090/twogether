import { handler, idParam, requireCouple } from "@/server/api";
import { run } from "@/server/db";
import { sendToUsers } from "@/server/realtime";
import { listDates } from "@/server/together";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = handler(async (_req, ctx: Ctx) => {
  const { user, partner, coupleId } = await requireCouple();
  run("DELETE FROM special_dates WHERE id = ? AND couple_id = ?", await idParam(ctx), coupleId);
  sendToUsers([user.id, partner.id], { t: "refresh", what: "dates" });
  return Response.json({ dates: listDates(coupleId) });
});
