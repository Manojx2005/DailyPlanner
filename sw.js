"use strict";
/* ============================================================
   Day Planner — Service Worker
   Cache name: bump the version string to force a cache refresh.
   ============================================================ */

const CACHE_NAME = "dayplanner-v7";

const APP_SHELL = [
  "./",
  "./index.html",
  "./css/styles.css?v=1.6",
  "./js/app.js?v=1.6",
  "./js/auth.js?v=1.6",
  "./js/calendar.js?v=1.6",
  "./js/finance.js?v=1.6",
  "./js/fx.js?v=1.6",
  "./js/i18n.js?v=1.6",
  "./js/meals.js?v=1.6",
  "./js/nutrition.js?v=1.6",
  "./js/schedule.js?v=1.6",
  "./js/shopping.js?v=1.6",
  "./js/sync.js?v=1.6",
  "./js/week.js?v=1.6",
  "./config.local.js",
  "./firebase-config.js",
  "./manifest.json",
  "./icon.svg",
];

/* ── install: pre-cache app shell ─────────────────────────── */
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cache each asset individually so one failure doesn't abort the whole install.
      const results = await Promise.allSettled(
        APP_SHELL.map((url) => cache.add(url))
      );
      for (let i = 0; i < results.length; i++) {
        if (results[i].status === "rejected") {
          console.warn("[SW] Failed to cache:", APP_SHELL[i], results[i].reason);
        }
      }
    })
  );
});

/* ── activate: delete stale caches ───────────────────────── */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => {
            console.log("[SW] Deleting old cache:", k);
            return caches.delete(k);
          })
      )
    ).then(() => clients.claim())
  );
});

/* ── fetch: cache-first for same-origin, network-only for cross-origin ── */
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only intercept GET requests.
  if (event.request.method !== "GET") return;

  // Cross-origin requests (Firebase, Google Fonts, CDNs) — pass straight through.
  if (url.origin !== self.location.origin) return;

  // Navigations (the HTML document) — network-first so new markup, asset refs,
  // and the CSP are always picked up immediately; fall back to cache when offline.
  if (event.request.mode === "navigate" || event.request.destination === "document") {
    event.respondWith(
      // {cache:"no-store"} skips the browser HTTP cache so GitHub Pages' ~10-min
      // file caching can't keep serving a stale index.html that points at old assets.
      fetch(event.request, { cache: "no-store" })
        .then((fresh) => {
          if (fresh && fresh.ok) {
            const copy = fresh.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
          }
          return fresh;
        })
        .catch(() => caches.match(event.request).then((c) => c || caches.match("./index.html")))
    );
    return;
  }

  // Same-origin assets: cache-first with background refresh.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) {
        // Serve from cache; refresh in background.
        event.waitUntil(
          fetch(event.request)
            .then((fresh) => {
              if (fresh && fresh.ok) cache.put(event.request, fresh.clone());
            })
            .catch(() => { /* network unavailable — cached copy stays */ })
        );
        return cached;
      }
      // Not in cache — fetch from network and store.
      try {
        const response = await fetch(event.request);
        if (response && response.ok) {
          cache.put(event.request, response.clone());
        }
        return response;
      } catch (err) {
        // Offline and not cached — nothing we can do.
        console.warn("[SW] Network and cache miss:", event.request.url);
        return new Response("Offline — resource not cached.", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        });
      }
    })
  );
});
