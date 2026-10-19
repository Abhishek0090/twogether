"use client";

import { Copy, Info, Pencil, Reply, Star, StarOff, Trash2 } from "lucide-react";
import { useState } from "react";
import { previewOf } from "@/components/app/AppProvider";
import { Sheet } from "@/components/ui/Sheet";
import { QUICK_REACTIONS } from "@/lib/emoji";
import { formatTime, dayLabel } from "@/lib/format";
import { DELETE_WINDOW_MS, EDIT_WINDOW_MS } from "@/lib/limits";
import type { Message } from "@/lib/types";
import { EmojiPicker } from "./EmojiPicker";

interface Props {
  message: Message | null;
  meId: number;
  onClose(): void;
  onReact(m: Message, emoji: string | null): void;
  onReply(m: Message): void;
  onEdit(m: Message): void;
  onStar(m: Message): void;
  onDelete(m: Message, scope: "me" | "everyone"): void;
  onCopy(m: Message): void;
}

function Row({ icon: Icon, label, onClick, danger }: { icon: typeof Reply; label: string; onClick(): void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-4 rounded-2xl px-3 py-3 text-left text-[15px] transition hover:bg-zinc-100 dark:hover:bg-white/5 ${danger ? "text-red-600 dark:text-red-400" : ""}`}
    >
      <Icon className="size-5 opacity-80" />
      {label}
    </button>
  );
}

const stamp = (t: number) => `${dayLabel(t)}, ${formatTime(t)}`;

export function MessageMenu(props: Props) {
  if (!props.message) return null;
  // Keyed so the edit/delete time windows are evaluated when the menu opens.
  return <MenuBody key={props.message.id} {...props} message={props.message} />;
}

function MenuBody({ message: m, meId, onClose, onReact, onReply, onEdit, onStar, onDelete, onCopy }: Props & { message: Message }) {
  const [now] = useState(() => Date.now());
  const [view, setView] = useState<"main" | "emoji" | "delete" | "info">("main");
  const close = () => {
    setView("main");
    onClose();
  };
  const mine = m.senderId === meId;
  const canEdit = mine && m.type === "text" && !m.deletedAt && now - m.createdAt < EDIT_WINDOW_MS;
  const canDeleteForAll = mine && !m.deletedAt && now - m.createdAt < DELETE_WINDOW_MS;
  const myReaction = m.reactions.find((r) => r.userId === meId)?.emoji;
  const act = (fn: () => void) => () => {
    fn();
    close();
  };

  return (
    <Sheet open onClose={close} title={view === "info" ? "Message info" : view === "delete" ? "Delete message?" : undefined}>
      {view === "main" && (
        <>
          <p className="mb-3 line-clamp-2 rounded-2xl bg-zinc-100 px-3 py-2 text-sm text-zinc-600 dark:bg-white/5 dark:text-zinc-300">
            {previewOf(m)}
          </p>
          {!m.deletedAt && (
            <div className="mb-2 flex items-center justify-between gap-1 rounded-full bg-zinc-100 p-1.5 dark:bg-white/5">
              {QUICK_REACTIONS.map((e) => (
                <button
                  key={e}
                  onClick={act(() => onReact(m, myReaction === e ? null : e))}
                  className={`flex size-11 items-center justify-center rounded-full text-2xl transition hover:scale-110 ${myReaction === e ? "bg-rose-200 dark:bg-rose-500/30" : ""}`}
                  aria-label={`React ${e}`}
                >
                  {e}
                </button>
              ))}
              <button onClick={() => setView("emoji")} className="flex size-11 items-center justify-center rounded-full text-xl text-zinc-500 hover:bg-white dark:hover:bg-white/10" aria-label="More reactions">
                +
              </button>
            </div>
          )}
          <div className="-mx-2">
            {!m.deletedAt && <Row icon={Reply} label="Reply" onClick={act(() => onReply(m))} />}
            {!m.deletedAt && m.body && m.type !== "nudge" && <Row icon={Copy} label="Copy" onClick={act(() => onCopy(m))} />}
            {!m.deletedAt && <Row icon={m.starred ? StarOff : Star} label={m.starred ? "Unstar" : "Star"} onClick={act(() => onStar(m))} />}
            {canEdit && <Row icon={Pencil} label="Edit" onClick={act(() => onEdit(m))} />}
            {mine && <Row icon={Info} label="Info" onClick={() => setView("info")} />}
            <Row icon={Trash2} label="Delete" danger onClick={() => setView("delete")} />
          </div>
        </>
      )}
      {view === "emoji" && <EmojiPicker onPick={(e) => act(() => onReact(m, e))()} />}
      {view === "delete" && (
        <div className="flex flex-col gap-2 pt-2">
          {canDeleteForAll && (
            <button className="btn-danger w-full py-3" onClick={act(() => onDelete(m, "everyone"))}>
              Delete for everyone
            </button>
          )}
          <button className="btn-soft w-full py-3" onClick={act(() => onDelete(m, "me"))}>
            Delete for me
          </button>
          <button className="btn-ghost w-full py-3" onClick={() => setView("main")}>
            Cancel
          </button>
        </div>
      )}
      {view === "info" && (
        <dl className="space-y-3 text-sm">
          {[
            ["Sent", m.createdAt],
            ["Delivered", m.deliveredAt],
            ["Read", m.readAt],
            ...(m.viewOnce ? [["Opened", m.viewedAt] as const] : []),
            ...(m.editedAt ? [["Edited", m.editedAt] as const] : []),
          ].map(([label, t]) => (
            <div key={label as string} className="flex justify-between rounded-2xl bg-zinc-100 px-4 py-3 dark:bg-white/5">
              <dt className="font-medium">{label}</dt>
              <dd className="text-zinc-500 dark:text-zinc-400">{t ? stamp(t as number) : "-"}</dd>
            </div>
          ))}
        </dl>
      )}
    </Sheet>
  );
}
