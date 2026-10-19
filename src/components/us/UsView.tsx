"use client";

import { CalendarHeart, Check, Flame, Heart, ListChecks, MessageCircleHeart, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useApp } from "@/components/app/AppProvider";
import { EmojiPicker } from "@/components/chat/EmojiPicker";
import { Avatar } from "@/components/ui/Avatar";
import { Sheet } from "@/components/ui/Sheet";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/client/api";
import { daysSince, daysUntil, formatDateLong, relativeTime, timeTogether } from "@/lib/format";
import type { BucketItem, DailyQuestion, NudgeKind, SpecialDate } from "@/lib/types";

const MOODS = [
  ["😊", "Happy"],
  ["🥰", "In love"],
  ["🤗", "Need a hug"],
  ["😴", "Sleepy"],
  ["🥳", "Excited"],
  ["😌", "Calm"],
  ["😔", "Sad"],
  ["😤", "Stressed"],
  ["🤒", "Not well"],
  ["🍕", "Hungry"],
  ["💼", "Busy"],
  ["🏋️", "Working out"],
] as const;

const NUDGES: { kind: NudgeKind; emoji: string; label: string }[] = [
  { kind: "hug", emoji: "🤗", label: "Hug" },
  { kind: "kiss", emoji: "😘", label: "Kiss" },
  { kind: "miss", emoji: "🥺", label: "Miss you" },
  { kind: "thinking", emoji: "💭", label: "Thinking of you" },
  { kind: "love", emoji: "❤️", label: "Love you" },
];

const noop = () => () => {};
const useHydrated = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

