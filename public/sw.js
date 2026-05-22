const CACHE_NAME = "website-cache-v3";
const PRECACHE_URLS = ["/style.css", "/modal.css", "/now-playing.css"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

// Cache-first for videos and thumbnails, network-first for JSON
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const isRangeRequest = request.headers.has("range");
  const isVideo = url.pathname.startsWith("/videos/");
  const isShowreel = url.pathname === "/videos/showreel.mp4";
  const isThumb = url.pathname.startsWith("/thumbnails/");

  // Bypass caching for range requests and non-showreel videos
  if (isVideo) {
    if (isRangeRequest || !isShowreel) {
      event.respondWith(fetch(request));
      return;
    }
    // Cache-first only for the showreel (full response only)
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            // Skip caching partial/opaque/non-200 responses
            if (
              response.status === 200 &&
              !response.headers.has("Content-Range") &&
              (response.type === "basic" || response.type === "default")
            ) {
              const respClone = response.clone();
              event.waitUntil(
                caches
                  .open(CACHE_NAME)
                  .then((cache) => cache.put(request, respClone)),
              );
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (isThumb) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (
              response.status === 200 &&
              (response.type === "basic" || response.type === "default")
            ) {
              const respClone = response.clone();
              event.waitUntil(
                caches
                  .open(CACHE_NAME)
                  .then((cache) => cache.put(request, respClone)),
              );
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (url.pathname.endsWith("/projects.json")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 200) {
            const respClone = response.clone();
            event.waitUntil(
              caches
                .open(CACHE_NAME)
                .then((cache) => cache.put(request, respClone)),
            );
          }
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }
});
