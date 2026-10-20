// Couple features: special dates, bucket list and the daily question.
import { questionForDay } from "@/lib/questions";
import type { BucketItem, DailyQuestion, SpecialDate } from "@/lib/types";
import { all, one } from "./db";

interface DateRow {
  id: number;
  title: string;
  date: string;
  emoji: string;
  yearly: number;
  created_by: number;
}

export async function listDates(coupleId: number): Promise<SpecialDate[]> {
  return (await all<DateRow>("SELECT * FROM special_dates WHERE couple_id = ? ORDER BY date", coupleId)).map((r) => ({
    id: r.id,
    title: r.title,
    date: r.date,
    emoji: r.emoji,
    yearly: r.yearly === 1,
    createdBy: r.created_by,
  }));
}

interface BucketRow {
  id: number;
  title: string;
  done_at: number | null;
  done_by: number | null;
  created_by: number;
  created_at: number;
}

export async function listBucket(coupleId: number): Promise<BucketItem[]> {
  return (await all<BucketRow>(
    "SELECT * FROM bucket_items WHERE couple_id = ? ORDER BY done_at IS NOT NULL, COALESCE(done_at, 0) DESC, id DESC",
    coupleId,
  )).map((r) => ({
    id: r.id,
    title: r.title,
    doneAt: r.done_at,
    doneBy: r.done_by,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));
}

/** Today's date (UTC) as YYYY-MM-DD; both partners share the same question even across time zones. */
export const today = () => new Date().toISOString().slice(0, 10);

export async function dailyQuestion(coupleId: number, userId: number, day = today()): Promise<DailyQuestion> {
  const answers = await all<{ user_id: number; answer: string }>(
    "SELECT user_id, answer FROM daily_answers WHERE couple_id = ? AND day = ?",
    coupleId,
    day,
  );
  const mine = answers.find((a) => a.user_id === userId)?.answer ?? null;
  const theirs = answers.find((a) => a.user_id !== userId)?.answer ?? null;
  return {
    day,
    question: questionForDay(day),
    myAnswer: mine,
    partnerAnswer: mine ? theirs : null,
    partnerAnswered: theirs != null,
  };
}

/** How many days in a row (ending today or yesterday) both partners answered. */
export async function questionStreak(coupleId: number) {
  const days = (await all<{ day: string }>(
    "SELECT day FROM daily_answers WHERE couple_id = ? GROUP BY day HAVING COUNT(*) = 2 ORDER BY day DESC LIMIT 400",
    coupleId,
  )).map((r) => r.day);
  let streak = 0;
  const cursor = new Date(today() + "T00:00:00Z");
  if (days[0] !== today()) cursor.setUTCDate(cursor.getUTCDate() - 1);
  for (const day of days) {
    if (day !== cursor.toISOString().slice(0, 10)) break;
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export async function answeredCount(coupleId: number) {
  return (
    (await one<{ n: number }>(
      "SELECT COUNT(*) AS n FROM (SELECT day FROM daily_answers WHERE couple_id = ? GROUP BY day HAVING COUNT(*) = 2) AS done",
      coupleId,
    ))?.n ?? 0
  );
}
