"use client";

import { Mic, MicOff, Phone, PhoneOff, SwitchCamera, Video, VideoOff } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "@/components/app/AppProvider";
import { Avatar } from "@/components/ui/Avatar";
import { api } from "@/lib/client/api";
import { startRingtone } from "@/lib/client/sound";
import { formatDuration } from "@/lib/format";
import type { CallSignal } from "@/lib/types";

type Phase = "idle" | "outgoing" | "incoming" | "connecting" | "active" | "ended";

interface CallState {
  phase: Phase;
  callId: string | null;
  video: boolean;
  outgoing: boolean;
  ringing: boolean;
  startedAt: number | null;
  endLabel: string | null;
  muted: boolean;
  cameraOff: boolean;
  local: MediaStream | null;
  remote: MediaStream | null;
}

const IDLE: CallState = {
  phase: "idle",
  callId: null,
  video: false,
  outgoing: false,
  ringing: false,
  startedAt: null,
  endLabel: null,
  muted: false,
  cameraOff: false,
  local: null,
  remote: null,
};

interface CallContextValue {
  call: CallState;
  startCall(video: boolean): Promise<void>;
  accept(): Promise<void>;
  decline(): void;
  hangUp(): void;
  toggleMute(): void;
  toggleCamera(): void;
  flipCamera(): Promise<void>;
}

const CallContext = createContext<CallContextValue | null>(null);

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used inside <CallProvider>");
  return ctx;
}

const RING_TIMEOUT_MS = 45_000;
let iceServersPromise: Promise<RTCIceServer[]> | null = null;
const iceServers = () =>
  (iceServersPromise ??= api<{ iceServers: RTCIceServer[] }>("/api/rtc")
    .then((r) => r.iceServers)
    .catch(() => {
      iceServersPromise = null;
      return [{ urls: "stun:stun.l.google.com:19302" }];
    }));

