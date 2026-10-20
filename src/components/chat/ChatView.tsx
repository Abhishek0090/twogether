"use client";

import { ChevronDown, Lock, Upload } from "lucide-react";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useApp } from "@/components/app/AppProvider";
import { useCall } from "@/components/call/CallProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/client/api";
import { dayLabel, isSameDay } from "@/lib/format";
import type { Message } from "@/lib/types";
import { wallpaperById } from "@/lib/wallpapers";
import { ChatHeader } from "./ChatHeader";
import { Composer, type ComposerHandle } from "./Composer";
import { Lightbox, type LightboxItem } from "./Lightbox";
import { MessageBubble, type BubbleHandlers } from "./MessageBubble";
import { MessageMenu } from "./MessageMenu";
import { SearchPanel } from "./SearchPanel";

/** Set by the Moments screen to open the chat at a given message. */
export const JUMP_KEY = "tg-jump-to";

const noop = () => () => {};
/** False during SSR and hydration, true afterwards. */
const useHydrated = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

const GROUP_GAP_MS = 5 * 60 * 1000;

export function ChatView() {
  const app = useApp();
  const { messages, me, partner, partnerName, loaded, hasMore, hasNewer, unread, couple, react, toast, retry, jumpTo } = app;
  const { startCall } = useCall();
  const hydrated = useHydrated();
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const composer = useRef<ComposerHandle>(null);
  const pinned = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [menuFor, setMenuFor] = useState<Message | null>(null);
  const [searching, setSearching] = useState(false);
  const [highlight, setHighlight] = useState<{ id: number; term?: string } | null>(null);
  const [lightbox, setLightbox] = useState<{ items: LightboxItem[]; index: number; once?: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // undefined until the first load; then where the unread messages started (null if none).
  const [unreadFrom, setUnreadFrom] = useState<{ id: number; count: number } | null | undefined>(undefined);
  const didInitialScroll = useRef(false);

  const { setChatActive } = app;
  useEffect(() => {
    setChatActive(true);
    return () => setChatActive(false);
  }, [setChatActive]);

  // Remember where the unread messages started when the chat opened, for the "N unread" divider.
  if (loaded && unreadFrom === undefined) {
    const firstUnread = messages.find((m) => m.id > 0 && m.senderId !== me.id && !m.readAt && m.type !== "system");
    setUnreadFrom(firstUnread ? { id: firstUnread.id, count: messages.filter((m) => m.id >= firstUnread.id && m.senderId !== me.id).length } : null);
  }

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // First paint: jump to the unread divider or the bottom.
  useLayoutEffect(() => {
    if (!loaded || didInitialScroll.current || !messages.length) return;
    didInitialScroll.current = true;
    const target = unreadFrom ? scroller.current?.querySelector(`[data-unread]`) : null;
    if (target) target.scrollIntoView({ block: "start" });
    else scrollToBottom();
  }, [loaded, messages.length, unreadFrom, scrollToBottom]);

  // Keep position when older messages are prepended; follow the bottom when new ones arrive.
  const firstId = messages.find((m) => m.id > 0)?.id;
  const lastKey = messages.length ? `${messages[messages.length - 1].id}` : "";
  const prev = useRef({ firstId, lastKey, height: 0 });
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const p = prev.current;
    if (p.firstId !== undefined && firstId !== undefined && firstId < p.firstId && p.lastKey === lastKey) {
      el.scrollTop += el.scrollHeight - p.height;
    } else if (p.lastKey !== lastKey && didInitialScroll.current) {
      const last = messages[messages.length - 1];
      if (pinned.current || last?.senderId === me.id) requestAnimationFrame(() => scrollToBottom(true));
    }
    prev.current = { firstId, lastKey, height: el.scrollHeight };
  }, [firstId, lastKey, messages, me.id, scrollToBottom]);

  // Images loading in change the height; stay glued to the bottom if we were there.
  useEffect(() => {
    const el = content.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (pinned.current) scrollToBottom();
      prev.current.height = scroller.current?.scrollHeight ?? 0;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollToBottom]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    pinned.current = bottom && !hasNewer;
    setAtBottom(bottom);
    if (el.scrollTop < 300 && hasMore && !loadingOlder) {
      setLoadingOlder(true);
      void app.loadOlder().finally(() => setLoadingOlder(false));
    }
  };

  // Scroll to and flash a message after jumping to it (search, reply quotes).
  useEffect(() => {
    if (!highlight) return;
    const el = scroller.current?.querySelector(`[data-mid="${highlight.id}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = setTimeout(() => setHighlight((h) => (h?.id === highlight.id ? { id: -1, term: h.term } : h)), 1800);
    return () => clearTimeout(t);
  }, [highlight, messages]);

  const jump = useCallback(
    async (id: number, term?: string) => {
      const ok = await jumpTo(id);
      if (!ok) return toast({ title: "That message is no longer available" });
      pinned.current = false;
      setHighlight({ id, term });
    },
    [jumpTo, toast],
  );

  // Opened from Moments/Starred: scroll to that message once the chat has loaded.
  const jumpedFromMoments = useRef(false);
  useEffect(() => {
    if (!loaded || jumpedFromMoments.current) return;
    jumpedFromMoments.current = true;
    const id = Number(sessionStorage.getItem(JUMP_KEY));
    sessionStorage.removeItem(JUMP_KEY);
    if (id) queueMicrotask(() => void jump(id));
  }, [loaded, jump]);

  const mediaItems = useMemo(
    () =>
      messages
        .filter((m) => (m.type === "image" || m.type === "video") && !m.viewOnce && !m.deletedAt && (m.media?.url || m.localUrl))
        .map<LightboxItem & { id: number }>((m) => ({
          id: m.id,
          key: m.id,
          src: m.media?.url || m.localUrl!,
          kind: m.type as "image" | "video",
          caption: m.body,
          from: m.senderId === me.id ? "You" : partnerName,
          at: m.createdAt,
          downloadName: m.media?.name ?? undefined,
        })),
    [messages, me.id, partnerName],
  );

  const mediaRef = useRef(mediaItems);
  useEffect(() => {
    mediaRef.current = mediaItems;
  }, [mediaItems]);

  const handlers: BubbleHandlers = useMemo(
    () => ({
      onMenu: (m) => setMenuFor(m),
      onReply: (m) => {
        setEditing(null);
        setReplyTo(m);
      },
      onReact: (m, emoji) => void react(m.id, emoji).catch(() => {}),
      onJump: (id) => void jump(id),
      onOpenMedia: (m) => {
        const items = mediaRef.current;
        const index = items.findIndex((i) => i.id === m.id);
        if (index >= 0) setLightbox({ items, index });
      },
      onOpenViewOnce: async (m) => {
        try {
          // The server marks it opened and returns a 60-second link; keep the file only in memory.
          const { url: link } = await api<{ url: string }>(`/api/messages/${m.id}/open`, { method: "POST" });
          const res = await fetch(link, { cache: "no-store" });
          if (!res.ok) throw new Error("Couldn't load it. Check your connection.");
          const url = URL.createObjectURL(await res.blob());
          setLightbox({ items: [{ key: m.id, src: url, kind: m.type === "video" ? "video" : "image", from: partnerName, at: m.createdAt }], index: 0, once: url });
        } catch (e) {
          toast({ title: "Can't open", body: (e as Error).message, tone: "error" });
        }
      },
      onRetry: (m) => m.clientId && retry(m.clientId),
      onCall: (video) => void startCall(video),
    }),
    [jump, partnerName, react, retry, startCall, toast],
  );

  const wallpaper = wallpaperById(couple.wallpaper);
  const visible = messages;

  return (
    <div
      className="flex h-full flex-col"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const files = [...e.dataTransfer.files];
        if (files.length) composer.current?.addFiles(files);
      }}
    >
      <ChatHeader onSearch={() => setSearching(true)} />

      <div className="relative min-h-0 flex-1">
        <div
          className="absolute inset-0 [background-image:var(--wp-light)] dark:[background-image:var(--wp-dark)]"
          style={{ "--wp-light": wallpaper.light, "--wp-dark": wallpaper.dark, backgroundSize: "120px 120px, 100% 100%" } as React.CSSProperties}
          aria-hidden
        />
        <div ref={scroller} onScroll={onScroll} className="scrollbar-thin absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain" role="log" aria-label="Messages" aria-live="polite">
          <div ref={content} className="mx-auto flex min-h-full flex-col justify-end py-3">
            {!loaded ? (
              <div className="flex flex-1 items-center justify-center text-rose-500">
                <Spinner className="size-7" />
              </div>
            ) : (
              <>
                {hasMore ? (
                  <div className="flex justify-center py-3 text-zinc-400">{loadingOlder && <Spinner />}</div>
                ) : (
                  <div className="mx-auto my-3 flex max-w-xs items-center gap-2 rounded-xl bg-amber-50/90 px-3 py-2 text-center text-xs text-amber-800 shadow-sm dark:bg-amber-500/10 dark:text-amber-200">
                    <Lock className="size-3.5 shrink-0" />
                    Only the two of you can see this chat.
                  </div>
                )}
                {visible.filter((m) => m.type !== "system").length === 0 && (
                  <div className="mx-auto my-8 flex max-w-xs animate-slide-up flex-col items-center gap-3 rounded-3xl bg-white/85 p-6 text-center shadow-sm backdrop-blur dark:bg-night-2/85">
                    <div className="flex -space-x-3">
                      <Avatar src={me.avatarUrl} name={me.name} size={56} className="rounded-full ring-4 ring-white dark:ring-night-2" />
                      <Avatar src={partner.avatarUrl} name={partnerName} size={56} className="rounded-full ring-4 ring-white dark:ring-night-2" />
                    </div>
                    <p className="font-semibold">Your private space with {partnerName}</p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Send the first message, a voice note, or tap the heart to send a hug.</p>
                  </div>
                )}
                {visible.map((m, i) => {
                  const before = visible[i - 1];
                  const newDay = !before || !isSameDay(before.createdAt, m.createdAt);
                  const first =
                    newDay || !before || before.senderId !== m.senderId || before.type === "system" || m.createdAt - before.createdAt > GROUP_GAP_MS;
                  return (
                    <Fragment key={m.clientId && m.senderId === me.id ? m.clientId : m.id}>
                      {newDay && (
                        <div className="sticky top-2 z-10 my-2 flex justify-center">
                          <span className="rounded-lg bg-white/90 px-3 py-1 text-xs font-medium text-zinc-600 shadow-sm backdrop-blur dark:bg-night-3/90 dark:text-zinc-300" suppressHydrationWarning>
                            {dayLabel(m.createdAt)}
                          </span>
                        </div>
                      )}
                      {unreadFrom?.id === m.id && (
                        <div data-unread className="my-2 flex justify-center bg-white/50 py-1 dark:bg-white/5">
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-rose-600 shadow-sm dark:bg-night-3 dark:text-rose-300">
                            {unreadFrom.count} unread message{unreadFrom.count === 1 ? "" : "s"}
                          </span>
                        </div>
                      )}
                      <MessageBubble
                        message={m}
                        mine={m.senderId === me.id}
                        meId={me.id}
                        partnerName={partnerName}
                        first={first}
                        highlighted={highlight?.id === m.id}
                        searchTerm={highlight?.term}
                        {...handlers}
                      />
                    </Fragment>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {(!atBottom || hasNewer) && loaded && (
          <button
            onClick={async () => {
              if (hasNewer) await app.backToLatest();
              pinned.current = true;
              setHighlight(null);
              requestAnimationFrame(() => scrollToBottom(true));
            }}
            className="absolute right-4 bottom-4 z-10 flex size-11 animate-pop items-center justify-center rounded-full bg-white text-zinc-600 shadow-lg ring-1 ring-zinc-900/5 dark:bg-night-3 dark:text-zinc-200 dark:ring-white/10"
            aria-label="Scroll to latest messages"
          >
            <ChevronDown className="size-5" />
            {unread > 0 && (
              <span className="absolute -top-1.5 -right-1 min-w-5 rounded-full bg-rose-500 px-1.5 text-center text-[11px] leading-5 font-bold text-white">{unread}</span>
            )}
          </button>
        )}

        {dragging && (
          <div className="pointer-events-none absolute inset-3 z-20 flex flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-rose-400 bg-rose-50/90 text-rose-600 dark:bg-rose-950/80 dark:text-rose-200">
            <Upload className="size-8" />
            <p className="font-semibold">Drop to send to {partnerName}</p>
          </div>
        )}

        {searching && (
          <SearchPanel
            onClose={() => setSearching(false)}
            onPick={(m, term) => {
              setSearching(false);
              void jump(m.id, term);
            }}
          />
        )}
      </div>

      {hydrated && (
        <Composer
          ref={composer}
          replyTo={replyTo}
          editing={editing}
          onCancelReply={() => setReplyTo(null)}
          onDoneEditing={() => setEditing(null)}
        />
      )}

      <MessageMenu
        message={menuFor}
        meId={me.id}
        onClose={() => setMenuFor(null)}
        onReact={(m, e) => void app.react(m.id, e).catch(() => {})}
        onReply={(m) => {
          setEditing(null);
          setReplyTo(m);
        }}
        onEdit={(m) => {
          setReplyTo(null);
          setEditing(m);
        }}
        onStar={(m) => void app.star(m.id, !m.starred).catch(() => {})}
        onDelete={(m, scope) => void app.remove(m.id, scope).catch((e) => app.toast({ title: "Couldn't delete", body: (e as Error).message, tone: "error" }))}
        onCopy={(m) => {
          void navigator.clipboard?.writeText(m.body ?? "");
          app.toast({ title: "Copied" });
        }}
      />

      {lightbox && (
        <Lightbox
          items={lightbox.items}
          index={lightbox.index}
          allowDownload={!lightbox.once}
          onIndex={(index) => setLightbox((l) => (l ? { ...l, index } : l))}
          onClose={() => {
            if (lightbox.once) URL.revokeObjectURL(lightbox.once);
            setLightbox(null);
          }}
        />
      )}
    </div>
  );
}
