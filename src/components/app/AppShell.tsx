"use client";

import { HeartHandshake, Images, MessageCircleHeart, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CallOverlay, CallProvider } from "@/components/call/CallProvider";
import { Avatar } from "@/components/ui/Avatar";
import { useApp } from "./AppProvider";
import { LoveBurst } from "./LoveBurst";
import { Toasts } from "./Toasts";

const NAV = [
  { href: "/", label: "Chat", icon: MessageCircleHeart },
  { href: "/us", label: "Us", icon: HeartHandshake },
  { href: "/moments", label: "Moments", icon: Images },
  { href: "/settings", label: "Settings", icon: Settings },
];

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="absolute -top-1 -right-1.5 min-w-5 rounded-full bg-rose-500 px-1.5 text-center text-[11px] leading-5 font-bold text-white ring-2 ring-white dark:ring-night">
      {n > 99 ? "99+" : n}
    </span>
  );
}

function NavRail() {
  const pathname = usePathname();
  const { unread, me, status } = useApp();
  return (
    <nav className="hidden w-20 shrink-0 flex-col items-center gap-2 border-r border-zinc-200/70 bg-white py-5 md:flex dark:border-white/5 dark:bg-night-2">
      <Link href="/" className="mb-4" aria-label="Twogether">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="size-11 rounded-2xl shadow-md shadow-rose-500/30" />
      </Link>
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`group flex w-16 flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-medium transition ${
              active ? "text-rose-600 dark:text-rose-300" : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
            aria-current={active ? "page" : undefined}
          >
            <span className={`relative rounded-2xl px-4 py-1.5 transition ${active ? "bg-rose-100 dark:bg-rose-500/15" : "group-hover:bg-zinc-100 dark:group-hover:bg-white/5"}`}>
              <Icon className="size-5" />
              {href === "/" && <Badge n={unread} />}
            </span>
            {label}
          </Link>
        );
      })}
      <div className="mt-auto flex flex-col items-center gap-2">
        <span
          className={`size-2 rounded-full ${status === "online" ? "bg-emerald-500" : status === "connecting" ? "bg-amber-400" : "bg-zinc-400"}`}
          title={status === "online" ? "Connected" : status === "connecting" ? "Connecting..." : "Offline"}
        />
        <Link href="/settings" aria-label="Your profile">
          <Avatar src={me.avatarUrl} name={me.name} size={40} />
        </Link>
      </div>
    </nav>
  );
}

function BottomTabs() {
  const pathname = usePathname();
  const { unread } = useApp();
  return (
    <nav className="flex shrink-0 border-t border-zinc-200/70 bg-white/95 pb-safe backdrop-blur md:hidden dark:border-white/5 dark:bg-night-2/95">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? "text-rose-600 dark:text-rose-300" : "text-zinc-500 dark:text-zinc-400"}`}
            aria-current={active ? "page" : undefined}
          >
            <span className={`relative rounded-full px-4 py-1 ${active ? "bg-rose-100 dark:bg-rose-500/15" : ""}`}>
              <Icon className="size-[22px]" />
              {href === "/" && <Badge n={unread} />}
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isChat = pathname === "/";
  return (
    <CallProvider>
      <div className="flex h-app overflow-hidden">
        <NavRail />
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">{children}</div>
          {!isChat && <BottomTabs />}
        </main>
      </div>
      <Toasts />
      <LoveBurst />
      <CallOverlay />
    </CallProvider>
  );
}
