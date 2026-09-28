/* eslint-disable no-undef */
/*
 * Push notifications for the Desi Tokri storefront - customers and retailers (Firebase Cloud Messaging).
 *
 * Registered by src/push.ts under its own scope ("<base>firebase-cloud-messaging-push-scope")
 * so it never replaces the app's offline service worker. Pushes are data-only: this worker
 * draws every notification itself, with the Desi Tokri logo, whether the app is closed, in the
 * background or (via the page, see src/push.ts) in front. The server only sends to devices
 * whose owner is still signed in; logged-out devices are unregistered at sign-out.
 */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyA7N9tum2YeOkm3PjXAUp7MPUL5ZtOQc60',
  authDomain: 'svv-balaji.firebaseapp.com',
  projectId: 'svv-balaji',
  storageBucket: 'svv-balaji.firebasestorage.app',
  messagingSenderId: '809690429898',
  appId: '1:809690429898:web:40b10eb9ca60f5340ff733',
});

const SCOPE_SUFFIX = 'firebase-cloud-messaging-push-scope';
const scopePath = new URL(self.registration.scope).pathname;
/** The app's base path ("/", "/admin/", ...), where the logo and the app itself live. */
const BASE = scopePath.endsWith(SCOPE_SUFFIX) ? scopePath.slice(0, -SCOPE_SUFFIX.length) : scopePath;
/** Storefront brand: every customer/retailer notification carries the Desi Tokri emblem. */
const LOGO = BASE + 'images/desi-tokri-emblem.png';

function show(data) {
  const title = data.title || 'Desi Tokri';
  const options = {
    body: data.body || '',
    icon: LOGO,
    badge: LOGO,
    tag: data.tag || 'svv-broadcast',
    renotify: true,
    data: { link: data.link || '' },
  };
  if (data.imageUrl) options.image = data.imageUrl;
  return self.registration.showNotification(title, options);
}

const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => show(payload.data || {}));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '';
  const target = new URL(BASE + link.replace(/^\//, ''), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // Reuse an open tab of this app rather than opening another.
      const mine = wins.find((w) => new URL(w.url).pathname.startsWith(BASE));
      if (mine) return mine.focus().then((w) => (link && w && 'navigate' in w ? w.navigate(target) : w));
      return self.clients.openWindow(target);
    }),
  );
});
