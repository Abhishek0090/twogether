import { after } from "next/server";
import { handler, HttpError, readJson, requireCouple, text } from "@/server/api";
import { one, run } from "@/server/db";
import { pushToUser } from "@/server/push";
import { isActive, sendToUsers } from "@/server/realtime";
import { answeredCount, dailyQuestion, questionStreak, today } from "@/server/together";

export const GET = handler(async () => {
  const { user, coupleId } = await requireCouple();
  return Response.json({
    question: await dailyQuestion(coupleId, user.id),
    streak: await questionStreak(coupleId),
    total: await answeredCount(coupleId),
  });
});

export const POST = handler(async (req) => {
  const { user, partner, coupleId } = await requireCouple();
  const b = await readJson<{ answer: string }>(req);
  const answer = text(b.answer, "Answer", { max: 500 });
  const day = today();
  if (await one("SELECT 1 FROM daily_answers WHERE couple_id = ? AND day = ? AND user_id = ?", coupleId, day, user.id)) {
    throw new HttpError(409, "You already answered today's question.");
  }
  await run(
    "INSERT INTO daily_answers (couple_id, day, user_id, answer, created_at) VALUES (?, ?, ?, ?, ?)",
    coupleId,
    day,
    user.id,
    answer,
    Date.now(),
  );
  await sendToUsers([partner.id, user.id], { t: "refresh", what: "question" });
  after(async () => {
    if (await isActive(partner.id)) return;
    await pushToUser(partner.id, {
      title: partner.partner_nickname || user.name,
      body: "💌 answered today's question. Answer yours to see it!",
      tag: "question",
      url: "/us",
    });
  });
  return Response.json({
    question: await dailyQuestion(coupleId, user.id),
    streak: await questionStreak(coupleId),
    total: await answeredCount(coupleId),
  });
});
