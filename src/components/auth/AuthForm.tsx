"use client";

import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/client/api";

/** Only allow same-site relative redirects after sign-in. */
function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function AuthForm({ mode, next }: { mode: "login" | "register"; next?: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const register = mode === "register";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api(register ? "/api/auth/register" : "/api/auth/login", { json: register ? { name, email, password } : { email, password } });
      // Full navigation so the server layout picks up the new session cookie.
      window.location.href = register && safeNext(next) === "/" ? "/pair" : safeNext(next);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <form onSubmit={submit} className="card animate-slide-up space-y-4 p-6">
      <h2 className="text-xl font-semibold">{register ? "Create your account" : "Welcome back"}</h2>
      {register && (
        <div>
          <label className="label" htmlFor="name">
            Your name
          </label>
          <input id="name" className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" required maxLength={40} placeholder="Alex" />
        </div>
      )}
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input id="email" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required placeholder="you@example.com" />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={show ? "text" : "password"}
            className="field pr-12"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={register ? "new-password" : "current-password"}
            required
            minLength={register ? 8 : undefined}
            placeholder={register ? "At least 8 characters" : ""}
          />
          <button type="button" className="icon-btn absolute top-1/2 right-1 -translate-y-1/2" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      {error && (
        <p className="rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300" role="alert">
          {error}
        </p>
      )}
      <button className="btn-primary w-full py-3" disabled={busy}>
        {busy && <Spinner className="size-4" />}
        {register ? "Create account" : "Sign in"}
      </button>
      <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
        {register ? "Already have an account? " : "New here? "}
        <Link href={(register ? "/login" : "/register") + nextQuery} className="font-semibold text-rose-600 hover:underline dark:text-rose-300">
          {register ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
