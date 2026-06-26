// Minimal service worker — enables installability (PWA) and an app-shell cache.
const CACHE = "grindops-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/index.html", "/icon.svg", "/manifest.webmanifest"])));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  // network-first, falling back to cache (so updates land but offline still works)
  event.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(request).then((r) => r || caches.match("/index.html")))
  );
});

// allow the page to trigger a notification through the SW
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "notify") {
    self.registration.showNotification(event.data.title || "GrindOps", {
      body: event.data.body || "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: event.data.tag || "grindops",
    });
  }
});
