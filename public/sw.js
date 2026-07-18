// OptiDoer service worker — conservative, network-first.
// It never touches API/auth calls and always prefers fresh content,
// so it can't serve a stale app. It only provides an offline fallback.
const CACHE = "optidoer-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop old caches from previous versions.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Same-origin only, and never intercept API/auth traffic.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api")) return;

  // Network-first for page navigations, with an offline cache fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE);
          cache.put(request, fresh.clone());
          return fresh;
        } catch (err) {
          const cached = await caches.match(request);
          return cached || (await caches.match("/")) || Response.error();
        }
      })()
    );
  }
});
