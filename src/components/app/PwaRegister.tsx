"use client";

import { useEffect } from "react";

const SW_URL = process.env.NODE_ENV === "development" ? "/sw.js?dev=1" : "/sw.js";

/** Registers the service worker (offline shell, media cache and push notifications). */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(SW_URL, { scope: "/", updateViaCache: "none" }).catch((err) => {
      console.warn("Service worker registration failed", err);
    });
  }, []);
  return null;
}

/** Removes cached pages and media, e.g. on sign out. */
export async function clearOfflineData() {
  if (typeof caches === "undefined") return;
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.includes("-pages") || k.includes("-media")).map((k) => caches.delete(k)));
}
