"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, prepareImage, probeVideo, uploadFile } from "@/lib/client/api";
import { supabaseBrowser } from "@/lib/client/supabase";
import { playIncoming, playNudge, playSent } from "@/lib/client/sound";
import type {
  Bootstrap,
  CallSignal,
  Couple,
  Me,
  Message,
  MessageMeta,
  MessageType,
  NudgeKind,
  PeerEvent,
  PublicUser,
  ServerEvent,
  TypingState,
} from "@/lib/types";

export type ConnectionStatus = "connecting" | "online" | "offline";

export interface Draft {
  type: MessageType;
  body?: string;
  file?: File | Blob;
  fileName?: string;
  replyTo?: Message | null;
  viewOnce?: boolean;
  meta?: MessageMeta;
}

interface Toast {
  id: number;
  title: string;
  body?: string;
  href?: string;
  tone?: "info" | "error";
}

interface AppContextValue {
  me: Me;
  partner: PublicUser;
  couple: Couple;
  partnerName: string;
  status: ConnectionStatus;
  partnerOnline: boolean;
  partnerLastSeen: number | null;
  partnerTyping: TypingState;
  messages: Message[];
  loaded: boolean;
  hasMore: boolean;
  hasNewer: boolean;
  unread: number;
  toasts: Toast[];
  send(draft: Draft): Promise<void>;
  retry(clientId: string): void;
  discard(clientId: string): void;
  edit(id: number, body: string): Promise<void>;
  remove(id: number, scope: "me" | "everyone"): Promise<void>;
  react(id: number, emoji: string | null): Promise<void>;
  star(id: number, starred: boolean): Promise<void>;
  loadOlder(): Promise<void>;
  jumpTo(id: number): Promise<boolean>;
  backToLatest(): Promise<void>;
  markRead(): void;
  setTyping(state: TypingState): void;
  setChatActive(active: boolean): void;
  sendSignal(data: CallSignal): boolean;
  subscribe(fn: (e: AppEvent) => void): () => void;
  refreshCouple(): Promise<void>;
  patchMe(me: Me): void;
  toast(t: Omit<Toast, "id">): void;
  dismissToast(id: number): void;
}

/** Events raised inside the app, delivered through the same subscribe() as server events. */
export type LocalEvent = { t: "local:nudge"; kind: NudgeKind; fromMe: boolean };

/** Everything subscribe() can deliver: server events, partner-to-partner events, and local ones. */
export type AppEvent = ServerEvent | PeerEvent | LocalEvent;

/** Realtime broadcast event names (see src/server/realtime.ts). */
const USER_EVENT = "event";
const PEER_EVENT = "peer";
const HEARTBEAT_MS = 25_000;

const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

const PAGE = 40;
const sortKey = (m: Message) => (m.id > 0 ? m.id : 1e15 + m.createdAt);

/** Merges incoming messages into the list: replaces by id (or by clientId for our pending copies). */
function merge(list: Message[], incoming: Message[]) {
  if (!incoming.length) return list;
  const byId = new Map(list.map((m) => [m.id, m]));
  for (const m of incoming) {
    if (m.clientId) {
      const pending = [...byId.values()].find((p) => p.id < 0 && p.clientId === m.clientId);
      if (pending) {
        byId.delete(pending.id);
        if (pending.localUrl && !m.media?.url) m.localUrl = pending.localUrl;
      }
    }
    byId.set(m.id, m);
  }
  return [...byId.values()].sort((a, b) => sortKey(a) - sortKey(b));
}

let tempSeq = 0;

const fetchLatest = () => api<{ messages: Message[]; hasMore: boolean; unread: number }>(`/api/messages?limit=${PAGE}`);

