"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Bottom sheet on phones, centred dialog on larger screens. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    const focusable = panel.current?.querySelector<HTMLElement>("input, textarea, button:not([data-close]), [tabindex]");
    (focusable ?? panel.current)?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="presentation">
      <div className="absolute inset-0 animate-fade bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`relative max-h-[90dvh] w-full animate-slide-up overflow-y-auto rounded-t-3xl bg-white pb-safe shadow-2xl outline-none sm:rounded-3xl dark:bg-night-2 ${wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-zinc-200 sm:hidden dark:bg-white/10" />
        {title && (
          <div className="flex items-center justify-between px-5 pt-3 pb-1 sm:pt-5">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            <button data-close className="icon-btn -mr-2" onClick={onClose} aria-label="Close">
              <X className="size-5" />
            </button>
          </div>
        )}
        <div className="px-5 pt-2 pb-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
