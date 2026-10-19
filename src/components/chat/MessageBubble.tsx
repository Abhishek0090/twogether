"use client";

/* eslint-disable @next/next/no-img-element -- chat media is served by our authenticated API */
import {
  Ban,
  Check,
  CheckCheck,
  ChevronDown,
  CircleAlert,
  Clock,
  Download,
  FileText,
  Phone,
  PhoneMissed,
  Play,
  Reply,
  Star,
  Video,
} from "lucide-react";
import { memo, useRef, useState } from "react";
import { NUDGE_LABEL, previewOf } from "@/components/app/AppProvider";
import { isBigEmoji } from "@/lib/emoji";
import { formatBytes, formatDuration, formatTime } from "@/lib/format";
import type { Message, NudgeKind } from "@/lib/types";
import { AudioPlayer } from "./AudioPlayer";
import { MessageText } from "./MessageText";

export interface BubbleHandlers {
  onMenu(m: Message): void;
  onReply(m: Message): void;
  onReact(m: Message, emoji: string | null): void;
  onJump(id: number): void;
  onOpenMedia(m: Message): void;
  onOpenViewOnce(m: Message): void;
  onRetry(m: Message): void;
  onCall(video: boolean): void;
}

interface Props extends BubbleHandlers {
  message: Message;
  mine: boolean;
  meId: number;
  partnerName: string;
  first: boolean;
  highlighted: boolean;
  searchTerm?: string;
}

const NUDGE_EMOJI: Record<NudgeKind, string> = { hug: "🤗", kiss: "😘", miss: "🥺", thinking: "💭", love: "❤️" };

function Ticks({ m }: { m: Message }) {
  if (m.failed) return <CircleAlert className="size-4 text-red-500" aria-label="Not sent" />;
  if (m.pending) return <Clock className="size-3.5" aria-label="Sending" />;
  if (m.readAt) return <CheckCheck className="size-4 text-sky-500" aria-label="Read" />;
  if (m.deliveredAt) return <CheckCheck className="size-4" aria-label="Delivered" />;
  return <Check className="size-4" aria-label="Sent" />;
}

function Meta({ m, mine, overlay }: { m: Message; mine: boolean; overlay?: boolean }) {
  return (
    <span
      className={`ml-2 inline-flex translate-y-1 items-center gap-1 align-bottom text-[11px] whitespace-nowrap select-none ${
        overlay ? "rounded-full bg-black/35 px-1.5 py-0.5 text-white" : "float-right text-zinc-500 dark:text-zinc-400"
      }`}
    >
      {m.starred && <Star className="size-3 fill-current" aria-label="Starred" />}
      {m.editedAt && !m.deletedAt && <span>edited</span>}
      <time dateTime={new Date(m.createdAt).toISOString()}>{formatTime(m.createdAt)}</time>
      {mine && <Ticks m={m} />}
    </span>
  );
}

function ReplyQuote({ m, meId, partnerName, onJump }: { m: Message; meId: number; partnerName: string; onJump(id: number): void }) {
  const r = m.replyTo!;
  const fromMe = r.senderId === meId;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onJump(r.id);
      }}
      className={`mb-1 flex w-full min-w-40 items-stretch overflow-hidden rounded-xl text-left text-[13px] ${
        fromMe ? "bg-rose-500/10 dark:bg-rose-300/10" : "bg-violet-500/10 dark:bg-violet-300/10"
      }`}
    >
      <span className={`w-1 shrink-0 ${fromMe ? "bg-rose-500" : "bg-violet-500"}`} />
      <span className="min-w-0 flex-1 px-2 py-1.5">
        <span className={`block font-semibold ${fromMe ? "text-rose-600 dark:text-rose-300" : "text-violet-600 dark:text-violet-300"}`}>
          {fromMe ? "You" : partnerName}
        </span>
        <span className="line-clamp-2 text-zinc-600 dark:text-zinc-300">
          {r.deleted ? "This message was deleted" : previewOf({ type: r.type, body: r.body, media: null, meta: null, viewOnce: false, deletedAt: null })}
        </span>
      </span>
      {r.mediaUrl && <img src={r.mediaUrl} alt="" className="size-12 shrink-0 object-cover" />}
    </button>
  );
}

