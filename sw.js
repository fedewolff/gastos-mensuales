const CACHE_NAME = "gastos-mensuales-v7";
const ASSETS = [
  "./",
  "./index.html",
  "./index.html?v=7",
  "./manifest.webmanifest",
  "./manifest.webmanifest?v=7",
  "./src/app.js?v=7",
  "./src/domain.js?v=7",
  "./src/storage.js?v=7",
  "./src/styles.css?v=7",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const freshFirst =
    event.request.mode === "navigate" ||
    ["document", "script", "style", "manifest"].includes(event.request.destination);

  event.respondWith(
    freshFirst ? networkFirst(event.request) : cacheFirst(event.request)
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(new Request(request, { cache: "reload" }));
    cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  const cache = await caches.open(CACHE_NAME);
  cache.put(request, response.clone());
  return response;
}
