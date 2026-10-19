"use client";

/* eslint-disable @next/next/no-img-element -- media is served by our authenticated API */
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { formatTime, dayLabel } from "@/lib/format";

export interface LightboxItem {
  key: string | number;
  src: string;
  kind: "image" | "video";
  caption?: string | null;
  from?: string;
  at?: number;
  downloadName?: string;
}

/** Full-screen photo/video viewer with keyboard and swipe-free arrow navigation. */
export function Lightbox({
  items,
  index,
  onIndex,
  onClose,
  allowDownload = true,
}: {
  items: LightboxItem[];
  index: number;
  onIndex(i: number): void;
  onClose(): void;
  allowDownload?: boolean;
}) {
  const item = items[index];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      if (e.key === "ArrowRight" && index < items.length - 1) onIndex(index + 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, items.length, onClose, onIndex]);

  if (!item) return null;
  return createPortal(
    <div className="fixed inset-0 z-[75] flex animate-fade flex-col bg-black/95 text-white" role="dialog" aria-label="Media viewer">
      <div className="flex shrink-0 items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <button className="icon-btn text-white hover:bg-white/10" onClick={onClose} aria-label="Close">
          <X className="size-6" />
        </button>
        <div className="min-w-0 flex-1">
          {item.from && <p className="truncate text-sm font-semibold">{item.from}</p>}
          {item.at && (
            <p className="text-xs text-white/60">
              {dayLabel(item.at)}, {formatTime(item.at)}
            </p>
          )}
        </div>
        {allowDownload && (
          <a href={item.src} download={item.downloadName ?? true} className="icon-btn text-white hover:bg-white/10" aria-label="Download">
            <Download className="size-5" />
          </a>
        )}
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center" onClick={onClose}>
        {item.kind === "image" ? (
          <img key={item.key} src={item.src} alt={item.caption ?? ""} className="max-h-full max-w-full animate-pop object-contain select-none" onClick={(e) => e.stopPropagation()} />
        ) : (
          <video key={item.key} src={item.src} controls autoPlay playsInline className="max-h-full max-w-full" onClick={(e) => e.stopPropagation()} />
        )}
        {index > 0 && (
          <button
            className="absolute left-2 flex size-11 items-center justify-center rounded-full bg-white/10 backdrop-blur hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              onIndex(index - 1);
            }}
            aria-label="Previous"
          >
            <ChevronLeft className="size-6" />
          </button>
        )}
        {index < items.length - 1 && (
          <button
            className="absolute right-2 flex size-11 items-center justify-center rounded-full bg-white/10 backdrop-blur hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              onIndex(index + 1);
            }}
            aria-label="Next"
          >
            <ChevronRight className="size-6" />
          </button>
        )}
      </div>
      {item.caption && <p className="shrink-0 px-6 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-sm whitespace-pre-wrap text-white/90">{item.caption}</p>}
    </div>,
    document.body,
  );
}