async function getMedia(video: boolean, facingMode: "user" | "environment" = "user") {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Calls need a secure connection (https or localhost).");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: video ? { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    });
  } catch {
    throw new Error(video ? "Allow camera and microphone access to make video calls." : "Allow microphone access to make calls.");
  }
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { subscribe, sendSignal, send, toast, partnerName, partnerOnline, me } = useApp();
  const partnerOnlineRef = useRef(partnerOnline);
  useEffect(() => {
    partnerOnlineRef.current = partnerOnline;
  }, [partnerOnline]);
  const [call, setCall] = useState<CallState>(IDLE);
  const callRef = useRef(call);
  const pc = useRef<RTCPeerConnection | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const remoteOffer = useRef<RTCSessionDescriptionInit | null>(null);
  const stopRing = useRef<(() => void) | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const facing = useRef<"user" | "environment">("user");

  const update = useCallback((patch: Partial<CallState> | ((c: CallState) => Partial<CallState>)) => {
    setCall((c) => {
      const next = { ...c, ...(typeof patch === "function" ? patch(c) : patch) };
      callRef.current = next;
      return next;
    });
  }, []);

  const ring = useCallback((outgoing: boolean | null) => {
    stopRing.current?.();
    stopRing.current = outgoing === null ? null : startRingtone(outgoing);
  }, []);

  /** Tears the call down. The caller writes the call into the chat, so it is logged exactly once. */
  const finish = useCallback(
    (label: string, status?: "ended" | "missed" | "declined") => {
      const c = callRef.current;
      if (c.phase === "idle" || c.phase === "ended") return;
      ring(null);
      timers.current.forEach(clearTimeout);
      timers.current = [];
      c.local?.getTracks().forEach((t) => t.stop());
      pc.current?.close();
      pc.current = null;
      pendingIce.current = [];
      remoteOffer.current = null;
      if (c.outgoing && status) {
        const duration = c.startedAt ? (Date.now() - c.startedAt) / 1000 : 0;
        void send({ type: "call", meta: { video: c.video, status: c.startedAt ? "ended" : status, duration } });
      }
      update({ phase: "ended", endLabel: label, local: null, remote: null });
      timers.current.push(setTimeout(() => callRef.current.phase === "ended" && update(IDLE), 1600));
    },
    [ring, send, update],
  );

  const createPeer = useCallback(
    async (callId: string, local: MediaStream) => {
      const peer = new RTCPeerConnection({ iceServers: await iceServers() });
      pc.current = peer;
      local.getTracks().forEach((t) => peer.addTrack(t, local));
      peer.onicecandidate = (e) => {
        if (e.candidate) sendSignal({ kind: "ice", callId, candidate: e.candidate.toJSON() });
      };
      peer.ontrack = (e) => {
        const stream = e.streams[0] ?? new MediaStream([e.track]);
        update({ remote: stream });
      };
      let dropTimer: ReturnType<typeof setTimeout> | undefined;
      peer.onconnectionstatechange = () => {
        const state = peer.connectionState;
        if (state === "connected") {
          clearTimeout(dropTimer);
          ring(null);
          update((c) => ({ phase: "active", startedAt: c.startedAt ?? Date.now() }));
        } else if (state === "failed") {
          sendSignal({ kind: "end", callId });
          finish("Connection failed", "ended");
        } else if (state === "disconnected") {
          dropTimer = setTimeout(() => {
            if (peer.connectionState === "disconnected") {
              sendSignal({ kind: "end", callId });
              finish("Connection lost", "ended");
            }
          }, 8000);
        }
      };
      return peer;
    },
    [finish, ring, sendSignal, update],
  );

  const flushIce = useCallback(async () => {
    const peer = pc.current;
    if (!peer?.remoteDescription) return;
    for (const c of pendingIce.current.splice(0)) await peer.addIceCandidate(c).catch(() => {});
  }, []);

  const startCall = useCallback(
    async (video: boolean) => {
      if (callRef.current.phase !== "idle") return;
      const callId = crypto.randomUUID();
      update({ ...IDLE, phase: "outgoing", callId, video, outgoing: true });
      let local: MediaStream;
      try {
        local = await getMedia(video);
      } catch (err) {
        update(IDLE);
        toast({ title: "Can't start the call", body: (err as Error).message, tone: "error" });
        return;
      }
      update({ local });
      // Calls only ring while the partner has the app open (Realtime presence). Otherwise log a missed call,
      // which also sends them a push notification.
      if (!partnerOnlineRef.current) {
        finish(`${partnerName} is offline`, "missed");
        return;
      }
      const peer = await createPeer(callId, local);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      if (!sendSignal({ kind: "offer", callId, video, sdp: peer.localDescription!.toJSON() })) {
        finish("You are offline");
        return;
      }
      ring(true);
      timers.current.push(
        setTimeout(() => {
          if (callRef.current.callId === callId && callRef.current.phase === "outgoing") {
            sendSignal({ kind: "end", callId });
            finish("No answer", "missed");
          }
        }, RING_TIMEOUT_MS),
      );
    },
    [createPeer, finish, partnerName, ring, sendSignal, toast, update],
  );

  const accept = useCallback(async () => {
    const c = callRef.current;
    if (c.phase !== "incoming" || !c.callId || !remoteOffer.current) return;
    ring(null);
    update({ phase: "connecting" });
    let local: MediaStream;
    try {
      local = await getMedia(c.video);
    } catch (err) {
      sendSignal({ kind: "reject", callId: c.callId });
      finish("Couldn't answer");
      toast({ title: "Can't answer the call", body: (err as Error).message, tone: "error" });
      return;
    }
    update({ local });
    const peer = await createPeer(c.callId, local);
    await peer.setRemoteDescription(remoteOffer.current);
    await flushIce();
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    sendSignal({ kind: "answer", callId: c.callId, sdp: peer.localDescription!.toJSON() });
  }, [createPeer, finish, flushIce, ring, sendSignal, toast, update]);

  const decline = useCallback(() => {
    const c = callRef.current;
    if (c.callId) sendSignal({ kind: "reject", callId: c.callId });
    finish("Declined");
  }, [finish, sendSignal]);

  const hangUp = useCallback(() => {
    const c = callRef.current;
    if (c.callId) sendSignal({ kind: "end", callId: c.callId });
    finish(c.startedAt ? "Call ended" : "Cancelled", "missed");
  }, [finish, sendSignal]);

  const toggleMute = useCallback(() => {
    const c = callRef.current;
    const muted = !c.muted;
    c.local?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    update({ muted });
  }, [update]);

  const toggleCamera = useCallback(() => {
    const c = callRef.current;
    const cameraOff = !c.cameraOff;
    c.local?.getVideoTracks().forEach((t) => (t.enabled = !cameraOff));
    update({ cameraOff });
  }, [update]);

  const flipCamera = useCallback(async () => {
    const c = callRef.current;
    const peer = pc.current;
    if (!c.local || !peer || !c.video) return;
    facing.current = facing.current === "user" ? "environment" : "user";
    try {
      const next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing.current } });
      const track = next.getVideoTracks()[0];
      const sender = peer.getSenders().find((s) => s.track?.kind === "video");
      await sender?.replaceTrack(track);
      c.local.getVideoTracks().forEach((t) => {
        t.stop();
        c.local!.removeTrack(t);
      });
      c.local.addTrack(track);
      update({ local: new MediaStream(c.local.getTracks()) });
    } catch {
      toast({ title: "Couldn't switch camera", tone: "error" });
    }
  }, [toast, update]);

  // Incoming signals.
  useEffect(
    () =>
      subscribe((e) => {
        if (e.t !== "call") return;
        const data: CallSignal = e.data;
        const c = callRef.current;
        if (e.from === me.id) {
          // One of our own other devices answered or declined: stop ringing on this one.
          if ((data.kind === "answer" || data.kind === "reject") && c.phase === "incoming" && data.callId === c.callId) {
            finish("Answered on another device");
          }
          return;
        }
        if (data.kind === "offer") {
          if (c.phase !== "idle" && c.phase !== "ended") {
            sendSignal({ kind: "busy", callId: data.callId });
            return;
          }
          timers.current.forEach(clearTimeout);
          timers.current = [];
          remoteOffer.current = data.sdp;
          pendingIce.current = [];
          update({ ...IDLE, phase: "incoming", callId: data.callId, video: data.video, outgoing: false });
          sendSignal({ kind: "ringing", callId: data.callId });
          ring(false);
          navigator.vibrate?.([400, 200, 400, 200, 400]);
          if (document.visibilityState !== "visible" && typeof Notification !== "undefined" && Notification.permission === "granted") {
            void navigator.serviceWorker?.ready.then((reg) =>
              reg.showNotification(partnerName, {
                body: data.video ? "Incoming video call" : "Incoming voice call",
                tag: "call",
                icon: "/icons/icon-192.png",
                requireInteraction: true,
              }),
            );
          }
          timers.current.push(
            setTimeout(() => {
              if (callRef.current.callId === data.callId && callRef.current.phase === "incoming") finish("Missed call");
            }, RING_TIMEOUT_MS + 2000),
          );
          return;
        }
        if (data.callId !== c.callId) return;
        switch (data.kind) {
          case "ringing":
            update({ ringing: true });
            break;
          case "answer":
            update({ phase: "connecting" });
            ring(null);
            void pc.current
              ?.setRemoteDescription(data.sdp)
              .then(flushIce)
              .catch(() => finish("Connection failed", "ended"));
            break;
          case "ice":
            if (pc.current?.remoteDescription) void pc.current.addIceCandidate(data.candidate).catch(() => {});
            else pendingIce.current.push(data.candidate);
            break;
          case "reject":
            finish(c.outgoing ? `${partnerName} declined` : "Answered on another device", c.outgoing ? "declined" : undefined);
            break;
          case "busy":
            finish(`${partnerName} is on another call`, "missed");
            break;
          case "unavailable":
            finish(`${partnerName} is offline`, "missed");
            break;
          case "end":
            finish(c.startedAt ? "Call ended" : c.outgoing ? "Call ended" : "Missed call", "missed");
            break;
        }
      }),
    [finish, flushIce, me.id, partnerName, ring, sendSignal, subscribe, update],
  );

  // Hang up cleanly if the tab closes mid-call.
  useEffect(() => {
    const onUnload = () => {
      const c = callRef.current;
      if (c.callId && c.phase !== "idle" && c.phase !== "ended") sendSignal({ kind: "end", callId: c.callId });
    };
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, [sendSignal]);

  return (
    <CallContext.Provider value={{ call, startCall, accept, decline, hangUp, toggleMute, toggleCamera, flipCamera }}>
      {children}
    </CallContext.Provider>
  );
}

