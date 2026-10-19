"use client";

import { ArrowLeft, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { previewOf, useApp } from "@/components/app/AppProvider";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/client/api";
import { dayLabel, formatTime } from "@/lib/format";
import type { Message } from "@/lib/types";
import { MessageText } from "./MessageText";

export function SearchPanel({ onClose, onPick }: { onClose(): void; onPick(m: Message, term: string): void }) {
  const { me, partnerName } = useApp();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Message[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      api<{ messages: Message[] }>(`/api/messages?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((r) => setResults(r.messages))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  const term = q.trim();
  return (
    <div className="absolute inset-0 z-30 flex animate-fade flex-col bg-white dark:bg-night-2">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200/60 px-2 pt-safe dark:border-white/5">
        <div className="flex h-16 flex-1 items-center gap-2">
          <button className="icon-btn" onClick={onClose} aria-label="Close search">
            <ArrowLeft className="size-5" />
          </button>
          <div className="flex flex-1 items-center gap-2 rounded-full bg-zinc-100 px-4 dark:bg-white/5">
            <Search className="size-4 text-zinc-400" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && onClose()}
              placeholder="Search messages"
              className="h-10 flex-1 bg-transparent outline-none"
              aria-label="Search messages"
            />
            {loading && <Spinner className="size-4 text-zinc-400" />}
          </div>
        </div>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto">
        {term.length < 2 ? (
          <p className="p-8 text-center text-sm text-zinc-500">Type at least 2 letters to search your chat.</p>
        ) : results && !results.length && !loading ? (
          <p className="p-8 text-center text-sm text-zinc-500">No messages found for &quot;{term}&quot;.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-white/5">
            {(results ?? []).map((m) => (
              <li key={m.id}>
                <button onClick={() => onPick(m, term)} className="w-full px-5 py-3 text-left hover:bg-zinc-50 dark:hover:bg-white/5">
                  <div className="mb-0.5 flex justify-between text-xs text-zinc-500">
                    <span className="font-semibold text-rose-600 dark:text-rose-300">{m.senderId === me.id ? "You" : partnerName}</span>
                    <span>
                      {dayLabel(m.createdAt)}, {formatTime(m.createdAt)}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm">{m.type === "text" ? <MessageText text={m.body ?? ""} highlight={term} /> : previewOf(m)}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
