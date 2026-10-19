"use client";

import { Download, EllipsisVertical, HeartHandshake, Images, Palette, Phone, Search, Star, Trash2, Video } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { useCall } from "@/components/call/CallProvider";
import { Avatar } from "@/components/ui/Avatar";
import { api } from "@/lib/client/api";
import { lastSeenLabel } from "@/lib/format";

export function ChatHeader({ onSearch }: { onSearch(): void }) {
  const { partner, partnerName, partnerOnline, partnerLastSeen, partnerTyping, status, toast } = useApp();
  const { startCall } = useCall();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  let line: React.ReactNode;
  if (status !== "online") line = <span className="text-amber-600 dark:text-amber-400">{status === "connecting" ? "connecting..." : "waiting for network..."}</span>;
  else if (partnerTyping === "typing") line = <span className="text-rose-600 dark:text-rose-300">typing...</span>;
  else if (partnerTyping === "recording") line = <span className="text-rose-600 dark:text-rose-300">recording audio...</span>;
  else if (partnerOnline) line = <span className="text-emerald-600 dark:text-emerald-400">online</span>;
  else line = lastSeenLabel(partnerLastSeen);

  const clearChat = async () => {
    setMenu(false);
    if (!confirm("Clear all messages from this device's view? Your partner keeps their copy.")) return;
    await api("/api/messages/clear", { method: "POST" }).catch((e) => toast({ title: "Couldn't clear chat", body: (e as Error).message, tone: "error" }));
  };

  return (
    <header className="relative z-20 flex shrink-0 items-center gap-2 border-b border-zinc-200/60 bg-white/90 px-2 pt-safe backdrop-blur-xl sm:px-4 dark:border-white/5 dark:bg-night-2/90">
      <div className="flex h-16 min-w-0 flex-1 items-center gap-3">
        <Link href="/us" className="icon-btn text-rose-500 md:hidden" aria-label="Us">
          <HeartHandshake className="size-5" />
        </Link>
        <Link href="/us" className="flex min-w-0 items-center gap-3" aria-label={`${partnerName}'s profile`}>
          <Avatar src={partner.avatarUrl} name={partnerName} size={42} online={partnerOnline} />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate leading-tight font-semibold">
              {partnerName}
              {partner.moodEmoji && <span title={partner.moodText ?? undefined}>{partner.moodEmoji}</span>}
            </p>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{line}</p>
          </div>
        </Link>
      </div>
      <button className="icon-btn" onClick={() => void startCall(true)} aria-label="Video call">
        <Video className="size-5" />
      </button>
      <button className="icon-btn" onClick={() => void startCall(false)} aria-label="Voice call">
        <Phone className="size-5" />
      </button>
      <button className="icon-btn hidden sm:inline-flex" onClick={onSearch} aria-label="Search messages">
        <Search className="size-5" />
      </button>
      <div ref={menuRef} className="relative">
        <button className="icon-btn" onClick={() => setMenu((v) => !v)} aria-label="More" aria-expanded={menu}>
          <EllipsisVertical className="size-5" />
        </button>
        {menu && (
          <div className="absolute top-12 right-0 w-56 animate-pop overflow-hidden rounded-2xl bg-white py-1.5 shadow-xl ring-1 ring-zinc-900/5 dark:bg-night-3 dark:ring-white/10" role="menu">
            {[
              { label: "Search", icon: Search, onClick: onSearch },
              { label: "Media, links and docs", icon: Images, href: "/moments" },
              { label: "Starred messages", icon: Star, href: "/moments?tab=starred" },
              { label: "Wallpaper", icon: Palette, href: "/settings#appearance" },
              {
                label: "Export chat",
                icon: Download,
                onClick: () => {
                  window.location.href = `/api/messages/export?tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`;
                },
              },
            ].map(({ label, icon: Icon, href, onClick }) =>
              href ? (
                <Link key={label} href={href} role="menuitem" onClick={() => setMenu(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-zinc-100 dark:hover:bg-white/5">
                  <Icon className="size-4 opacity-70" />
                  {label}
                </Link>
              ) : (
                <button
                  key={label}
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    onClick?.();
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-white/5"
                >
                  <Icon className="size-4 opacity-70" />
                  {label}
                </button>
              ),
            )}
            <button role="menuitem" onClick={() => void clearChat()} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10">
              <Trash2 className="size-4" />
              Clear chat
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
