"use client";

import { Bell, Camera, Download, HeartCrack, KeyRound, LogOut, Monitor, Moon, Palette, Smartphone, Sun, UserRound, Volume2 } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useApp } from "@/components/app/AppProvider";
import { clearOfflineData } from "@/components/app/PwaRegister";
import { Avatar } from "@/components/ui/Avatar";
import { Sheet } from "@/components/ui/Sheet";
import { Spinner } from "@/components/ui/Spinner";
import { api, prepareImage, uploadFile } from "@/lib/client/api";
import { currentSubscription, disablePush, enablePush, pushSupported } from "@/lib/client/push";
import type { Me } from "@/lib/types";
import { WALLPAPERS } from "@/lib/wallpapers";

type ThemePref = "light" | "dark" | "system";

function applyTheme(t: ThemePref) {
  localStorage.setItem("tg-theme", t);
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

const noop = () => () => {};
const useHydrated = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

function Section({ id, title, icon: Icon, children }: { id?: string; title: string; icon: typeof Bell; children: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-4 p-5">
      <h2 className="mb-4 flex items-center gap-2 font-semibold">
        <Icon className="size-5 text-rose-500" /> {title}
      </h2>
      {children}
    </section>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange(v: boolean): void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-rose-500" : "bg-zinc-300 dark:bg-zinc-600"}`}>
      <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
    </button>
  );
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function SettingsView() {
  const { me, partner, partnerName, couple, patchMe, refreshCouple, toast } = useApp();
  const hydrated = useHydrated();
  const [name, setName] = useState(me.name);
  const [nick, setNick] = useState(me.partnerNickname ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [theme, setTheme] = useState<ThemePref>(() => (typeof window === "undefined" ? "system" : ((localStorage.getItem("tg-theme") as ThemePref) ?? "system")));
  const [sound, setSound] = useState(() => typeof window === "undefined" || localStorage.getItem("tg-sound") !== "off");
  const [push, setPush] = useState<"unsupported" | "off" | "on" | "busy">("off");
  const [install, setInstall] = useState<InstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const [unlinkText, setUnlinkText] = useState("");
  const avatarInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    if (!pushSupported()) {
      queueMicrotask(() => alive && setPush("unsupported"));
    } else {
      void currentSubscription().then((s) => alive && setPush(s && Notification.permission === "granted" ? "on" : "off"));
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    queueMicrotask(() => alive && setStandalone(window.matchMedia("(display-mode: standalone)").matches));
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
    return () => {
      alive = false;
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api<{ me: Me }>("/api/profile", { method: "PATCH", json: { name, partnerNickname: nick.trim() || null } });
      patchMe(r.me);
      toast({ title: "Profile saved" });
    } catch (err) {
      toast({ title: "Couldn't save", body: (err as Error).message, tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const changeAvatar = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const img = await prepareImage(file);
      const up = await uploadFile(img.blob, img.name);
      const r = await api<{ me: Me }>("/api/profile", { method: "PATCH", json: { avatarMediaId: up.id } });
      patchMe(r.me);
    } catch (err) {
      toast({ title: "Couldn't update photo", body: (err as Error).message, tone: "error" });
    } finally {
      setUploading(false);
    }
  };

  const togglePush = async (on: boolean) => {
    setPush("busy");
    try {
      if (on) await enablePush();
      else await disablePush();
      setPush(on ? "on" : "off");
    } catch (err) {
      setPush("off");
      toast({ title: "Notifications", body: (err as Error).message, tone: "error" });
    }
  };

  const setWallpaper = async (id: string) => {
    try {
      await api("/api/couple", { method: "PATCH", json: { wallpaper: id } });
      await refreshCouple();
    } catch (err) {
      toast({ title: "Couldn't change wallpaper", body: (err as Error).message, tone: "error" });
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/profile", { method: "PATCH", json: { currentPassword: pw.current, newPassword: pw.next } });
      setPwOpen(false);
      setPw({ current: "", next: "" });
      toast({ title: "Password changed" });
    } catch (err) {
      toast({ title: "Couldn't change password", body: (err as Error).message, tone: "error" });
    }
  };

  const logout = async () => {
    await disablePush().catch(() => {});
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    await clearOfflineData();
    localStorage.removeItem("tg-draft");
    window.location.href = "/login";
  };

  const unlink = async () => {
    try {
      await api("/api/couple", { method: "DELETE", json: { confirm: "UNLINK" } });
      await clearOfflineData();
      window.location.href = "/pair";
    } catch (err) {
      toast({ title: "Couldn't unlink", body: (err as Error).message, tone: "error" });
    }
  };

  // Theme and sound come from localStorage, so render after hydration to avoid a mismatch.
  if (!hydrated) return null;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  return (
    <div className="scrollbar-thin h-full overflow-y-auto pt-safe">
      <div className="mx-auto max-w-2xl space-y-4 p-4 pb-8 sm:p-6">
        <h1 className="px-1 pt-2 text-2xl font-bold">Settings</h1>

        <Section title="Profile" icon={UserRound}>
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => avatarInput.current?.click()} className="group relative rounded-full" aria-label="Change profile photo">
                <Avatar src={me.avatarUrl} name={me.name} size={76} />
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition group-hover:opacity-100">
                  {uploading ? <Spinner /> : <Camera className="size-6" />}
                </span>
              </button>
              <input ref={avatarInput} type="file" accept="image/*" hidden onChange={(e) => void changeAvatar(e.target.files?.[0])} />
              <div className="min-w-0">
                <p className="truncate font-semibold">{me.name}</p>
                <p className="truncate text-sm text-zinc-500">{me.email}</p>
                {me.avatarUrl && (
                  <button
                    type="button"
                    className="mt-1 text-xs text-zinc-500 hover:text-red-500"
                    onClick={async () => patchMe((await api<{ me: Me }>("/api/profile", { method: "PATCH", json: { avatarMediaId: null } })).me)}
                  >
                    Remove photo
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="name">
                Your name
              </label>
              <input id="name" className="field" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label className="label" htmlFor="nick">
                What you call {partner.name}
              </label>
              <input id="nick" className="field" value={nick} maxLength={30} placeholder={`e.g. Babe, Sunshine, ${partner.name}`} onChange={(e) => setNick(e.target.value)} />
              <p className="mt-1 text-xs text-zinc-500">Only you see this nickname. It shows in the chat and in your notifications.</p>
            </div>
            <button className="btn-primary" disabled={saving}>
              {saving && <Spinner className="size-4" />} Save
            </button>
          </form>
        </Section>

        <Section id="appearance" title="Appearance" icon={Palette}>
          <p className="label">Theme</p>
          <div className="mb-5 grid grid-cols-3 gap-2">
            {(
              [
                ["light", "Light", Sun],
                ["dark", "Dark", Moon],
                ["system", "Auto", Monitor],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => {
                  setTheme(id);
                  applyTheme(id);
                }}
                className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 py-3 text-sm font-medium transition ${hydrated && theme === id ? "border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200" : "border-transparent bg-zinc-100 dark:bg-white/5"}`}
              >
                <Icon className="size-5" /> {label}
              </button>
            ))}
          </div>
          <p className="label">Chat wallpaper (shared with {partnerName})</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {WALLPAPERS.map((w) => (
              <button
                key={w.id}
                onClick={() => void setWallpaper(w.id)}
                className={`flex aspect-[3/4] items-end justify-center rounded-2xl border-2 pb-2 text-xs font-medium [background-image:var(--l)] dark:[background-image:var(--d)] ${couple.wallpaper === w.id ? "border-rose-500" : "border-transparent ring-1 ring-zinc-900/5 dark:ring-white/10"}`}
                style={{ "--l": w.light, "--d": w.dark, backgroundSize: "60px 60px, 100% 100%" } as React.CSSProperties}
                aria-pressed={couple.wallpaper === w.id}
              >
                <span className="rounded-full bg-white/80 px-2 py-0.5 dark:bg-black/50">{w.name}</span>
              </button>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Volume2 className="size-5 text-zinc-500" />
              <span className="text-sm">In-app sounds</span>
            </div>
            <Toggle
              label="In-app sounds"
              on={sound}
              onChange={(v) => {
                setSound(v);
                localStorage.setItem("tg-sound", v ? "on" : "off");
              }}
            />
          </div>
        </Section>

        <Section title="Notifications" icon={Bell}>
          {push === "unsupported" ? (
            <p className="text-sm text-zinc-500">
              {isIOS ? "On iPhone, add Twogether to your Home Screen first (below), then open it from there to turn on notifications." : "This browser doesn't support push notifications."}
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Push notifications on this device</p>
                  <p className="text-xs text-zinc-500">Messages, hugs and missed calls when the app is closed.</p>
                </div>
                {push === "busy" ? <Spinner className="size-6 text-rose-500" /> : <Toggle label="Push notifications" on={push === "on"} onChange={(v) => void togglePush(v)} />}
              </div>
              {push === "on" && (
                <button
                  className="btn-soft mt-4"
                  onClick={async () => {
                    const r = await api<{ sent: number }>("/api/push", { method: "PUT" }).catch(() => ({ sent: 0 }));
                    toast({ title: r.sent ? "Test sent. Lock your screen to see it." : "No devices registered yet" });
                  }}
                >
                  Send a test notification
                </button>
              )}
              <p className="mt-3 text-xs text-zinc-500">Notifications need the app to be opened over https (or on localhost).</p>
            </>
          )}
        </Section>

        {!standalone && (
          <Section title="Install the app" icon={Smartphone}>
            {install ? (
              <button
                className="btn-primary"
                onClick={async () => {
                  await install.prompt();
                  await install.userChoice;
                  setInstall(null);
                }}
              >
                <Download className="size-4" /> Install Twogether
              </button>
            ) : isIOS ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                In Safari, tap the <strong>Share</strong> button, then <strong>Add to Home Screen</strong>.
              </p>
            ) : (
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                Use your browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
              </p>
            )}
          </Section>
        )}

        <Section title="Account" icon={KeyRound}>
          <div className="flex flex-wrap gap-2">
            <button className="btn-soft" onClick={() => setPwOpen(true)}>
              <KeyRound className="size-4" /> Change password
            </button>
            <a className="btn-soft" href={hydrated ? `/api/messages/export?tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}` : "/api/messages/export"}>
              <Download className="size-4" /> Export chat
            </a>
            <button className="btn-ghost" onClick={() => void logout()}>
              <LogOut className="size-4" /> Sign out
            </button>
          </div>
          <div className="mt-6 rounded-2xl border border-red-200 p-4 dark:border-red-500/20">
            <p className="flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400">
              <HeartCrack className="size-4" /> Unlink from {partnerName}
            </p>
            <p className="mt-1 text-xs text-zinc-500">Deletes your shared chat, photos, dates and lists for both of you. This can&apos;t be undone.</p>
            <button className="btn-danger mt-3" onClick={() => setUnlinkOpen(true)}>
              Unlink
            </button>
          </div>
        </Section>
      </div>

      <Sheet open={pwOpen} onClose={() => setPwOpen(false)} title="Change password">
        <form onSubmit={changePassword} className="space-y-3">
          <input type="password" className="field" placeholder="Current password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required />
          <input type="password" className="field" placeholder="New password (8+ characters)" autoComplete="new-password" minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required />
          <button className="btn-primary w-full py-3">Change password</button>
        </form>
      </Sheet>

      <Sheet open={unlinkOpen} onClose={() => setUnlinkOpen(false)} title="Unlink and delete everything?">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Your whole chat with {partnerName}, every photo and voice note, your dates and bucket list will be deleted for both of you. Type <strong>UNLINK</strong> to confirm.
        </p>
        <input className="field mt-4" value={unlinkText} onChange={(e) => setUnlinkText(e.target.value)} placeholder="UNLINK" autoCapitalize="characters" />
        <button className="btn-danger mt-3 w-full py-3" disabled={unlinkText !== "UNLINK"} onClick={() => void unlink()}>
          Delete and unlink
        </button>
      </Sheet>
    </div>
  );
}
