/**
 * A system (OS) notification raised by the open dashboard itself - shown even
 * while the admin tab is the one being looked at, and whether or not server
 * web push is configured. Uses the staff service worker when it is registered
 * (required on Android Chrome, and its click handler focuses the panel);
 * otherwise a plain `Notification`.
 *
 * `tag` matches what the server's web push uses for the same thing, so the
 * two never show as duplicates.
 */
const LOGO = `${import.meta.env.BASE_URL}svv-balaji.png`;

export async function showSystemNotification(n: { title: string; body: string; tag: string; link: string }, onOpen: (path: string) => void) {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;
  const options: NotificationOptions = {
    body: n.body,
    icon: LOGO,
    badge: LOGO,
    tag: n.tag,
    requireInteraction: true,
    data: { url: n.link },
  };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration('/sw.js') : undefined;
    if (reg) {
      await reg.showNotification(n.title, options);
      return;
    }
    const shown = new Notification(n.title, options);
    shown.onclick = () => {
      window.focus();
      onOpen(n.link);
      shown.close();
    };
  } catch {
    // Some browsers refuse page notifications without a service worker; the in-app pop-up still shows.
  }
}
