// Tiny synthesized sounds, so the app ships no audio files.
let ctx: AudioContext | null = null;

function audio() {
  if (typeof window === "undefined") return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function soundEnabled() {
  return typeof localStorage !== "undefined" && localStorage.getItem("tg-sound") !== "off";
}

function tone(freq: number, start: number, length: number, gain = 0.08, type: OscillatorType = "sine") {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, a.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, a.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + length);
  osc.connect(g).connect(a.destination);
  osc.start(a.currentTime + start);
  osc.stop(a.currentTime + start + length + 0.05);
}

export function playIncoming() {
  if (!soundEnabled()) return;
  tone(880, 0, 0.12);
  tone(1320, 0.09, 0.18);
}

export function playSent() {
  if (!soundEnabled()) return;
  tone(660, 0, 0.08, 0.04);
}

export function playNudge() {
  if (!soundEnabled()) return;
  [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.25, 0.06));
}

/** Ringing pattern for calls. Returns a stop function. */
export function startRingtone(outgoing: boolean) {
  const ring = () => {
    if (outgoing) {
      tone(440, 0, 0.9, 0.05);
      tone(480, 0, 0.9, 0.05);
    } else {
      [0, 0.25].forEach((s) => {
        tone(988, s, 0.2, 0.08, "triangle");
        tone(1319, s + 0.1, 0.2, 0.06, "triangle");
      });
    }
  };
  ring();
  const timer = setInterval(ring, outgoing ? 3000 : 2000);
  return () => clearInterval(timer);
}