function VideoView({ stream, muted, mirrored, className }: { stream: MediaStream | null; muted?: boolean; mirrored?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={`${className} ${mirrored ? "-scale-x-100" : ""}`} />;
}

function AudioSink({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

function Timer({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <>{formatDuration((now - since) / 1000)}</>;
}

function RoundButton({
  onClick,
  label,
  children,
  tone = "glass",
  active = false,
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
  tone?: "glass" | "red" | "green";
  active?: boolean;
}) {
  const tones = {
    glass: active ? "bg-white text-zinc-900" : "bg-white/15 text-white hover:bg-white/25",
    red: "bg-red-500 text-white hover:bg-red-600",
    green: "bg-emerald-500 text-white hover:bg-emerald-600",
  };
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button onClick={onClick} aria-label={label} className={`flex size-16 items-center justify-center rounded-full backdrop-blur transition active:scale-95 ${tones[tone]}`}>
        {children}
      </button>
      <span className="text-xs text-white/80">{label}</span>
    </div>
  );
}

export function CallOverlay() {
  const { call, accept, decline, hangUp, toggleMute, toggleCamera, flipCamera } = useCall();
  const { partner, partnerName } = useApp();
  if (call.phase === "idle") return null;

  const remoteHasVideo = !!call.remote?.getVideoTracks().length && call.video;
  const status =
    call.phase === "ended"
      ? call.endLabel
      : call.phase === "incoming"
        ? `Incoming ${call.video ? "video" : "voice"} call`
        : call.phase === "outgoing"
          ? call.ringing
            ? "Ringing..."
            : "Calling..."
          : call.phase === "connecting"
            ? "Connecting..."
            : null;

  return (
    <div className="fixed inset-0 z-[80] flex animate-fade flex-col overflow-hidden bg-zinc-950 text-white" role="dialog" aria-label="Call">
      {remoteHasVideo ? (
        <VideoView stream={call.remote} muted className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-linear-to-br from-rose-600 via-pink-700 to-violet-900">
          <div className="absolute inset-0 bg-black/20" />
        </div>
      )}
      <AudioSink stream={call.remote} />

      <div className="relative flex flex-col items-center gap-3 px-6 pt-[max(3rem,env(safe-area-inset-top))] text-center">
        {!remoteHasVideo && (
          <div className={call.phase === "incoming" || call.phase === "outgoing" ? "animate-beat" : ""}>
            <Avatar src={partner.avatarUrl} name={partnerName} size={112} className="shadow-2xl ring-4 ring-white/20 rounded-full" />
          </div>
        )}
        <h2 className="text-2xl font-semibold drop-shadow">{partnerName}</h2>
        <p className="text-sm text-white/80 drop-shadow">
          {status ?? (call.startedAt ? <Timer since={call.startedAt} /> : null)}
          {call.phase === "active" && call.muted ? " - muted" : ""}
        </p>
      </div>

      {call.video && call.local && call.phase !== "ended" && (
        <VideoView
          stream={call.local}
          muted
          mirrored={true}
          className={`absolute right-4 bottom-36 h-44 w-32 rounded-2xl bg-zinc-800 object-cover shadow-2xl ring-1 ring-white/20 sm:h-56 sm:w-40 ${call.cameraOff ? "opacity-0" : ""}`}
        />
      )}

      <div className="relative mt-auto flex justify-center gap-6 px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        {call.phase === "incoming" ? (
          <>
            <RoundButton onClick={decline} label="Decline" tone="red">
              <PhoneOff className="size-7" />
            </RoundButton>
            <RoundButton onClick={() => void accept()} label="Accept" tone="green">
              {call.video ? <Video className="size-7" /> : <Phone className="size-7" />}
            </RoundButton>
          </>
        ) : call.phase !== "ended" ? (
          <>
            <RoundButton onClick={toggleMute} label={call.muted ? "Unmute" : "Mute"} active={call.muted}>
              {call.muted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
            </RoundButton>
            {call.video && (
              <>
                <RoundButton onClick={toggleCamera} label={call.cameraOff ? "Camera on" : "Camera off"} active={call.cameraOff}>
                  {call.cameraOff ? <VideoOff className="size-6" /> : <Video className="size-6" />}
                </RoundButton>
                <RoundButton onClick={() => void flipCamera()} label="Flip">
                  <SwitchCamera className="size-6" />
                </RoundButton>
              </>
            )}
            <RoundButton onClick={hangUp} label="End" tone="red">
              <PhoneOff className="size-7" />
            </RoundButton>
          </>
        ) : null}
      </div>
    </div>
  );
}
