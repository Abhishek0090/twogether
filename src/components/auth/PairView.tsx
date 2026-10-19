"use client";

import { Check, Copy, Heart, LogOut, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/client/api";

export function PairView({ name, existingCode, joinCode }: { name: string; existingCode: string | null; joinCode: string }) {
  const [code, setCode] = useState(existingCode);
  const [input, setInput] = useState(joinCode);
  const [busy, setBusy] = useState<"invite" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // While our code is out there, check whether our partner has joined.
  useEffect(() => {
    if (!code) return;
    const timer = setInterval(async () => {
      const me = await api<{ paired: boolean }>("/api/auth/me").catch(() => null);
      if (me?.paired) window.location.href = "/";
    }, 3000);
    return () => clearInterval(timer);
  }, [code]);

  const createInvite = async () => {
    setBusy("invite");
    setError(null);
    try {
      setCode((await api<{ code: string }>("/api/couple/invite", { method: "POST" })).code);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("join");
    setError(null);
    try {
      await api("/api/couple/join", { json: { code: input } });
      window.location.href = "/";
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };

  const link = code && typeof window !== "undefined" ? `${window.location.origin}/pair?code=${code}` : "";
  const share = async () => {
    const text = `Join me on Twogether 💞 Use my code ${code} or open ${link}`;
    if (navigator.share) await navigator.share({ title: "Twogether", text, url: link }).catch(() => {});
    else {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-linear-to-br from-rose-50 via-white to-pink-50 px-4 py-10 dark:from-night dark:via-night dark:to-[#1a0d14]">
      <div className="pointer-events-none absolute -top-32 -right-32 size-96 rounded-full bg-rose-300/30 blur-3xl dark:bg-rose-600/15" />
      <div className="relative w-full max-w-md space-y-4">
        <div className="text-center">
          <div className="mx-auto mb-4 flex size-16 animate-beat items-center justify-center rounded-full bg-linear-to-br from-rose-500 to-pink-500 text-white shadow-xl shadow-rose-500/30">
            <Heart className="size-8 fill-current" />
          </div>
          <h1 className="text-2xl font-bold">Hi {name}, let&apos;s find your person</h1>
          <p className="mt-1 text-zinc-500 dark:text-zinc-400">Twogether connects exactly two people. Share your code, or enter theirs.</p>
        </div>

        <section className="card p-5">
          <h2 className="font-semibold">Invite your partner</h2>
          {code ? (
            <>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Send them this code. This page opens your chat as soon as they join.</p>
              <div className="mt-4 flex items-center justify-center gap-1.5" aria-label={`Your code is ${code.split("").join(" ")}`}>
                {code.split("").map((c, i) => (
                  <span key={i} className="flex h-14 w-11 items-center justify-center rounded-xl bg-rose-50 font-mono text-2xl font-bold text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
                    {c}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  className="btn-soft flex-1"
                  onClick={async () => {
                    await navigator.clipboard.writeText(code);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy code"}
                </button>
                <button className="btn-primary flex-1" onClick={() => void share()}>
                  <Share2 className="size-4" /> Share link
                </button>
              </div>
              <p className="mt-3 flex items-center justify-center gap-2 text-xs text-zinc-500">
                <Spinner className="size-3" /> Waiting for your partner...
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Get a 6-character code to send to your partner.</p>
              <button className="btn-primary mt-4 w-full py-3" onClick={() => void createInvite()} disabled={busy !== null}>
                {busy === "invite" && <Spinner className="size-4" />} Get my invite code
              </button>
            </>
          )}
        </section>

        <div className="flex items-center gap-3 text-xs font-medium tracking-widest text-zinc-400 uppercase">
          <span className="h-px flex-1 bg-zinc-200 dark:bg-white/10" /> or <span className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
        </div>

        <form className="card p-5" onSubmit={join}>
          <h2 className="font-semibold">I have a code</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Enter the code your partner sent you.</p>
          <input
            className="field mt-4 text-center font-mono text-2xl tracking-[0.4em] uppercase"
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            placeholder="ABC123"
            aria-label="Partner's code"
            autoCapitalize="characters"
            autoComplete="off"
            inputMode="text"
          />
          <button className="btn-primary mt-3 w-full py-3" disabled={input.length !== 6 || busy !== null}>
            {busy === "join" && <Spinner className="size-4" />} Connect
          </button>
        </form>

        {error && (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-center text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300" role="alert">
            {error}
          </p>
        )}

        <button
          className="btn-ghost mx-auto flex"
          onClick={async () => {
            await api("/api/auth/logout", { method: "POST" }).catch(() => {});
            window.location.href = "/login";
          }}
        >
          <LogOut className="size-4" /> Sign out
        </button>
      </div>
    </div>
  );
}
