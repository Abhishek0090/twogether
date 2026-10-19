const DAY = 24 * 60 * 60 * 1000;

const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const weekday = new Intl.DateTimeFormat(undefined, { weekday: "long" });
const dayMonth = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long" });
const fullDate = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" });
const shortDate = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });

const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export function formatTime(t: number) {
  return time.format(t);
}

/** "Today", "Yesterday", "Monday", "12 March" or "12 March 2025". */
export function dayLabel(t: number, now = Date.now()) {
  const diff = Math.round((startOfDay(now) - startOfDay(t)) / DAY);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return weekday.format(t);
  return new Date(t).getFullYear() === new Date(now).getFullYear() ? dayMonth.format(t) : fullDate.format(t);
}

export function isSameDay(a: number, b: number) {
  return startOfDay(a) === startOfDay(b);
}

export function lastSeenLabel(t: number | null) {
  if (!t) return "offline";
  const label = dayLabel(t);
  if (label === "Today") return `last seen today at ${formatTime(t)}`;
  if (label === "Yesterday") return `last seen yesterday at ${formatTime(t)}`;
  return `last seen ${shortDate.format(t)}`;
}

export function formatDateLong(t: number | string) {
  return fullDate.format(typeof t === "string" ? new Date(t + "T00:00:00") : t);
}

export function formatDuration(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function relativeTime(t: number, now = Date.now()) {
  const s = Math.round((now - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return dayLabel(t, now);
}

/** Whole days between a YYYY-MM-DD date and today, in local time. */
export function daysSince(date: string, now = new Date()) {
  const start = new Date(date + "T00:00:00");
  return Math.floor((startOfDay(now.getTime()) - start.getTime()) / DAY);
}

/** Years, months and days since a YYYY-MM-DD date. */
export function timeTogether(date: string, now = new Date()) {
  const start = new Date(date + "T00:00:00");
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  let days = now.getDate() - start.getDate();
  if (days < 0) {
    months--;
    days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  return { years, months, days };
}

/** Days until the next occurrence of a date (yearly) or until the date itself. Negative once a one-off date has passed. */
export function daysUntil(date: string, yearly: boolean, now = new Date()) {
  const today = startOfDay(now.getTime());
  const d = new Date(date + "T00:00:00");
  if (!yearly) return Math.round((d.getTime() - today) / DAY);
  const next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (next.getTime() < today) next.setFullYear(now.getFullYear() + 1);
  return Math.round((next.getTime() - today) / DAY);
}
