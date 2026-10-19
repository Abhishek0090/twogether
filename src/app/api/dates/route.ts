import { handler, HttpError, readJson, requireCouple, text } from "@/server/api";
import { run } from "@/server/db";
import { sendToUsers } from "@/server/realtime";
import { listDates } from "@/server/together";

export const GET = handler(async () => {
  const { coupleId } = await requireCouple();
  return Response.json({ dates: listDates(coupleId) });
});

export const POST = handler(async (req) => {
  const { user, partner, coupleId } = await requireCouple();
  const b = await readJson<{ title: string; date: string; emoji: string; yearly: boolean }>(req);
  const title = text(b.title, "Title", { max: 60 });
  const date = String(b.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw new HttpError(400, "Pick a date.");
  const emoji = b.emoji ? text(b.emoji, "Emoji", { max: 16 }) : "💗";
  run(
    "INSERT INTO special_dates (couple_id, title, date, emoji, yearly, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    coupleId,
    title,
    date,
    emoji,
    b.yearly === false ? 0 : 1,
    user.id,
    Date.now(),
  );
  sendToUsers([user.id, partner.id], { t: "refresh", what: "dates" });
  return Response.json({ dates: listDates(coupleId) });
});
