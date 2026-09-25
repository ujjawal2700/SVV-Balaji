/*
 * Service worker for the SVV Balaji field app.
 *
 * -----------------------------------------------------------------------------
 * Its job in offline mode is the app itself: the page, its code and its icons,
 * so the app opens on a phone with no signal.
 *
 * Data is NOT cached here. The app keeps its own copy of what it has loaded
 * (src/offline/persist.ts, per user, wiped on sign-out) and queues changes made
 * offline (src/offline/outbox.ts) to sync when the connection returns. Keeping
 * API responses out of this cache means a stale response can never be served
 * as if it were live, and nobody's data outlives their sign-out in a shared
 * cache.
 *
 * The base path comes from this worker's own scope, so the same file works when
 * the app is served at "/" (per-app host) or "/field/" (one origin behind nginx).
 * -----------------------------------------------------------------------------
 */
const VERSION = 'svv-field-v2';
const SHELL = `${VERSION}-shell`;
const BASE = new URL(self.registration.scope).pathname; // "/" or "/field/"

const SHELL_URLS = [BASE, `${BASE}index.html`, `${BASE}manifest.webmanifest`];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_URLS))
      // A failed precache must not block activation - the app still works
      // online, and failing install would leave the old worker in place forever.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

const cachePut = (request, response) => {
  if (!response || !response.ok || response.type === 'opaque') return;
  const copy = response.clone();
  caches.open(SHELL).then((cache) => cache.put(request, copy));
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never the API - see the note at the top.
  if (url.pathname.startsWith('/api/')) return;

  // Navigations: network first, falling back to the cached app. This is what
  // makes the icon open the app in a dead spot.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          cachePut(`${BASE}index.html`, response);
          return response;
        })
        .catch(() => caches.match(`${BASE}index.html`).then((hit) => hit || caches.match(BASE)).then((hit) => hit || Response.error())),
    );
    return;
  }

  // Hashed build assets are immutable: cache-first.
  if (url.pathname.startsWith(`${BASE}assets/`)) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((response) => (cachePut(request, response), response))),
    );
    return;
  }

  // Everything else under the app (icons, manifest): network first, cache as fallback.
  if (url.pathname.startsWith(BASE)) {
    event.respondWith(
      fetch(request)
        .then((response) => (cachePut(request, response), response))
        .catch(() => caches.match(request).then((hit) => hit || Response.error())),
    );
  }
});

// Lets the page trigger an immediate update rather than waiting for every tab
// to close. See registerServiceWorker() in src/pwa.ts.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
