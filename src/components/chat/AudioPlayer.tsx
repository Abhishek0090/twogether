"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatDuration } from "@/lib/format";

// Only one voice note plays at a time.
let current: HTMLAudioElement | null = null;

function fallbackPeaks(seed: number) {
  let x = seed || 1;
  return Array.from({ length: 40 }, () => {
    x = (x * 9301 + 49297) % 233280;
    return 0.25 + (x / 233280) * 0.6;
  });
}

export function AudioPlayer({
  src,
  duration: knownDuration,
  peaks,
  seed,
  mine,
}: {
  src: string;
  duration?: number;
  peaks?: number[];
  seed: number;
  mine: boolean;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(knownDuration ?? 0);
  const [rate, setRate] = useState(1);
  const bars = useMemo(() => (peaks?.length ? peaks : fallbackPeaks(seed)), [peaks, seed]);

  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const onTime = () => setTime(el.currentTime);
    const onMeta = () => Number.isFinite(el.duration) && el.duration > 0 && setDuration(el.duration);
    const onEnd = () => {
      setPlaying(false);
      setTime(0);
    };
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("ended", onEnd);
    el.addEventListener("pause", onPause);
    el.addEventListener("play", onPlay);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("ended", onEnd);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("play", onPlay);
    };
  }, []);

  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) {
      if (current && current !== el) current.pause();
      current = el;
      el.playbackRate = rate;
      void el.play().catch(() => setPlaying(false));
    } else {
      el.pause();
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = audio.current;
    if (!el || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    el.currentTime = Math.min(duration, Math.max(0, ((e.clientX - rect.left) / rect.width) * duration));
    setTime(el.currentTime);
  };

  const cycleRate = () => {
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    if (audio.current) audio.current.playbackRate = next;
  };

  const progress = duration ? time / duration : 0;
  return (
    <div className="flex w-64 max-w-full items-center gap-2 py-1" onClick={(e) => e.stopPropagation()}>
      <audio ref={audio} src={src} preload="metadata" />
      <button
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play voice message"}
        className={`flex size-10 shrink-0 items-center justify-center rounded-full ${mine ? "bg-rose-500 text-white" : "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900"}`}
      >
        {playing ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex h-8 cursor-pointer items-center gap-[2px]" onClick={seek} role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(time)} tabIndex={0}>
          {bars.map((p, i) => (
            <span
              key={i}
              className={`flex-1 rounded-full transition-colors ${i / bars.length < progress ? (mine ? "bg-rose-500" : "bg-zinc-700 dark:bg-zinc-200") : "bg-zinc-400/50 dark:bg-zinc-500/50"}`}
              style={{ height: `${Math.max(12, p * 100)}%` }}
            />
          ))}
        </div>
        <div className="flex justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
          <span>{formatDuration(playing || time ? time : duration)}</span>
          <button onClick={cycleRate} className="rounded-full bg-black/5 px-1.5 font-semibold dark:bg-white/10" aria-label="Playback speed">
            {rate}x
          </button>
        </div>
      </div>
    </div>
  );
}
