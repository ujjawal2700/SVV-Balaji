/*
 * Service worker for staff web push (VAPID): new orders, rider sign-ups, return requests,
 * affiliate / retailer applications, support tickets. Registered by src/live/orderAlerts.ts.
 *
 * If the dashboard is the focused, visible tab it has already shown the alert as an in-app
 * pop-up (socket `alerts:new`), so no system notification is drawn on top of it. Otherwise
 * (tab in the background, minimised, closed) the system notification appears.
 */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'SVV Balaji', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      if (wins.some((w) => w.focused && w.visibilityState === 'visible')) return undefined;
      return self.registration.showNotification(data.title || 'SVV Balaji', {
        body: data.body || '',
        icon: '/svv-balaji.png',
        badge: '/svv-balaji.png',
        // Each alert has its own tag, so two new orders show as two notifications.
        tag: data.tag || `svv-${Date.now()}`,
        data: { url: data.url || '/' },
        requireInteraction: true,
      });
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
