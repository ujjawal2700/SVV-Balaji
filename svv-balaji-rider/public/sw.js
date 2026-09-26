/*
 * Rider app service worker: caches the app shell so it opens instantly and
 * survives a patchy connection. API responses are never cached - a rider must
 * never act on a stale offer or task.
 */
const VERSION = 'svv-rider-v1';
const SHELL = `${VERSION}-shell`;
const BASE = new URL(self.registration.scope).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll([BASE, `${BASE}manifest.webmanifest`, `${BASE}svv-balaji.png`])).catch(() => undefined).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(BASE)));
    return;
  }
  if (url.pathname.startsWith(`${BASE}assets/`)) {
    event.respondWith(
      caches.match(event.request).then((hit) => hit || fetch(event.request).then((res) => {
        const copy = res.clone();
        caches.open(SHELL).then((c) => c.put(event.request, copy));
        return res;
      })),
    );
  }
});
