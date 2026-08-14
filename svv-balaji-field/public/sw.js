/*
 * Service worker for the SVV Balaji field app.
 *
 * -----------------------------------------------------------------------------
 * What this DOES do: make the app shell load instantly and survive a dead
 * signal, so opening the icon on a patchy connection shows the app rather than
 * the browser's dinosaur.
 *
 * What this does NOT do: work offline. API requests are never cached and never
 * queued - a form submitted with no signal fails, visibly, and the user is told
 * to try again. That is deliberate. A queue that silently holds a harvest
 * inspection for six hours and then replays it against stale data is worse than
 * a form that refuses, because the executive walks away believing it saved.
 *
 * Real offline capture is a background sync queue plus IndexedDB plus conflict
 * rules for every endpoint. It is a project, not a flag. See DEV_LOG.
 * -----------------------------------------------------------------------------
 */

const VERSION = 'svv-field-v1';
const SHELL = `${VERSION}-shell`;

/*
 * Only the entry point is precached. Hashed assets are cached as they are
 * requested, because their names change on every deploy and listing them here
 * would mean regenerating this file at build time.
 */
const SHELL_URLS = ['/field/', '/field/index.html', '/field/manifest.webmanifest'];

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

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never touch the API. A cached farmer list shown as if it were live is how
  // somebody inspects a harvest against a record that changed this morning.
  if (url.pathname.startsWith('/api/')) return;

  // Navigations: network first, falling back to the cached shell. This is what
  // makes the icon open something usable in a dead spot.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put('/field/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/field/index.html').then((hit) => hit || Response.error())),
    );
    return;
  }

  // Hashed build assets are immutable, so cache-first is safe and is what makes
  // a second launch feel instant.
  if (url.pathname.startsWith('/field/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(SHELL).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
  }
});

// Lets the page trigger an immediate update rather than waiting for every tab
// to close. See registerServiceWorker() in src/pwa.ts.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
