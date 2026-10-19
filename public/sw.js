// Twogether service worker: offline shell, media cache and push notifications.
const VERSION = "tg-v1";
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;
const MEDIA = `${VERSION}-media`;
const PAGES = `${VERSION}-pages`;
const PRECACHE = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/badge-96.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.status === 200) {
    await cache.put(request, res.clone());
    if (maxEntries) {
      const keys = await cache.keys();
      for (const k of keys.slice(0, Math.max(0, keys.length - maxEntries))) await cache.delete(k);
    }
  }
  return res;
}

// Registered as /sw.js?dev=1 by `npm run dev`: no caching, so hot reload always sees fresh code.
const DEV = new URL(self.location.href).searchParams.has("dev");

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (DEV || request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Immutable build assets and icons.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request, STATIC, 300));
    return;
  }
  // Photos and voice notes never change once uploaded. Range requests (video seeking) go to the network.
  if (url.pathname.startsWith("/api/media/") && !request.headers.has("range")) {
    event.respondWith(cacheFirst(request, MEDIA, 400).catch(() => Response.error()));
    return;
  }
  // Pages: network first, then the last copy we saw, then the offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const preload = await event.preloadResponse;
          const res = preload || (await fetch(request));
          if (res.ok && !res.redirected) {
            const cache = await caches.open(PAGES);
            await cache.put(request, res.clone());
          }
          return res;
        } catch {
          const cached = await caches.match(request, { cacheName: PAGES });
          return cached || (await caches.match("/offline.html"));
        }
      })(),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Twogether", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    (async () => {
      // Skip the system notification if the app is already open and focused.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (windows.some((w) => w.focused && w.visibilityState === "visible")) return;
      await self.registration.showNotification(data.title || "Twogether", {
        body: data.body || "",
        icon: data.icon || "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        tag: data.tag || "chat",
        renotify: true,
        vibrate: data.tag === "nudge" ? [80, 60, 80, 60, 200] : [100, 50, 100],
        data: { url: data.url || "/" },
      });
      if (navigator.setAppBadge) navigator.setAppBadge().catch(() => {});
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin) {
          await w.focus();
          if (w.url !== target && "navigate" in w) await w.navigate(target).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