function Section({ title, icon: Icon, action, children }: { title: string; icon: typeof Heart; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Icon className="size-5 text-rose-500" /> {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function TogetherCard({ onEdit }: { onEdit(): void }) {
  const { me, partner, partnerName, couple } = useApp();
  const hydrated = useHydrated();
  const a = couple.anniversary;
  const days = a && hydrated ? daysSince(a) : null;
  const span = a && hydrated ? timeTogether(a) : null;
  const nextAnniversary = a && hydrated ? daysUntil(a, true) : null;
  return (
    <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-rose-500 via-pink-500 to-fuchsia-500 p-6 text-white shadow-xl shadow-rose-500/25">
      <div className="pointer-events-none absolute -top-10 -right-10 text-[160px] leading-none opacity-15 select-none">❤</div>
      <div className="flex items-center gap-3">
        <div className="flex -space-x-3">
          <Avatar src={me.avatarUrl} name={me.name} size={56} className="rounded-full ring-4 ring-white/40" />
          <Avatar src={partner.avatarUrl} name={partnerName} size={56} className="rounded-full ring-4 ring-white/40" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">
            {me.name} & {partnerName}
          </p>
          {a && <p className="text-sm text-white/80">Since {formatDateLong(a)}</p>}
        </div>
        <button onClick={onEdit} className="ml-auto flex size-9 items-center justify-center rounded-full bg-white/15 hover:bg-white/25" aria-label="Edit the day you got together">
          <Pencil className="size-4" />
        </button>
      </div>
      {a ? (
        <div className="mt-6">
          <p className="text-5xl font-bold tracking-tight tabular-nums">{days?.toLocaleString() ?? "..."}</p>
          <p className="text-white/85">days together</p>
          {span && (
            <p className="mt-3 text-sm text-white/85">
              {[span.years && `${span.years} ${span.years === 1 ? "year" : "years"}`, span.months && `${span.months} ${span.months === 1 ? "month" : "months"}`, `${span.days} ${span.days === 1 ? "day" : "days"}`]
                .filter(Boolean)
                .join(", ")}
              {nextAnniversary !== null && (nextAnniversary === 0 ? " - happy anniversary! 🎉" : ` - next anniversary in ${nextAnniversary} days`)}
            </p>
          )}
        </div>
      ) : (
        <button onClick={onEdit} className="mt-6 w-full rounded-2xl bg-white/15 px-4 py-4 text-left font-medium hover:bg-white/25">
          When did your story begin? Set your date to start the counter 💞
        </button>
      )}
    </section>
  );
}

function MoodCard() {
  const { me, partner, partnerName, patchMe, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const hydrated = useHydrated();

  const save = async (emoji: string | null, moodText: string | null) => {
    setOpen(false);
    try {
      const r = await api<{ me: typeof me }>("/api/profile", { method: "PATCH", json: { moodEmoji: emoji, moodText } });
      patchMe(r.me);
    } catch (e) {
      toast({ title: "Couldn't update mood", body: (e as Error).message, tone: "error" });
    }
  };

  const tile = (who: string, emoji: string | null, label: string | null, at: number | null, mine: boolean) => (
    <button
      disabled={!mine}
      onClick={() => {
        setText(me.moodText ?? "");
        setOpen(true);
      }}
      className={`flex flex-1 flex-col items-center gap-1 rounded-2xl p-4 text-center transition ${mine ? "bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/15" : "bg-zinc-100 dark:bg-white/5"}`}
    >
      <span className="text-4xl">{emoji ?? (mine ? "➕" : "🤍")}</span>
      <span className="text-sm font-semibold">{who}</span>
      <span className="line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
        {label ?? (mine ? "Share how you feel" : "No mood yet")}
        {at && hydrated ? ` - ${relativeTime(at)}` : ""}
      </span>
    </button>
  );

  return (
    <Section title="Moods" icon={Heart}>
      <div className="flex gap-3">
        {tile("You", me.moodEmoji, me.moodText, me.moodAt, true)}
        {tile(partnerName, partner.moodEmoji, partner.moodText, partner.moodAt, false)}
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="How are you feeling?">
        <div className="grid grid-cols-4 gap-2">
          {MOODS.map(([emoji, label]) => (
            <button
              key={label}
              onClick={() => void save(emoji, text.trim() || label)}
              className={`flex flex-col items-center gap-1 rounded-2xl p-2 text-xs transition hover:bg-rose-50 dark:hover:bg-rose-500/10 ${me.moodEmoji === emoji ? "bg-rose-100 dark:bg-rose-500/15" : ""}`}
            >
              <span className="text-3xl">{emoji}</span>
              {label}
            </button>
          ))}
        </div>
        <input className="field mt-4" placeholder="Add a note (optional)" value={text} maxLength={60} onChange={(e) => setText(e.target.value)} />
        <p className="mt-2 text-xs text-zinc-500">Pick an emoji to save. {partnerName} sees it on the chat screen.</p>
        {me.moodEmoji && (
          <button className="btn-ghost mt-3 w-full" onClick={() => void save(null, null)}>
            Clear my mood
          </button>
        )}
      </Sheet>
    </Section>
  );
}

function QuestionCard() {
  const { partnerName, subscribe, toast } = useApp();
  const [data, setData] = useState<{ question: DailyQuestion; streak: number; total: number } | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<typeof data>("/api/question").then(setData).catch(() => {}), []);
  useEffect(() => {
    void load();
    return subscribe((e) => e.t === "refresh" && e.what === "question" && void load());
  }, [load, subscribe]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answer.trim()) return;
    setBusy(true);
    try {
      setData(await api<typeof data>("/api/question", { json: { answer } }));
      setAnswer("");
    } catch (err) {
      toast({ title: "Couldn't save", body: (err as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Question of the day"
      icon={MessageCircleHeart}
      action={
        data && data.streak > 0 ? (
          <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            <Flame className="size-3.5" /> {data.streak} day streak
          </span>
        ) : null
      }
    >
      {!data ? (
        <div className="flex justify-center py-6 text-rose-500">
          <Spinner />
        </div>
      ) : (
        <>
          <p className="text-lg leading-snug font-medium">{data.question.question}</p>
          {data.question.myAnswer ? (
            <div className="mt-4 space-y-2">
              <div className="rounded-2xl bg-rose-50 p-3 dark:bg-rose-500/10">
                <p className="text-xs font-semibold text-rose-600 dark:text-rose-300">You</p>
                <p className="text-sm whitespace-pre-wrap">{data.question.myAnswer}</p>
              </div>
              <div className="rounded-2xl bg-violet-50 p-3 dark:bg-violet-500/10">
                <p className="text-xs font-semibold text-violet-600 dark:text-violet-300">{partnerName}</p>
                <p className="text-sm whitespace-pre-wrap">{data.question.partnerAnswer ?? <span className="text-zinc-500 italic">Hasn&apos;t answered yet...</span>}</p>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-4">
              <textarea className="field min-h-24 resize-none" placeholder="Your answer..." value={answer} maxLength={500} onChange={(e) => setAnswer(e.target.value)} />
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-xs text-zinc-500">
                  {data.question.partnerAnswered ? `🔒 ${partnerName} answered. Answer to reveal it!` : `Answers are revealed once you both reply.`}
                </p>
                <button className="btn-primary shrink-0" disabled={busy || !answer.trim()}>
                  {busy && <Spinner className="size-4" />} Answer
                </button>
              </div>
            </form>
          )}
          {data.total > 0 && <p className="mt-3 text-xs text-zinc-500">You have answered {data.total} questions together.</p>}
        </>
      )}
    </Section>
  );
}

function DatesCard({ addOpen, setAddOpen }: { addOpen: boolean; setAddOpen(v: boolean): void }) {
  const { subscribe, toast } = useApp();
  const hydrated = useHydrated();
  const [dates, setDates] = useState<SpecialDate[] | null>(null);
  const [form, setForm] = useState({ title: "", date: "", emoji: "🎂", yearly: true });
  const [picking, setPicking] = useState(false);

  const load = useCallback(() => api<{ dates: SpecialDate[] }>("/api/dates").then((r) => setDates(r.dates)).catch(() => {}), []);
  useEffect(() => {
    void load();
    return subscribe((e) => e.t === "refresh" && e.what === "dates" && void load());
  }, [load, subscribe]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setDates((await api<{ dates: SpecialDate[] }>("/api/dates", { json: form })).dates);
      setAddOpen(false);
      setForm({ title: "", date: "", emoji: "🎂", yearly: true });
    } catch (err) {
      toast({ title: "Couldn't add date", body: (err as Error).message, tone: "error" });
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Remove this date?")) return;
    setDates((await api<{ dates: SpecialDate[] }>(`/api/dates/${id}`, { method: "DELETE" })).dates);
  };

  const sorted = hydrated && dates ? [...dates].map((d) => ({ ...d, until: daysUntil(d.date, d.yearly) })).sort((a, b) => (a.until < 0 ? 1e6 : a.until) - (b.until < 0 ? 1e6 : b.until)) : [];

  return (
    <Section
      title="Countdowns"
      icon={CalendarHeart}
      action={
        <button className="btn-soft px-3 py-1.5" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" /> Add
        </button>
      }
    >
      {!dates ? (
        <div className="flex justify-center py-4 text-rose-500">
          <Spinner />
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-zinc-500">Birthdays, trips, the day you met... add the dates you never want to miss.</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((d) => (
            <li key={d.id} className="group flex items-center gap-3 rounded-2xl bg-zinc-50 p-3 dark:bg-white/5">
              <span className="flex size-11 items-center justify-center rounded-xl bg-white text-2xl shadow-sm dark:bg-night-3">{d.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{d.title}</p>
                <p className="text-xs text-zinc-500">
                  {formatDateLong(d.date)}
                  {d.yearly ? " - every year" : ""}
                </p>
              </div>
              <div className="text-right">
                {d.until === 0 ? (
                  <span className="text-sm font-bold text-rose-600">Today! 🎉</span>
                ) : d.until < 0 ? (
                  <span className="text-xs text-zinc-500">{-d.until} days ago</span>
                ) : (
                  <>
                    <span className="block text-xl leading-none font-bold text-rose-600 tabular-nums dark:text-rose-300">{d.until}</span>
                    <span className="text-[11px] text-zinc-500">{d.until === 1 ? "day" : "days"}</span>
                  </>
                )}
              </div>
              <button className="icon-btn size-8 opacity-60 hover:opacity-100" onClick={() => void remove(d.id)} aria-label={`Remove ${d.title}`}>
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Add a special date">
        <form onSubmit={add} className="space-y-3">
          <div className="flex gap-2">
            <button type="button" className="field w-16 shrink-0 px-0 text-center text-2xl" onClick={() => setPicking((p) => !p)} aria-label="Choose emoji" aria-expanded={picking}>
              {form.emoji}
            </button>
            <input className="field" placeholder="e.g. Her birthday" value={form.title} maxLength={60} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>
          {picking && (
            <div className="overflow-hidden rounded-2xl ring-1 ring-zinc-900/5 dark:ring-white/10">
              <EmojiPicker
                height={300}
                onPick={(emoji) => {
                  setForm((f) => ({ ...f, emoji }));
                  setPicking(false);
                }}
              />
            </div>
          )}
          <input type="date" className="field" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required aria-label="Date" />
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" className="size-5 accent-rose-500" checked={form.yearly} onChange={(e) => setForm({ ...form, yearly: e.target.checked })} />
            Repeats every year
          </label>
          <button className="btn-primary w-full py-3">Save date</button>
        </form>
      </Sheet>
    </Section>
  );
}

function BucketCard() {
  const { me, partnerName, subscribe, toast } = useApp();
  const [items, setItems] = useState<BucketItem[] | null>(null);
  const [title, setTitle] = useState("");

  const load = useCallback(() => api<{ items: BucketItem[] }>("/api/bucket").then((r) => setItems(r.items)).catch(() => {}), []);
  useEffect(() => {
    void load();
    return subscribe((e) => e.t === "refresh" && e.what === "bucket" && void load());
  }, [load, subscribe]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      setItems((await api<{ items: BucketItem[] }>("/api/bucket", { json: { title } })).items);
      setTitle("");
    } catch (err) {
      toast({ title: "Couldn't add", body: (err as Error).message, tone: "error" });
    }
  };
  const toggle = async (item: BucketItem) => {
    setItems((list) => list?.map((i) => (i.id === item.id ? { ...i, doneAt: item.doneAt ? null : Date.now() } : i)) ?? null);
    setItems((await api<{ items: BucketItem[] }>(`/api/bucket/${item.id}`, { method: "PATCH", json: { done: !item.doneAt } })).items);
  };
  const remove = async (item: BucketItem) => {
    setItems((await api<{ items: BucketItem[] }>(`/api/bucket/${item.id}`, { method: "DELETE" })).items);
  };

  const done = items?.filter((i) => i.doneAt).length ?? 0;
  return (
    <Section
      title="Our bucket list"
      icon={ListChecks}
      action={items && items.length > 0 ? <span className="text-xs font-medium text-zinc-500">{done}/{items.length} done</span> : null}
    >
      <form onSubmit={add} className="mb-3 flex gap-2">
        <input className="field py-2.5" placeholder="Something to do together..." value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        <button className="btn-primary shrink-0 px-4" disabled={!title.trim()} aria-label="Add">
          <Plus className="size-5" />
        </button>
      </form>
      {items && items.length > 0 && (
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/5">
          <div className="h-full rounded-full bg-linear-to-r from-rose-500 to-pink-500 transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
      )}
      {!items ? (
        <div className="flex justify-center py-4 text-rose-500">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">Watch the sunrise together, learn to cook pasta, road trip... start your list.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((i) => (
            <li key={i.id} className="group flex items-center gap-3 rounded-xl px-1 py-1.5">
              <button
                onClick={() => void toggle(i)}
                className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition ${i.doneAt ? "border-rose-500 bg-rose-500 text-white" : "border-zinc-300 hover:border-rose-400 dark:border-zinc-600"}`}
                aria-label={i.doneAt ? `Mark "${i.title}" as not done` : `Mark "${i.title}" as done`}
              >
                {i.doneAt && <Check className="size-3.5" strokeWidth={3} />}
              </button>
              <span className={`min-w-0 flex-1 text-[15px] ${i.doneAt ? "text-zinc-400 line-through" : ""}`}>
                {i.title}
                <span className="ml-2 text-[11px] text-zinc-400">{i.createdBy === me.id ? "you" : partnerName}</span>
              </span>
              <button className="icon-btn size-8 opacity-0 group-hover:opacity-60 hover:opacity-100 focus:opacity-100 max-sm:opacity-50" onClick={() => void remove(i)} aria-label={`Delete "${i.title}"`}>
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function UsView() {
  const { send, couple, refreshCouple, toast, partnerName } = useApp();
  const [editDate, setEditDate] = useState(false);
  const [date, setDate] = useState(couple.anniversary ?? "");
  const [addDate, setAddDate] = useState(false);

  const saveAnniversary = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/couple", { method: "PATCH", json: { anniversary: date || null } });
      await refreshCouple();
      setEditDate(false);
    } catch (err) {
      toast({ title: "Couldn't save", body: (err as Error).message, tone: "error" });
    }
  };

  return (
    <div className="scrollbar-thin h-full overflow-y-auto pt-safe">
      <div className="mx-auto max-w-2xl space-y-4 p-4 pb-8 sm:p-6">
        <h1 className="px-1 pt-2 text-2xl font-bold">Us</h1>
        <TogetherCard
          onEdit={() => {
            setDate(couple.anniversary ?? "");
            setEditDate(true);
          }}
        />

        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Send {partnerName} some love</h2>
          <div className="grid grid-cols-5 gap-2">
            {NUDGES.map((n) => (
              <button
                key={n.kind}
                onClick={() => {
                  void send({ type: "nudge", body: n.kind });
                  navigator.vibrate?.(30);
                }}
                className="flex flex-col items-center gap-1.5 rounded-2xl bg-rose-50 px-1 py-3 text-[11px] font-medium text-rose-700 transition hover:bg-rose-100 active:scale-95 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/15"
              >
                <span className="text-3xl">{n.emoji}</span>
                <span className="text-center leading-tight">{n.label}</span>
              </button>
            ))}
          </div>
        </section>

        <MoodCard />
        <QuestionCard />
        <DatesCard addOpen={addDate} setAddOpen={setAddDate} />
        <BucketCard />
      </div>

      <Sheet open={editDate} onClose={() => setEditDate(false)} title="When did it all begin?">
        <form onSubmit={saveAnniversary} className="space-y-3">
          <input type="date" className="field" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} aria-label="Anniversary date" />
          <button className="btn-primary w-full py-3">Save</button>
          {couple.anniversary && (
            <button
              type="button"
              className="btn-ghost w-full"
              onClick={() => {
                setDate("");
              }}
            >
              Clear date
            </button>
          )}
        </form>
      </Sheet>
    </div>
  );
}
