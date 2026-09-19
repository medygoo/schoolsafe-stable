var CACHE_PREFIX = "schoolsafe-v2-";
var CACHE_NAME = CACHE_PREFIX + "a51-session-denials-2026-09-19";
var CORE_PATHS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./schoolsafe-logo.png",
  "./shared/permissions.json",
  "./vendor/qrcode.min.js",
  "./vendor/html2canvas.min.js",
  "./assets/fonts/fonts.css",
  "./assets/fonts/Baloo2-700.woff2",
  "./assets/fonts/Baloo2-800.woff2",
  "./assets/fonts/NunitoSans-700.woff2",
  "./assets/fonts/NunitoSans-800.woff2",
  "./assets/fonts/NunitoSans-900.woff2",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png"
];

function scopeUrl(relativePath) {
  return new URL(relativePath, self.registration.scope).href;
}

async function discoverLocalAssets() {
  var response = await fetch(scopeUrl("./index.html"), { cache: "no-cache" });
  if (!response.ok) throw new Error("Unable to load the frontend shell");
  var html = await response.clone().text();
  var assets = CORE_PATHS.slice();
  var referencePattern = /(?:src|href)=["'](\.\/[^"'?#]+)(?:[?#][^"']*)?["']/g;
  var match;
  while ((match = referencePattern.exec(html))) assets.push(match[1]);
  return Array.from(new Set(assets)).map(scopeUrl);
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async function (cache) {
      var assets = await discoverLocalAssets();
      await Promise.allSettled(
        assets.map(async function (asset) {
          var response = await fetch(asset, { cache: "reload" });
          if (response.ok) await cache.put(asset, response);
        }),
      );
      await self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (cacheNames) {
        return Promise.all(
          cacheNames
            .filter(function (cacheName) {
              return cacheName.indexOf(CACHE_PREFIX) === 0 && cacheName !== CACHE_NAME;
            })
            .map(function (cacheName) {
              return caches.delete(cacheName);
            }),
        );
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

async function networkFirst(request) {
  var cache = await caches.open(CACHE_NAME);
  try {
    var response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    return (await cache.match(request)) || (await cache.match(scopeUrl("./index.html"))) || (await cache.match(scopeUrl("./")));
  }
}

async function cacheFirst(request) {
  var cached = await caches.match(request);
  if (cached) return cached;
  var response = await fetch(request);
  if (response.ok && response.type !== "opaque") {
    var cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", function (event) {
  var request = event.request;
  var url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Jamais de cache sur l'API : auth, session, licence, essai, métier natif.
  // Même origine en production : ces réponses sont personnelles et vivantes.
  if (url.pathname.indexOf("/auth/") === 0 || url.pathname.indexOf("/native/") === 0 || url.pathname.indexOf("/api/") === 0) return;
  event.respondWith(request.mode === "navigate" ? networkFirst(request) : cacheFirst(request));
});

self.addEventListener("sync", function (event) {
  if (event.tag !== "schoolsafe-sync") return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      clientList.forEach(function (client) {
        client.postMessage({ type: "SCHOOLSAFE_SYNC_REQUEST" });
      });
    }),
  );
});

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
