"use client";

/* eslint-disable @next/next/no-img-element -- local previews are object URLs */
import { Camera, FileText, Heart, Image as ImageIcon, Mic, Paperclip, Pencil, SendHorizontal, Smile, Trash2, X } from "lucide-react";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { previewOf, useApp } from "@/components/app/AppProvider";
import { Sheet } from "@/components/ui/Sheet";
import { formatBytes, formatDuration } from "@/lib/format";
import { MAX_UPLOAD_BYTES } from "@/lib/limits";
import type { Message, NudgeKind } from "@/lib/types";
import { EmojiPicker } from "./EmojiPicker";
import { useRecorder } from "./useRecorder";

export interface ComposerHandle {
  addFiles(files: File[]): void;
  focus(): void;
}

const NUDGES: { kind: NudgeKind; emoji: string; label: string }[] = [
  { kind: "hug", emoji: "🤗", label: "Hug" },
  { kind: "kiss", emoji: "😘", label: "Kiss" },
  { kind: "miss", emoji: "🥺", label: "Miss you" },
  { kind: "thinking", emoji: "💭", label: "Thinking of you" },
  { kind: "love", emoji: "❤️", label: "Love you" },
];

const DRAFT_KEY = "tg-draft";

interface PendingFile {
  file: File;
  url: string;
  kind: "image" | "video" | "file";
}

function kindOf(file: File): PendingFile["kind"] {
  if (file.type.startsWith("image/") && file.type !== "image/svg+xml") return "image";
  if (file.type.startsWith("video/")) return "video";
  return "file";
}

function AttachButton({ label, color, onClick, children }: { label: string; color: string; onClick(): void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 rounded-2xl py-2 text-xs font-medium transition hover:bg-zinc-100 dark:hover:bg-white/5">
      <span className={`flex size-12 items-center justify-center rounded-full text-white shadow-md ${color}`}>{children}</span>
      {label}
    </button>
  );
}

