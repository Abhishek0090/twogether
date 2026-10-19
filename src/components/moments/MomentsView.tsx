"use client";

/* eslint-disable @next/next/no-img-element -- media is served by our authenticated API */
import { FileText, Link2, Mic, Play, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { previewOf, useApp } from "@/components/app/AppProvider";
import { AudioPlayer } from "@/components/chat/AudioPlayer";
import { JUMP_KEY } from "@/components/chat/ChatView";
import { Lightbox, type LightboxItem } from "@/components/chat/Lightbox";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/client/api";
import { dayLabel, formatBytes, formatDuration, formatTime } from "@/lib/format";
import type { Message } from "@/lib/types";

type Tab = "media" | "files" | "links" | "starred";

const TABS: { id: Tab; label: string }[] = [
  { id: "media", label: "Media" },
  { id: "files", label: "Voice & docs" },
  { id: "links", label: "Links" },
  { id: "starred", label: "Starred" },
];


export function MomentsView({ initialTab }: { initialTab: Tab }) {
  const { me, partnerName, subscribe } = useApp();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [items, setItems] = useState<Message[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const load = useCallback(async (t: Tab, before?: number) => {
    const r = await api<{ messages: Message[]; hasMore: boolean }>(`/api/messages?kind=${t}&limit=60${before ? `&before=${before}` : ""}`);
    return r;
  }, []);

  useEffect(() => {
    let alive = true;
    load(tab)
      .then((r) => {
        if (!alive) return;
        setItems(r.messages);
        setHasMore(r.hasMore);
      })
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [tab, load]);

  // Drop deleted messages live.
  useEffect(
    () =>
      subscribe((e) => {
        if (e.t === "message:update" && (e.message.deletedAt || (tab === "starred" && !e.message.starred))) {
          setItems((list) => list?.filter((m) => m.id !== e.message.id) ?? null);
        }
        if (e.t === "message:hidden") setItems((list) => list?.filter((m) => !e.ids.includes(m.id)) ?? null);
      }),
    [subscribe, tab],
  );

  const more = async () => {
    if (!items?.length) return;
    setLoadingMore(true);
    try {
      const r = await load(tab, items[items.length - 1].id);
      setItems([...items, ...r.messages]);
      setHasMore(r.hasMore);
    } finally {
      setLoadingMore(false);
    }
  };

  const openInChat = (m: Message) => {
    sessionStorage.setItem(JUMP_KEY, String(m.id));
    router.push("/");
  };

  const who = (m: Message) => (m.senderId === me.id ? "You" : partnerName);
  const media = (items ?? []).filter((m) => m.media?.url);
  const lightboxItems: LightboxItem[] = media.map((m) => ({
    key: m.id,
    src: m.media!.url,
    kind: m.type === "video" ? "video" : "image",
    caption: m.body,
    from: who(m),
    at: m.createdAt,
    downloadName: m.media?.name ?? undefined,
  }));

  return (
    <div className="flex h-full flex-col pt-safe">
      <div className="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6">
        <h1 className="px-1 pt-2 text-2xl font-bold">Moments</h1>
        <div className="mt-3 flex gap-1 overflow-x-auto rounded-full bg-zinc-100 p-1 no-scrollbar dark:bg-white/5" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                if (t.id === tab) return;
                setItems(null);
                setTab(t.id);
              }}
              className={`flex-1 rounded-full px-3 py-2 text-sm font-medium whitespace-nowrap transition ${tab === t.id ? "bg-white text-rose-600 shadow-sm dark:bg-night-3 dark:text-rose-300" : "text-zinc-500"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-4 sm:p-6">
          {!items ? (
            <div className="flex justify-center py-16 text-rose-500">
              <Spinner className="size-7" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-zinc-500">
              <p className="text-4xl">{tab === "starred" ? "⭐" : tab === "links" ? "🔗" : tab === "files" ? "🎤" : "📸"}</p>
              <p className="mt-3">
                {tab === "starred"
                  ? "Star messages you love (long-press a message) to keep them here."
                  : tab === "media"
                    ? "Photos and videos you share will show up here."
                    : tab === "links"
                      ? "Links you send each other will show up here."
                      : "Voice notes and documents will show up here."}
              </p>
            </div>
          ) : tab === "media" ? (
            <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
              {media.map((m, i) => (
                <button key={m.id} onClick={() => setLightbox(i)} className="relative aspect-square overflow-hidden rounded-lg bg-zinc-200 dark:bg-white/5" aria-label={`Open ${m.type}`}>
                  {m.type === "image" ? (
                    <img src={m.media!.url} alt="" loading="lazy" className="size-full object-cover transition hover:scale-105" />
                  ) : (
                    <>
                      <video src={`${m.media!.url}#t=0.1`} preload="metadata" muted playsInline className="size-full object-cover" />
                      <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded-full bg-black/50 px-1.5 py-0.5 text-[11px] text-white">
                        <Play className="size-3 fill-current" /> {m.meta?.duration ? formatDuration(m.meta.duration) : ""}
                      </span>
                    </>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((m) => (
                <li key={m.id} className="card p-3">
                  <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                    <span className="font-semibold text-rose-600 dark:text-rose-300">{who(m)}</span>
                    <button onClick={() => openInChat(m)} className="hover:underline">
                      {dayLabel(m.createdAt)}, {formatTime(m.createdAt)}
                    </button>
                  </div>
                  {m.type === "audio" && m.media ? (
                    <div className="flex items-center gap-2">
                      <Mic className="size-4 text-zinc-400" />
                      <AudioPlayer src={m.media.url} duration={m.meta?.duration} peaks={m.meta?.peaks} seed={m.id} mine={m.senderId === me.id} />
                    </div>
                  ) : m.type === "file" && m.media ? (
                    <a href={m.media.url} download={m.media.name ?? true} className="flex items-center gap-3">
                      <span className="flex size-10 items-center justify-center rounded-lg bg-rose-500 text-white">
                        <FileText className="size-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{m.media.name}</span>
                        <span className="text-xs text-zinc-500">{formatBytes(m.media.size)}</span>
                      </span>
                    </a>
                  ) : tab === "links" ? (
                    <div className="space-y-1">
                      {(m.body?.match(/https?:\/\/[^\s<]+/g) ?? []).map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-2 text-sm break-all text-sky-600 hover:underline dark:text-sky-400">
                          <Link2 className="size-4 shrink-0" /> {url}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <button onClick={() => openInChat(m)} className="flex w-full items-start gap-2 text-left">
                      <Star className="mt-0.5 size-4 shrink-0 fill-amber-400 text-amber-400" />
                      <span className="line-clamp-4 text-sm whitespace-pre-wrap">{previewOf(m)}</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {hasMore && (
            <div className="flex justify-center pt-4">
              <button className="btn-soft" onClick={() => void more()} disabled={loadingMore}>
                {loadingMore && <Spinner className="size-4" />} Load more
              </button>
            </div>
          )}
        </div>
      </div>

      {lightbox !== null && <Lightbox items={lightboxItems} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
