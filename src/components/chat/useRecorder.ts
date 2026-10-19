"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface Recording {
  blob: Blob;
  duration: number;
  peaks: number[];
  mime: string;
}

const MIME_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];

/** Records a voice note with MediaRecorder and samples its loudness for the waveform. */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const samples = useRef<number[]>([]);
  const startedAt = useRef(0);
  const cleanup = useRef<() => void>(() => {});

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      throw new Error("Voice messages need a secure connection (https or localhost).");
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      throw new Error("Allow microphone access to record voice messages.");
    }
    const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 48_000 } : undefined);
    chunks.current = [];
    samples.current = [];
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);

    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const tick = setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      const rms = Math.min(1, Math.sqrt(sum / data.length) * 3);
      samples.current.push(rms);
      setLevel(rms);
      setElapsed((Date.now() - startedAt.current) / 1000);
    }, 100);

    cleanup.current = () => {
      clearInterval(tick);
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    };
    recorder.current = rec;
    startedAt.current = Date.now();
    setElapsed(0);
    rec.start(250);
    setRecording(true);
  }, []);

  const stop = useCallback(
    () =>
      new Promise<Recording | null>((resolve) => {
        const rec = recorder.current;
        if (!rec) return resolve(null);
        rec.onstop = () => {
          cleanup.current();
          const duration = (Date.now() - startedAt.current) / 1000;
          const mime = (rec.mimeType || "audio/webm").split(";")[0];
          const blob = new Blob(chunks.current, { type: mime });
          // Downsample loudness to 40 bars for the waveform.
          const s = samples.current;
          const n = 40;
          const peaks = Array.from({ length: n }, (_, i) => {
            const slice = s.slice(Math.floor((i * s.length) / n), Math.floor(((i + 1) * s.length) / n));
            return slice.length ? Math.max(...slice) : 0;
          });
          const max = Math.max(0.05, ...peaks);
          recorder.current = null;
          setRecording(false);
          setLevel(0);
          resolve(duration < 0.6 ? null : { blob, duration, peaks: peaks.map((p) => Math.round((p / max) * 100) / 100), mime });
        };
        rec.stop();
      }),
    [],
  );

  const cancel = useCallback(() => {
    const rec = recorder.current;
    if (!rec) return;
    rec.onstop = () => cleanup.current();
    rec.stop();
    recorder.current = null;
    setRecording(false);
    setLevel(0);
  }, []);

  useEffect(() => () => cleanup.current(), []);

  return { recording, elapsed, level, start, stop, cancel };
}
