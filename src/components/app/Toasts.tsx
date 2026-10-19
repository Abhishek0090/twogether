"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useApp } from "./AppProvider";

export function Toasts() {
  const { toasts, dismissToast } = useApp();
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex flex-col items-center gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      {toasts.map((t) => {
        const content = (
          <>
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm font-semibold ${t.tone === "error" ? "text-red-600 dark:text-red-400" : ""}`}>{t.title}</p>
              {t.body && <p className="line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{t.body}</p>}
            </div>
          </>
        );
        return (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-2xl bg-white/95 p-3 pl-4 shadow-xl ring-1 ring-zinc-900/5 backdrop-blur dark:bg-night-3/95 dark:ring-white/10"
          >
            {t.href ? (
              <Link href={t.href} className="min-w-0 flex-1" onClick={() => dismissToast(t.id)}>
                {content}
              </Link>
            ) : (
              content
            )}
            <button className="icon-btn -my-1 size-8" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