function Reactions({ m, meId, onReact }: { m: Message; meId: number; onReact: Props["onReact"] }) {
  if (!m.reactions.length) return null;
  const groups = new Map<string, number>();
  for (const r of m.reactions) groups.set(r.emoji, (groups.get(r.emoji) ?? 0) + 1);
  const mineEmoji = m.reactions.find((r) => r.userId === meId)?.emoji;
  return (
    <div className="relative z-10 -mt-2 flex gap-1 px-2">
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (mineEmoji) onReact(m, null);
        }}
        className="flex animate-pop items-center gap-0.5 rounded-full bg-white px-1.5 py-0.5 text-sm shadow ring-1 ring-zinc-900/5 dark:bg-night-3 dark:ring-white/10"
        aria-label={mineEmoji ? "Remove your reaction" : "Reactions"}
      >
        {[...groups.entries()].map(([emoji, count]) => (
          <span key={emoji}>
            {emoji}
            {count > 1 && <span className="ml-0.5 text-xs text-zinc-500">{count}</span>}
          </span>
        ))}
      </button>
    </div>
  );
}

function MediaFrame({ m, onOpen, children }: { m: Message; onOpen(): void; children: React.ReactNode }) {
  const w = m.meta?.w || 4;
  const h = m.meta?.h || 3;
  const ratio = Math.min(Math.max(w / h, 0.6), 1.8);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className="relative block w-[min(280px,70vw)] overflow-hidden rounded-xl bg-black/5 dark:bg-white/5"
      style={{ aspectRatio: String(ratio) }}
      aria-label={m.type === "video" ? "Play video" : "Open photo"}
    >
      {children}
      {m.pending && m.progress !== undefined && m.progress < 1 && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/30">
          <svg className="size-12 -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15" fill="none" stroke="white" strokeOpacity=".3" strokeWidth="3" />
            <circle cx="18" cy="18" r="15" fill="none" stroke="white" strokeWidth="3" strokeDasharray={`${m.progress * 94.2} 94.2`} strokeLinecap="round" />
          </svg>
        </span>
      )}
    </button>
  );
}

function Body({ m, mine, h, searchTerm }: { m: Message; mine: boolean; h: BubbleHandlers; searchTerm?: string }) {
  const src = m.localUrl || m.media?.url || "";

  if (m.deletedAt) {
    return (
      <span className="flex items-center gap-1.5 text-zinc-500 italic dark:text-zinc-400">
        <Ban className="size-4" /> {mine ? "You deleted this message" : "This message was deleted"}
        <Meta m={m} mine={mine} />
      </span>
    );
  }

  if (m.viewOnce) {
    const opened = !!m.viewedAt;
    const label = m.type === "video" ? "Video" : "Photo";
    const canOpen = !mine && !opened && !m.pending;
    return (
      <button
        disabled={!canOpen}
        onClick={(e) => {
          e.stopPropagation();
          h.onOpenViewOnce(m);
        }}
        className="flex min-w-44 items-center gap-2.5 py-1 text-left disabled:cursor-default"
      >
        <span className={`flex size-9 items-center justify-center rounded-full border-2 border-dashed text-sm font-bold ${opened ? "border-zinc-400 text-zinc-400" : "border-rose-500 text-rose-500"}`}>
          1
        </span>
        <span className="flex-1">
          <span className="block font-medium">{opened ? "Opened" : label}</span>
          <span className="block text-xs text-zinc-500 dark:text-zinc-400">
            {opened ? `View-once ${label.toLowerCase()}` : mine ? "View once" : `Tap to view - once`}
          </span>
        </span>
        <Meta m={m} mine={mine} />
      </button>
    );
  }

  switch (m.type) {
    case "image":
      return (
        <div>
          <MediaFrame m={m} onOpen={() => h.onOpenMedia(m)}>
            {src && <img src={src} alt={m.body ?? "Photo"} loading="lazy" className="size-full object-cover" draggable={false} />}
            {!m.body && (
              <span className="absolute right-1.5 bottom-1.5">
                <Meta m={m} mine={mine} overlay />
              </span>
            )}
          </MediaFrame>
          {m.body && (
            <p className="px-1 pt-1 break-words whitespace-pre-wrap">
              <MessageText text={m.body} highlight={searchTerm} />
              <Meta m={m} mine={mine} />
            </p>
          )}
        </div>
      );
    case "video":
      return (
        <div>
          <MediaFrame m={m} onOpen={() => h.onOpenMedia(m)}>
            {src && <video src={`${src}#t=0.1`} preload="metadata" muted playsInline className="size-full object-cover" />}
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur">
                <Play className="ml-0.5 size-6 fill-current" />
              </span>
            </span>
            {!!m.meta?.duration && (
              <span className="absolute bottom-1.5 left-2 text-xs font-medium text-white drop-shadow">{formatDuration(m.meta.duration)}</span>
            )}
            {!m.body && (
              <span className="absolute right-1.5 bottom-1.5">
                <Meta m={m} mine={mine} overlay />
              </span>
            )}
          </MediaFrame>
          {m.body && (
            <p className="px-1 pt-1 break-words whitespace-pre-wrap">
              <MessageText text={m.body} highlight={searchTerm} />
              <Meta m={m} mine={mine} />
            </p>
          )}
        </div>
      );
    case "audio":
      return (
        <div>
          {src ? <AudioPlayer src={src} duration={m.meta?.duration} peaks={m.meta?.peaks} seed={Math.abs(m.id)} mine={mine} /> : null}
          <div className="-mt-1 flex justify-end">
            <Meta m={m} mine={mine} />
          </div>
        </div>
      );
    case "file":
      return (
        <div>
          <a
            href={m.media?.url || undefined}
            download={m.media?.name ?? true}
            onClick={(e) => e.stopPropagation()}
            className="flex min-w-52 items-center gap-3 rounded-xl bg-black/5 p-2.5 dark:bg-white/5"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-rose-500 text-white">
              <FileText className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{m.media?.name ?? "Document"}</span>
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                {m.media ? formatBytes(m.media.size) : ""}
                {m.pending && m.progress !== undefined ? ` - ${Math.round(m.progress * 100)}%` : ""}
              </span>
            </span>
            {!m.pending && <Download className="size-5 text-zinc-500" />}
          </a>
          <div className="flex justify-end">
            <Meta m={m} mine={mine} />
          </div>
        </div>
      );
    case "call": {
      const missed = m.meta?.status !== "ended";
      const Icon = m.meta?.video ? Video : missed ? PhoneMissed : Phone;
      return (
        <button
          onClick={(e) => {
            e.stopPropagation();
            h.onCall(!!m.meta?.video);
          }}
          className="flex min-w-48 items-center gap-3 py-0.5 text-left"
        >
          <span className={`flex size-10 items-center justify-center rounded-full ${missed && !mine ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-600"}`}>
            <Icon className="size-5" />
          </span>
          <span className="flex-1">
            <span className="block font-medium">
              {m.meta?.status === "declined" ? "Call declined" : missed ? (mine ? "No answer" : "Missed call") : m.meta?.video ? "Video call" : "Voice call"}
            </span>
            <span className="block text-xs text-zinc-500 dark:text-zinc-400">
              {!missed && m.meta?.duration ? formatDuration(m.meta.duration) : "Tap to call back"}
            </span>
          </span>
          <Meta m={m} mine={mine} />
        </button>
      );
    }
    default: {
      const text = m.body ?? "";
      if (isBigEmoji(text) && !m.replyTo) {
        return (
          <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
            <p className="text-5xl leading-tight">{text}</p>
            <span className="rounded-full bg-white/70 px-1.5 dark:bg-black/30">
              <Meta m={m} mine={mine} />
            </span>
          </div>
        );
      }
      return (
        <p className="break-words whitespace-pre-wrap">
          <MessageText text={text} highlight={searchTerm} />
          <Meta m={m} mine={mine} />
        </p>
      );
    }
  }
}

