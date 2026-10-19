"use client";

import { useEffect, useState } from "react";
import type { NudgeKind } from "@/lib/types";
import { useApp } from "./AppProvider";

const PARTICLES: Record<NudgeKind, string[]> = {
  hug: ["🤗", "💞", "💗", "🫶"],
  kiss: ["😘", "💋", "💕", "❤️"],
  miss: ["🥺", "💌", "💗", "🌙"],
  thinking: ["💭", "✨", "💗", "🌸"],
  love: ["❤️", "💖", "💘", "💝"],
};

const TITLE: Record<NudgeKind, string> = {
  hug: "sent you a hug",
  kiss: "sent you a kiss",
  miss: "misses you",
  thinking: "is thinking of you",
  love: "loves you",
};

interface Burst {
  id: number;
  kind: NudgeKind;
  fromMe: boolean;
  particles: { emoji: string; left: number; dx: number; delay: number; dur: number; size: number; rot: number }[];
}

let seq = 0;

/** Full-screen floating hearts when a hug, kiss or other nudge arrives. */
export function LoveBurst() {
  const { subscribe, partnerName } = useApp();
  const [bursts, setBursts] = useState<Burst[]>([]);

  useEffect(
    () =>
      subscribe((e) => {
        if (e.t !== "local:nudge" || !PARTICLES[e.kind]) return;
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const set = PARTICLES[e.kind];
        const burst: Burst = {
          id: ++seq,
          kind: e.kind,
          fromMe: e.fromMe,
          particles: Array.from({ length: reduced ? 0 : 26 }, (_, i) => ({
            emoji: set[i % set.length],
            left: 5 + Math.random() * 90,
            dx: (Math.random() - 0.5) * 160,
            delay: Math.random() * 0.9,
            dur: 2.2 + Math.random() * 1.4,
            size: 22 + Math.random() * 26,
            rot: (Math.random() - 0.5) * 70,
          })),
        };
        setBursts((b) => [...b, burst]);
        setTimeout(() => setBursts((b) => b.filter((x) => x.id !== burst.id)), 4000);
      }),
    [subscribe],
  );

  if (!bursts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-live="polite">
      {bursts.map((b) => (
        <div key={b.id}>
          {b.particles.map((p, i) => (
            <span
              key={i}
              className="absolute bottom-0 animate-float-heart opacity-0"
              style={
                {
                  left: `${p.left}%`,
                  fontSize: p.size,
                  animationDelay: `${p.delay}s`,
                  "--dur": `${p.dur}s`,
                  "--dx": `${p.dx}px`,
                  "--rot": `${p.rot}deg`,
                } as React.CSSProperties
              }
            >
              {p.emoji}
            </span>
          ))}
          {!b.fromMe && (
            <div className="absolute inset-x-0 top-1/3 flex justify-center">
              <div className="animate-pop rounded-3xl bg-white/90 px-6 py-4 text-center shadow-2xl ring-1 ring-rose-200 backdrop-blur dark:bg-night-2/90 dark:ring-rose-500/20">
                <div className="animate-beat text-5xl">{PARTICLES[b.kind][0]}</div>
                <p className="mt-2 font-semibold">
                  {partnerName} {TITLE[b.kind]}
                </p>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