export function Composer({
  ref,
  replyTo,
  editing,
  onCancelReply,
  onDoneEditing,
}: {
  ref?: Ref<ComposerHandle>;
  replyTo: Message | null;
  editing: Message | null;
  onCancelReply(): void;
  onDoneEditing(): void;
}) {
  const { send, edit, setTyping, partnerName, me, toast } = useApp();
  const [text, setText] = useState(() => (typeof window === "undefined" ? "" : (localStorage.getItem(DRAFT_KEY) ?? "")));
  const [panel, setPanel] = useState<"none" | "emoji" | "attach" | "love">("none");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [caption, setCaption] = useState("");
  const [viewOnce, setViewOnce] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);
  const viewOnceNext = useRef(false);
  const recorder = useRecorder();

  const addFiles = (list: File[]) => {
    const ok = list.filter((f) => {
      if (f.size > MAX_UPLOAD_BYTES) {
        toast({ title: `${f.name} is too large`, body: `Max ${formatBytes(MAX_UPLOAD_BYTES)}.`, tone: "error" });
        return false;
      }
      return true;
    });
    if (!ok.length) return;
    setFiles(ok.slice(0, 10).map((file) => ({ file, url: URL.createObjectURL(file), kind: kindOf(file) })));
    setViewOnce(viewOnceNext.current);
    viewOnceNext.current = false;
    setPanel("none");
  };

  useImperativeHandle(ref, () => ({ addFiles, focus: () => textarea.current?.focus() }));

  // Start editing: load the message text.
  const [editingShown, setEditingShown] = useState(editing);
  if (editing !== editingShown) {
    setEditingShown(editing);
    if (editing) setText(editing.body ?? "");
  }
  useEffect(() => {
    if (editing) requestAnimationFrame(() => textarea.current?.focus());
  }, [editing]);

  useEffect(() => {
    if (replyTo) textarea.current?.focus();
  }, [replyTo]);

  // Persist the draft (not while editing).
  useEffect(() => {
    if (editing) return;
    if (text) localStorage.setItem(DRAFT_KEY, text);
    else localStorage.removeItem(DRAFT_KEY);
  }, [text, editing]);

  // Grow the textarea with its content, up to ~6 lines.
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, [text]);

  useEffect(() => setTyping(recorder.recording ? "recording" : null), [recorder.recording, setTyping]);

  const closeFiles = () => {
    files.forEach((f) => URL.revokeObjectURL(f.url));
    setFiles([]);
    setCaption("");
    setViewOnce(false);
  };

  const submitText = async () => {
    const body = text.trim();
    if (!body) return;
    if (editing) {
      setText("");
      onDoneEditing();
      if (body !== editing.body) await edit(editing.id, body).catch((e) => toast({ title: "Couldn't edit", body: (e as Error).message, tone: "error" }));
      return;
    }
    setText("");
    setTyping(null);
    const reply = replyTo;
    onCancelReply();
    await send({ type: "text", body, replyTo: reply });
  };

  const submitFiles = async () => {
    const list = files;
    const cap = caption.trim();
    const once = viewOnce && list.length === 1 && list[0].kind !== "file";
    const reply = replyTo;
    setFiles([]);
    setCaption("");
    setViewOnce(false);
    onCancelReply();
    for (const [i, f] of list.entries()) {
      URL.revokeObjectURL(f.url);
      await send({
        type: f.kind,
        file: f.file,
        body: i === 0 && f.kind !== "file" ? cap : undefined,
        viewOnce: once,
        replyTo: i === 0 ? reply : null,
      });
    }
  };

  const startRecording = async () => {
    try {
      await recorder.start();
      navigator.vibrate?.(20);
    } catch (e) {
      toast({ title: "Can't record", body: (e as Error).message, tone: "error" });
    }
  };

  const stopRecording = async () => {
    const rec = await recorder.stop();
    if (!rec) return;
    const ext = rec.mime.includes("mp4") ? "m4a" : rec.mime.includes("ogg") ? "ogg" : "webm";
    const reply = replyTo;
    onCancelReply();
    await send({
      type: "audio",
      file: new File([rec.blob], `voice-${Date.now()}.${ext}`, { type: rec.mime }),
      meta: { duration: rec.duration, peaks: rec.peaks },
      replyTo: reply,
    });
  };

  const openGallery = () => galleryInput.current?.click();
  const openCamera = () => cameraInput.current?.click();
  const openDocs = () => docInput.current?.click();
  const openViewOnce = () => {
    viewOnceNext.current = true;
    galleryInput.current?.click();
  };

  const coarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  const fileInputs = (
    <>
      <input
        ref={galleryInput}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => {
          addFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          addFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      <input
        ref={docInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          addFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </>
  );

  return (
    <div className="relative shrink-0 border-t border-zinc-200/60 bg-white/90 pb-safe backdrop-blur-xl dark:border-white/5 dark:bg-night-2/90">
      {fileInputs}

      {(replyTo || editing) && (
        <div className="flex items-center gap-3 px-4 pt-2">
          <div className={`min-w-0 flex-1 rounded-xl border-l-4 bg-zinc-100 px-3 py-1.5 dark:bg-white/5 ${editing ? "border-amber-500" : "border-rose-500"}`}>
            <p className={`flex items-center gap-1 text-xs font-semibold ${editing ? "text-amber-600" : "text-rose-600 dark:text-rose-300"}`}>
              {editing ? (
                <>
                  <Pencil className="size-3" /> Editing message
                </>
              ) : replyTo!.senderId === me.id ? (
                "Replying to yourself"
              ) : (
                `Replying to ${partnerName}`
              )}
            </p>
            <p className="truncate text-sm text-zinc-600 dark:text-zinc-300">{previewOf((editing ?? replyTo)!)}</p>
          </div>
          <button
            className="icon-btn"
            aria-label="Cancel"
            onClick={() => {
              if (editing) {
                setText("");
                onDoneEditing();
              } else onCancelReply();
            }}
          >
            <X className="size-5" />
          </button>
        </div>
      )}

      {panel === "emoji" && (
        <div className="border-b border-zinc-100 dark:border-white/5">
          <EmojiPicker
            onPick={(e) => {
              const el = textarea.current;
              const start = el?.selectionStart ?? text.length;
              const end = el?.selectionEnd ?? text.length;
              setText(text.slice(0, start) + e + text.slice(end));
              requestAnimationFrame(() => {
                el?.focus();
                el?.setSelectionRange(start + e.length, start + e.length);
              });
            }}
          />
        </div>
      )}

      {panel === "attach" && (
        <div className="grid animate-slide-up grid-cols-4 gap-2 px-4 pt-3 pb-1 sm:max-w-md">
          <AttachButton label="Gallery" color="bg-violet-500" onClick={openGallery}>
            <ImageIcon className="size-5" />
          </AttachButton>
          <AttachButton label="Camera" color="bg-rose-500" onClick={openCamera}>
            <Camera className="size-5" />
          </AttachButton>
          <AttachButton label="Document" color="bg-sky-500" onClick={openDocs}>
            <FileText className="size-5" />
          </AttachButton>
          <AttachButton label="View once" color="bg-amber-500" onClick={openViewOnce}>
            <span className="text-base font-bold">1</span>
          </AttachButton>
        </div>
      )}

      {panel === "love" && (
        <div className="flex animate-slide-up gap-2 overflow-x-auto px-4 pt-3 pb-1 no-scrollbar">
          {NUDGES.map((n) => (
            <button
              key={n.kind}
              onClick={() => {
                setPanel("none");
                void send({ type: "nudge", body: n.kind });
                navigator.vibrate?.(30);
              }}
              className="flex shrink-0 items-center gap-2 rounded-full bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100 active:scale-95 dark:bg-rose-500/10 dark:text-rose-200"
            >
              <span className="text-xl">{n.emoji}</span>
              {n.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-1 px-2 py-2 sm:px-3">
        {recorder.recording ? (
          <>
            <button className="icon-btn text-red-500" onClick={recorder.cancel} aria-label="Cancel recording">
              <Trash2 className="size-5" />
            </button>
            <div className="flex h-11 flex-1 items-center gap-3 rounded-3xl bg-zinc-100 px-4 dark:bg-white/5">
              <span className="size-2.5 animate-pulse rounded-full bg-red-500" />
              <span className="font-mono text-sm tabular-nums">{formatDuration(recorder.elapsed)}</span>
              <div className="flex h-6 flex-1 items-center gap-[3px] overflow-hidden" aria-hidden>
                {Array.from({ length: 24 }, (_, i) => (
                  <span
                    key={i}
                    className="w-[3px] rounded-full bg-rose-400 transition-all"
                    style={{ height: `${Math.max(15, Math.min(100, recorder.level * 100 * (0.6 + ((i * 7) % 5) / 10)))}%` }}
                  />
                ))}
              </div>
            </div>
            <button className="flex size-11 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-rose-500 to-pink-500 text-white shadow-md active:scale-95" onClick={() => void stopRecording()} aria-label="Send voice message">
              <SendHorizontal className="size-5" />
            </button>
          </>
        ) : (
          <>
            <button
              className={`icon-btn ${panel === "love" ? "bg-rose-100 text-rose-600 dark:bg-rose-500/15" : "text-rose-500"}`}
              onClick={() => setPanel(panel === "love" ? "none" : "love")}
              aria-label="Send love"
              aria-expanded={panel === "love"}
            >
              <Heart className={`size-5 ${panel === "love" ? "fill-current" : ""}`} />
            </button>
            <div className="flex min-h-11 min-w-0 flex-1 items-end rounded-3xl bg-zinc-100 pr-1 dark:bg-white/5">
              <button
                className="icon-btn size-11 shrink-0"
                onClick={() => {
                  setPanel(panel === "emoji" ? "none" : "emoji");
                }}
                aria-label="Emoji"
                aria-expanded={panel === "emoji"}
              >
                <Smile className="size-5" />
              </button>
              <textarea
                ref={textarea}
                value={text}
                rows={1}
                placeholder="Message"
                aria-label={`Message ${partnerName}`}
                className="scrollbar-thin max-h-[150px] min-w-0 flex-1 resize-none bg-transparent py-2.5 leading-6 outline-none placeholder:text-zinc-500"
                onChange={(e) => {
                  setText(e.target.value);
                  if (!editing) setTyping(e.target.value.trim() ? "typing" : null);
                }}
                onBlur={() => setTyping(null)}
                onFocus={() => panel === "emoji" && coarse && setPanel("none")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void submitText();
                  }
                  if (e.key === "Escape") {
                    if (editing) {
                      setText("");
                      onDoneEditing();
                    } else if (replyTo) onCancelReply();
                  }
                }}
                onPaste={(e) => {
                  const pasted = [...e.clipboardData.files];
                  if (pasted.length) {
                    e.preventDefault();
                    addFiles(pasted);
                  }
                }}
              />
              {!editing && (
                <>
                  <button className="icon-btn size-11 shrink-0" onClick={() => setPanel(panel === "attach" ? "none" : "attach")} aria-label="Attach" aria-expanded={panel === "attach"}>
                    <Paperclip className="size-5" />
                  </button>
                  {!text.trim() && (
                    <button className="icon-btn size-11 shrink-0" onClick={openCamera} aria-label="Take photo">
                      <Camera className="size-5" />
                    </button>
                  )}
                </>
              )}
            </div>
            {text.trim() || editing ? (
              <button
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-rose-500 to-pink-500 text-white shadow-md shadow-rose-500/30 transition active:scale-95"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void submitText()}
                aria-label={editing ? "Save edit" : "Send"}
              >
                <SendHorizontal className="size-5" />
              </button>
            ) : (
              <button
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-rose-500 to-pink-500 text-white shadow-md shadow-rose-500/30 transition active:scale-95"
                onClick={() => void startRecording()}
                aria-label="Record voice message"
              >
                <Mic className="size-5" />
              </button>
            )}
          </>
        )}
      </div>

      <Sheet open={files.length > 0} onClose={closeFiles} title={files.length > 1 ? `Send ${files.length} files` : "Send"} wide>
        <div className="flex gap-2 overflow-x-auto pb-3 no-scrollbar">
          {files.map((f, i) => (
            <div key={i} className={`relative shrink-0 overflow-hidden rounded-2xl bg-zinc-100 dark:bg-white/5 ${files.length === 1 ? "w-full" : "size-28"}`}>
              {f.kind === "image" ? (
                <img src={f.url} alt="" className={`${files.length === 1 ? "max-h-[50dvh] w-full object-contain" : "size-full object-cover"}`} />
              ) : f.kind === "video" ? (
                <video src={f.url} controls={files.length === 1} muted className={`${files.length === 1 ? "max-h-[50dvh] w-full" : "size-full object-cover"}`} />
              ) : (
                <div className="flex h-full min-h-24 flex-col items-center justify-center gap-1 p-3 text-center">
                  <FileText className="size-8 text-rose-500" />
                  <span className="line-clamp-2 text-xs font-medium break-all">{f.file.name}</span>
                  <span className="text-[11px] text-zinc-500">{formatBytes(f.file.size)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
        {files.some((f) => f.kind !== "file") && (
          <input className="field" placeholder="Add a caption..." value={caption} maxLength={1000} onChange={(e) => setCaption(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submitFiles()} />
        )}
        <div className="mt-3 flex items-center justify-between gap-3">
          {files.length === 1 && files[0].kind !== "file" ? (
            <button
              onClick={() => setViewOnce((v) => !v)}
              className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition ${viewOnce ? "bg-amber-500 text-white" : "bg-zinc-100 text-zinc-600 dark:bg-white/5 dark:text-zinc-300"}`}
              aria-pressed={viewOnce}
            >
              <span className={`flex size-5 items-center justify-center rounded-full border-2 border-dashed text-[10px] font-bold ${viewOnce ? "border-white" : "border-current"}`}>1</span>
              View once
            </button>
          ) : (
            <span />
          )}
          <button className="btn-primary" onClick={() => void submitFiles()}>
            Send <SendHorizontal className="size-4" />
          </button>
        </div>
      </Sheet>
    </div>
  );
}