export function AppProvider({ initial, children }: { initial: Bootstrap; children: ReactNode }) {
  const [boot, setBoot] = useState(initial);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [partnerLastSeen, setPartnerLastSeen] = useState<number | null>(initial.partner.lastSeen);
  const [partnerTyping, setPartnerTyping] = useState<TypingState>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [hasNewer, setHasNewer] = useState(false);
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const meId = initial.me.id;
  const peerChannel = useRef<RealtimeChannel | null>(null);
  const peerReady = useRef(false);
  const listeners = useRef(new Set<(e: AppEvent) => void>());
  const chatActive = useRef(false);
  const messagesRef = useRef(messages);
  const hasNewerRef = useRef(hasNewer);
  const files = useRef(new Map<string, Draft>());
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const loadingOlder = useRef(false);
  const toastSeq = useRef(0);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    hasNewerRef.current = hasNewer;
  }, [hasNewer]);

  const partnerName = boot.me.partnerNickname || boot.partner.name;

  const emit = useCallback((e: AppEvent) => {
    for (const fn of listeners.current) fn(e);
  }, []);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = ++toastSeq.current;
    setToasts((list) => [...list.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 4500);
  }, []);

  const dismissToast = useCallback((id: number) => setToasts((list) => list.filter((x) => x.id !== id)), []);

  /** Sends an event straight to the partner's browsers over the shared couple channel. */
  const sendPeer = useCallback((event: PeerEvent) => {
    const ch = peerChannel.current;
    if (!ch || !peerReady.current) return false;
    void ch.send({ type: "broadcast", event: PEER_EVENT, payload: event });
    return true;
  }, []);

  /** Tells the server we received the partner's messages (their second grey tick). */
  const ackDelivered = useCallback(
    (list: Message[]) => {
      const latest = list.filter((m) => m.id > 0 && m.senderId !== meId && !m.deliveredAt).at(-1);
      if (latest) void api("/api/messages/receipts", { json: { kind: "delivered", upTo: latest.id } }).catch(() => {});
    },
    [meId],
  );

  const isVisible = () => typeof document !== "undefined" && document.visibilityState === "visible";

  const markRead = useCallback(() => {
    const latest = [...messagesRef.current].reverse().find((m) => m.id > 0 && m.senderId !== meId);
    if (!latest) return;
    const needsRead = messagesRef.current.some((m) => m.id > 0 && m.senderId !== meId && !m.readAt);
    setUnread(0);
    if (!needsRead) return;
    void api("/api/messages/receipts", { json: { kind: "read", upTo: latest.id } }).catch(() => {});
    const at = Date.now();
    setMessages((list) => list.map((m) => (m.senderId !== meId && !m.readAt && m.id > 0 ? { ...m, readAt: at } : m)));
  }, [meId]);

  const markReadRef = useRef(markRead);
  useEffect(() => {
    markReadRef.current = markRead;
  }, [markRead]);

  const refreshCouple = useCallback(async () => {
    const data = await api<Bootstrap>("/api/couple");
    setBoot(data);
  }, []);

  // ---- server events -------------------------------------------------------------------------
  const onEvent = useCallback(
    (e: ServerEvent) => {
      switch (e.t) {
        case "message": {
          const m = e.message;
          if (hasNewerRef.current && m.senderId !== meId) {
            // We are looking at an older part of the chat; the "latest" button will reload.
            setUnread((n) => n + 1);
            break;
          }
          setMessages((list) => merge(list, [m]));
          if (m.senderId !== meId) {
            setPartnerTyping(null);
            if (m.type === "nudge") {
              emit({ t: "local:nudge", kind: m.body as NudgeKind, fromMe: false });
              playNudge();
              navigator.vibrate?.([80, 60, 80, 60, 200]);
            } else if (chatActive.current && isVisible()) {
              playIncoming();
            }
            if (chatActive.current && isVisible()) {
              setTimeout(markRead, 300);
            } else {
              ackDelivered([m]);
            }
            if ((!chatActive.current || !isVisible()) && m.type !== "system") {
              setUnread((n) => n + 1);
              if (m.type !== "nudge" && !chatActive.current) {
                toast({ title: partnerName, body: previewOf(m), href: "/" });
                playIncoming();
              }
            }
          }
          break;
        }
        case "message:update":
          setMessages((list) => (list.some((m) => m.id === e.message.id) ? merge(list, [e.message]) : list));
          break;
        case "message:hidden": {
          const ids = new Set(e.ids);
          setMessages((list) => list.filter((m) => !ids.has(m.id)));
          break;
        }
        case "receipt":
          if (e.readerId === meId) {
            setUnread(0);
            setMessages((list) =>
              list.map((m) => (m.senderId !== meId && m.id <= e.upTo && !m.readAt ? { ...m, readAt: e.at } : m)),
            );
          } else {
            setMessages((list) =>
              list.map((m) => {
                if (m.senderId !== meId || m.id <= 0 || m.id > e.upTo) return m;
                if (e.kind === "read" && !m.readAt) return { ...m, readAt: e.at, deliveredAt: m.deliveredAt ?? e.at };
                if (e.kind === "delivered" && !m.deliveredAt) return { ...m, deliveredAt: e.at };
                return m;
              }),
            );
          }
          break;
        case "presence":
          setPartnerOnline(e.online);
          if (e.lastSeen) setPartnerLastSeen(e.lastSeen);
          break;
        case "refresh":
          if (e.what === "couple") void refreshCouple();
          break;
        case "unpaired":
          window.location.href = "/pair";
          return;
      }
      emit(e);
    },
    [ackDelivered, emit, markRead, meId, partnerName, refreshCouple, toast],
  );

  /** Events from the partner's browser (or our own other devices) on the couple channel. */
  const onPeer = useCallback(
    (e: PeerEvent) => {
      if (e.t === "typing" && e.from !== meId) {
        setPartnerTyping(e.state);
        clearTimeout(typingTimer.current);
        if (e.state) typingTimer.current = setTimeout(() => setPartnerTyping(null), 7000);
      }
      emit(e);
    },
    [emit, meId],
  );

  const onEventRef = useRef(onEvent);
  const onPeerRef = useRef(onPeer);
  useEffect(() => {
    onEventRef.current = onEvent;
    onPeerRef.current = onPeer;
  }, [onEvent, onPeer]);

  // ---- initial load + sync after reconnect ---------------------------------------------------
  const applyLatest = useCallback(
    (data: { messages: Message[]; hasMore: boolean; unread: number }) => {
      setMessages((list) => merge(list.filter((m) => m.id < 0), data.messages));
      setHasMore(data.hasMore);
      setHasNewer(false);
      setUnread(data.unread);
      setLoaded(true);
      ackDelivered(data.messages);
    },
    [ackDelivered],
  );

  const loadLatest = useCallback(async () => applyLatest(await fetchLatest()), [applyLatest]);

  const sync = useCallback(async () => {
    const real = messagesRef.current.filter((m) => m.id > 0);
    if (!real.length || hasNewerRef.current) return loadLatest();
    const last = real[real.length - 1].id;
    const [newer, latest] = await Promise.all([
      api<{ messages: Message[]; unread: number }>(`/api/messages?after=${last}`),
      api<{ messages: Message[] }>(`/api/messages?limit=${PAGE}`),
    ]);
    setMessages((list) => merge(list, [...latest.messages, ...newer.messages]));
    setUnread(newer.unread);
    ackDelivered(newer.messages);
  }, [ackDelivered, loadLatest]);

  useEffect(() => {
    fetchLatest()
      .then(applyLatest)
      .catch(() => setLoaded(true));
  }, [applyLatest]);

  // ---- Realtime (Supabase) ------------------------------------------------------------------
  // Two channels: our private one for server events, and the couple one for typing, calls and presence.
  const partnerId = initial.partner.id;
  const { userTopic, coupleTopic } = initial.realtime;
  useEffect(() => {
    const sb = supabaseBrowser();
    let firstJoin = true;
    const tabKey = `${meId}:${crypto.randomUUID()}`;

    const mine = sb.channel(userTopic);
    mine.on("broadcast", { event: USER_EVENT }, ({ payload }) => {
      try {
        onEventRef.current(payload as ServerEvent);
      } catch (err) {
        console.error(err);
      }
    });
    mine.subscribe((state) => {
      if (state === "SUBSCRIBED") {
        setStatus("online");
        // Catch up on anything sent while we were disconnected.
        if (!firstJoin) void sync().catch(() => {});
        firstJoin = false;
      } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") {
        setStatus("connecting"); // supabase-js retries by itself
      } else if (state === "CLOSED") {
        setStatus("offline");
      }
    });

    const shared = sb.channel(coupleTopic, { config: { broadcast: { self: false }, presence: { key: tabKey } } });
    peerChannel.current = shared;
    shared.on("broadcast", { event: PEER_EVENT }, ({ payload }) => onPeerRef.current(payload as PeerEvent));
    let wasOnline = false;
    shared.on("presence", { event: "sync" }, () => {
      const online = Object.values(shared.presenceState<{ userId: number }>())
        .flat()
        .some((p) => p.userId === partnerId);
      if (online === wasOnline) return;
      wasOnline = online;
      setPartnerOnline(online);
      if (!online) {
        const at = Date.now();
        setPartnerLastSeen(at);
        setPartnerTyping(null);
        emit({ t: "presence", userId: partnerId, online: false, lastSeen: at });
      } else {
        emit({ t: "presence", userId: partnerId, online: true, lastSeen: null });
      }
    });
    shared.subscribe((state) => {
      peerReady.current = state === "SUBSCRIBED";
      if (state === "SUBSCRIBED") void shared.track({ userId: meId, at: Date.now() });
    });

    return () => {
      peerReady.current = false;
      peerChannel.current = null;
      void sb.removeChannel(mine);
      void sb.removeChannel(shared);
    };
  }, [coupleTopic, emit, meId, partnerId, sync, userTopic]);

  // Fallback: if Realtime cannot connect (blocked network, paused project), fetch new messages every 10 s.
  useEffect(() => {
    if (status === "online") return;
    const timer = setInterval(() => {
      if (isVisible()) void sync().catch(() => {});
    }, 10_000);
    return () => clearInterval(timer);
  }, [status, sync]);

  // Heartbeat while on screen: lets the server skip push notifications you would see anyway,
  // and keeps "last seen" fresh. When hidden, tell the server at once (sendBeacon survives closing the tab).
  useEffect(() => {
    const beat = () => {
      if (isVisible()) void api("/api/presence", { json: { visible: true } }).catch(() => {});
    };
    const onVisibility = () => {
      if (isVisible()) {
        beat();
        if (chatActive.current) markReadRef.current();
      } else {
        navigator.sendBeacon?.("/api/presence", new Blob([JSON.stringify({ visible: false })], { type: "application/json" }));
      }
    };
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onVisibility);
    };
  }, []);

  // ---- unread badge in the tab title and on the installed app icon ---------------------------
  useEffect(() => {
    document.title = unread ? `(${unread}) Twogether` : "Twogether";
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (unread) void nav.setAppBadge?.(unread).catch(() => {});
    else void nav.clearAppBadge?.().catch(() => {});
  }, [unread]);

  // ---- sending -------------------------------------------------------------------------------
  const deliver = useCallback(
    async (clientId: string) => {
      const draft = files.current.get(clientId);
      if (!draft) return;
      const update = (patch: Partial<Message>) =>
        setMessages((list) => list.map((m) => (m.clientId === clientId && m.id < 0 ? { ...m, ...patch } : m)));
      update({ failed: false, pending: true });
      try {
        let mediaId: number | null = null;
        const meta: MessageMeta = { ...draft.meta };
        if (draft.file) {
          let blob: Blob = draft.file;
          let name = draft.fileName ?? (draft.file instanceof File ? draft.file.name : "file");
          if (draft.type === "image" && draft.file instanceof File) {
            const img = await prepareImage(draft.file);
            blob = img.blob;
            name = img.name;
            meta.w = img.w;
            meta.h = img.h;
          } else if (draft.type === "video") {
            const v = await probeVideo(draft.file);
            Object.assign(meta, { w: v.w, h: v.h, duration: v.duration });
          }
          const uploaded = await uploadFile(blob, name, (p) => update({ progress: p }));
          mediaId = uploaded.id;
        }
        const { message } = await api<{ message: Message }>("/api/messages", {
          json: {
            clientId,
            type: draft.type,
            body: draft.body ?? null,
            mediaId,
            replyTo: draft.replyTo?.id ?? null,
            viewOnce: !!draft.viewOnce,
            meta,
          },
        });
        files.current.delete(clientId);
        setMessages((list) => merge(list, [message]));
        playSent();
      } catch (err) {
        update({ failed: true, pending: false });
        toast({ title: "Message not sent", body: (err as Error).message, tone: "error" });
      }
    },
    [toast],
  );

  const send = useCallback(
    async (draft: Draft) => {
      if (hasNewerRef.current) await loadLatest();
      const clientId = crypto.randomUUID();
      const localUrl = draft.file ? URL.createObjectURL(draft.file) : undefined;
      const r = draft.replyTo;
      const temp: Message = {
        id: -++tempSeq,
        clientId,
        senderId: meId,
        type: draft.type,
        body: draft.body ?? null,
        media: draft.file
          ? {
              id: 0,
              mime: draft.file.type,
              name: draft.fileName ?? (draft.file instanceof File ? draft.file.name : null),
              size: draft.file.size,
              url: "",
            }
          : null,
        meta: draft.meta ?? null,
        replyTo: r
          ? { id: r.id, senderId: r.senderId, type: r.type, body: r.body, deleted: !!r.deletedAt, mediaUrl: r.media?.url || null }
          : null,
        viewOnce: !!draft.viewOnce,
        viewedAt: null,
        editedAt: null,
        deletedAt: null,
        createdAt: Date.now(),
        deliveredAt: null,
        readAt: null,
        reactions: [],
        starred: false,
        pending: true,
        localUrl,
      };
      files.current.set(clientId, draft);
      setMessages((list) => [...list, temp]);
      if (draft.type === "nudge") emit({ t: "local:nudge", kind: draft.body as NudgeKind, fromMe: true });
      await deliver(clientId);
    },
    [deliver, emit, loadLatest, meId],
  );

  const retry = useCallback((clientId: string) => void deliver(clientId), [deliver]);

  const discard = useCallback((clientId: string) => {
    files.current.delete(clientId);
    setMessages((list) => list.filter((m) => !(m.id < 0 && m.clientId === clientId)));
  }, []);

  const edit = useCallback(async (id: number, body: string) => {
    await api(`/api/messages/${id}`, { method: "PATCH", json: { body } });
  }, []);

  const remove = useCallback(async (id: number, scope: "me" | "everyone") => {
    await api(`/api/messages/${id}?scope=${scope}`, { method: "DELETE" });
  }, []);

  const react = useCallback(
    async (id: number, emoji: string | null) => {
      setMessages((list) =>
        list.map((m) =>
          m.id === id
            ? { ...m, reactions: [...m.reactions.filter((r) => r.userId !== meId), ...(emoji ? [{ userId: meId, emoji }] : [])] }
            : m,
        ),
      );
      await api(`/api/messages/${id}/reactions`, { json: { emoji } });
    },
    [meId],
  );

  const star = useCallback(async (id: number, starred: boolean) => {
    setMessages((list) => list.map((m) => (m.id === id ? { ...m, starred } : m)));
    await api(`/api/messages/${id}/star`, { json: { starred } });
  }, []);

  const loadOlder = useCallback(async () => {
    if (loadingOlder.current) return;
    const first = messagesRef.current.find((m) => m.id > 0);
    if (!first) return;
    loadingOlder.current = true;
    try {
      const data = await api<{ messages: Message[]; hasMore: boolean }>(`/api/messages?before=${first.id}&limit=${PAGE}`);
      setMessages((list) => merge(list, data.messages));
      setHasMore(data.hasMore);
    } finally {
      loadingOlder.current = false;
    }
  }, []);

  const jumpTo = useCallback(async (id: number) => {
    if (messagesRef.current.some((m) => m.id === id)) return true;
    const data = await api<{ messages: Message[]; hasMore: boolean; hasNewer: boolean }>(`/api/messages?around=${id}`);
    if (!data.messages.some((m) => m.id === id)) return false;
    setMessages(data.messages);
    setHasMore(data.hasMore);
    setHasNewer(data.hasNewer);
    return true;
  }, []);

  const backToLatest = useCallback(async () => {
    if (hasNewerRef.current) await loadLatest();
  }, [loadLatest]);

  const lastTyping = useRef<{ state: TypingState; at: number }>({ state: null, at: 0 });
  const setTyping = useCallback(
    (state: TypingState) => {
      const now = Date.now();
      // Re-send "typing" at most every 3 s; send changes straight away.
      if (state === lastTyping.current.state && (state === null || now - lastTyping.current.at < 3000)) return;
      lastTyping.current = { state, at: now };
      sendPeer({ t: "typing", from: meId, state });
    },
    [meId, sendPeer],
  );

  const setChatActive = useCallback(
    (active: boolean) => {
      chatActive.current = active;
      if (active && isVisible()) markRead();
    },
    [markRead],
  );

  const sendSignal = useCallback((data: CallSignal) => sendPeer({ t: "call", from: meId, data }), [meId, sendPeer]);

  const subscribe = useCallback((fn: (e: AppEvent) => void) => {
    listeners.current.add(fn);
    return () => void listeners.current.delete(fn);
  }, []);

  const patchMe = useCallback((me: Me) => setBoot((b) => ({ ...b, me })), []);

  const value = useMemo<AppContextValue>(
    () => ({
      me: boot.me,
      partner: boot.partner,
      couple: boot.couple,
      partnerName,
      status,
      partnerOnline,
      partnerLastSeen,
      partnerTyping,
      messages,
      loaded,
      hasMore,
      hasNewer,
      unread,
      toasts,
      send,
      retry,
      discard,
      edit,
      remove,
      react,
      star,
      loadOlder,
      jumpTo,
      backToLatest,
      markRead,
      setTyping,
      setChatActive,
      sendSignal,
      subscribe,
      refreshCouple,
      patchMe,
      toast,
      dismissToast,
    }),
    [
      boot,
      partnerName,
      status,
      partnerOnline,
      partnerLastSeen,
      partnerTyping,
      messages,
      loaded,
      hasMore,
      hasNewer,
      unread,
      toasts,
      send,
      retry,
      discard,
      edit,
      remove,
      react,
      star,
      loadOlder,
      jumpTo,
      backToLatest,
      markRead,
      setTyping,
      setChatActive,
      sendSignal,
      subscribe,
      refreshCouple,
      patchMe,
      toast,
      dismissToast,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/** Short text for notifications and reply quotes. */
export function previewOf(m: Pick<Message, "type" | "body" | "media" | "meta" | "viewOnce" | "deletedAt">) {
  if (m.deletedAt) return "This message was deleted";
  switch (m.type) {
    case "text":
    case "system":
      return m.body ?? "";
    case "image":
      return m.viewOnce ? "📷 Photo (view once)" : m.body ? `📷 ${m.body}` : "📷 Photo";
    case "video":
      return m.viewOnce ? "🎥 Video (view once)" : m.body ? `🎥 ${m.body}` : "🎥 Video";
    case "audio":
      return "🎤 Voice message";
    case "file":
      return `📄 ${m.media?.name ?? "Document"}`;
    case "nudge":
      return NUDGE_LABEL[m.body as NudgeKind] ?? "💗";
    case "call":
      return m.meta?.status === "missed" ? `📞 Missed ${m.meta.video ? "video" : "voice"} call` : `📞 ${m.meta?.video ? "Video" : "Voice"} call`;
  }
}

export const NUDGE_LABEL: Record<NudgeKind, string> = {
  hug: "🤗 Hug",
  kiss: "😘 Kiss",
  miss: "🥺 Missing you",
  thinking: "💭 Thinking of you",
  love: "❤️ Love you",
};