export const MessageBubble = memo(function MessageBubble(props: Props) {
  const { message: m, mine, meId, partnerName, first, highlighted, searchTerm, ...h } = props;
  const [dx, setDx] = useState(0);
  const touch = useRef<{ x: number; y: number; t: ReturnType<typeof setTimeout> | null; swiping: boolean } | null>(null);
  const lastTap = useRef(0);

  if (m.type === "system") {
    return (
      <div className="my-2 flex justify-center px-4">
        <span className="rounded-xl bg-white/80 px-3 py-1.5 text-center text-xs text-zinc-600 shadow-sm backdrop-blur dark:bg-night-3/80 dark:text-zinc-300">
          {m.body}
        </span>
      </div>
    );
  }

  const interactive = !m.pending && !m.failed;

  const onTouchStart = (e: React.TouchEvent) => {
    if (!interactive) return;
    const t = e.touches[0];
    touch.current = {
      x: t.clientX,
      y: t.clientY,
      swiping: false,
      t: setTimeout(() => {
        navigator.vibrate?.(15);
        h.onMenu(m);
        touch.current = null;
      }, 480),
    };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = touch.current;
    if (!s) return;
    const t = e.touches[0];
    const mx = t.clientX - s.x;
    const my = t.clientY - s.y;
    if (Math.abs(mx) > 8 || Math.abs(my) > 8) {
      if (s.t) clearTimeout(s.t);
      s.t = null;
    }
    if (!s.swiping && Math.abs(my) > Math.abs(mx)) return;
    if (mx > 10) s.swiping = true;
    if (s.swiping) setDx(Math.min(80, Math.max(0, mx)));
  };
  const onTouchEnd = () => {
    const s = touch.current;
    if (s?.t) clearTimeout(s.t);
    if (s?.swiping && dx > 55) {
      navigator.vibrate?.(10);
      h.onReply(m);
    }
    touch.current = null;
    setDx(0);
  };
  const onClick = () => {
    if (m.failed) return h.onRetry(m);
    const now = Date.now();
    if (interactive && now - lastTap.current < 300 && !m.deletedAt) {
      const mineReaction = m.reactions.find((r) => r.userId === meId)?.emoji;
      h.onReact(m, mineReaction === "❤️" ? null : "❤️");
      lastTap.current = 0;
      return;
    }
    lastTap.current = now;
  };

  if (m.type === "nudge" && !m.deletedAt) {
    const kind = m.body as NudgeKind;
    return (
      <div className={`flex flex-col px-3 ${mine ? "items-end" : "items-start"} ${first ? "mt-2" : "mt-0.5"} ${m.reactions.length ? "mb-3" : ""}`}>
        <div
          onContextMenu={(e) => {
            e.preventDefault();
            if (interactive) h.onMenu(m);
          }}
          onClick={onClick}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="flex flex-col items-center rounded-3xl bg-linear-to-br from-rose-100 to-pink-100 px-5 py-3 text-center shadow-sm dark:from-rose-500/15 dark:to-pink-500/10"
        >
          <span className="animate-beat text-5xl">{NUDGE_EMOJI[kind] ?? "💗"}</span>
          <span className="mt-1 text-xs font-medium text-rose-700 dark:text-rose-200">
            {mine ? `You sent: ${NUDGE_LABEL[kind]?.slice(3) ?? "love"}` : `${partnerName}: ${NUDGE_LABEL[kind]?.slice(3) ?? "love"}`}
          </span>
          <span className="text-[11px] text-zinc-500">
            {formatTime(m.createdAt)}
            {mine && (
              <span className="ml-1 inline-flex translate-y-0.5">
                <Ticks m={m} />
              </span>
            )}
          </span>
        </div>
        <Reactions m={m} meId={meId} onReact={h.onReact} />
      </div>
    );
  }

  const bigEmoji = m.type === "text" && !m.replyTo && isBigEmoji(m.body);
  const isMedia = (m.type === "image" || m.type === "video") && !m.viewOnce && !m.deletedAt;

  return (
    <div
      data-mid={m.id}
      className={`group relative flex px-3 ${mine ? "justify-end" : "justify-start"} ${first ? "mt-2" : "mt-0.5"} ${m.reactions.length ? "mb-3" : ""}`}
    >
      {dx > 0 && (
        <span className="absolute top-1/2 left-3 -translate-y-1/2 text-rose-500" style={{ opacity: dx / 60 }}>
          <Reply className="size-5" />
        </span>
      )}
      <div className="flex max-w-[85%] flex-col sm:max-w-[70%]" style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? "none" : "transform .2s" }}>
        <div
          onContextMenu={(e) => {
            e.preventDefault();
            if (interactive) h.onMenu(m);
          }}
          onClick={onClick}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className={`relative text-[15px] leading-snug transition-colors ${
            bigEmoji
              ? "px-1"
              : `rounded-2xl shadow-sm ${isMedia ? "p-1" : "px-3 py-1.5"} ${
                  mine
                    ? `bg-rose-100 text-zinc-900 dark:bg-rose-950 dark:text-rose-50 ${first ? "rounded-tr-md" : ""}`
                    : `bg-white text-zinc-900 dark:bg-night-3 dark:text-zinc-100 ${first ? "rounded-tl-md" : ""}`
                }`
          } ${highlighted ? "animate-flash" : ""} ${m.failed ? "cursor-pointer ring-1 ring-red-400" : ""}`}
        >
          {m.replyTo && !m.deletedAt && (
            <div className={isMedia ? "p-1 pb-0" : ""}>
              <ReplyQuote m={m} meId={meId} partnerName={partnerName} onJump={h.onJump} />
            </div>
          )}
          <Body m={m} mine={mine} h={h} searchTerm={searchTerm} />
          {interactive && !m.deletedAt && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                h.onMenu(m);
              }}
              className="absolute top-1 right-1 hidden rounded-full bg-inherit p-0.5 text-zinc-500 opacity-0 shadow-sm transition group-hover:opacity-100 sm:block"
              aria-label="Message options"
            >
              <ChevronDown className="size-4" />
            </button>
          )}
        </div>
        {m.failed && <span className="mt-0.5 text-right text-xs text-red-500">Not sent. Tap to retry.</span>}
        <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
          <Reactions m={m} meId={meId} onReact={h.onReact} />
        </div>
      </div>
    </div>
  );
});
