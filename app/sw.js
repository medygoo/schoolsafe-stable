var CACHE_PREFIX = "schoolsafe-v2-";
var CACHE_NAME = CACHE_PREFIX + "setup-token-ui-r1-2026-09-25";
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
    var response = await fetch(request, { cache: "no-cache" });
    // A cache write failure must not replace a fresh network response.
    if (response.ok) await cache.put(request, response.clone()).catch(function () {});
    return response;
  } catch (error) {
    var cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      var shell = (await cache.match(scopeUrl("./index.html"))) || (await cache.match(scopeUrl("./")));
      if (shell) return shell;
    }
    throw error;
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
  if (/^\/(?:auth|native|api|setup)(?:\/|$)/.test(url.pathname) || url.pathname === "/config") return;
  var immutableAsset = /\.(?:woff2?|ttf|otf|png|jpe?g|gif|svg|webp|avif|ico)$/i.test(url.pathname);
  event.respondWith(request.mode !== "navigate" && immutableAsset ? cacheFirst(request) : networkFirst(request));
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
