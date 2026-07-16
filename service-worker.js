/* ============================================================
   Durga Residency — Service Worker (offline + auto-update)
   Strategy:
     - Precache the app shell + vendored libs/fonts/icons.
     - Navigations: network-first, fall back to cached shell (offline).
     - Same-origin static assets: cache-first (fast startup).
     - Auto-update: new SW installs in background; page is notified
       and can activate it via SKIP_WAITING.
   NOTE: bump CACHE_VERSION on every deploy to ship an update.
   ============================================================ */
const CACHE_VERSION = "durga-v14.0.0";
const CORE_CACHE = CACHE_VERSION + "-core";
const RUNTIME_CACHE = CACHE_VERSION + "-runtime";

/* Files cached up-front so first launch after install works offline. */
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./favicon.ico",
  "./apple-touch-icon.png",
  "./vendor/tailwind.browser.js",
  "./vendor/chart.umd.min.js",
  "./vendor/fonts.css",
  "./vendor/inter-300.woff2",
  "./vendor/inter-400.woff2",
  "./vendor/inter-500.woff2",
  "./vendor/inter-600.woff2",
  "./vendor/inter-700.woff2",
  "./vendor/inter-800.woff2",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE).then((cache) =>
      // Cache individually so one 404 never fails the whole install.
      Promise.all(CORE_ASSETS.map((url) =>
        cache.add(new Request(url, { cache: "reload" })).catch(() => null)
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => {
        if (k !== CORE_CACHE && k !== RUNTIME_CACHE) return caches.delete(k);
      }))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // App navigations → network-first, offline fallback to cached shell.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req).then((r) => r || caches.match("./index.html"))
        )
    );
    return;
  }

  // Same-origin static assets → cache-first, then network (and cache it).
  if (sameOrigin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // Cross-origin (should be none at runtime) → network, fall back to cache.
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});
