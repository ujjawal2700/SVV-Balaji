import { checkoutAdminApi } from '@shared/api/checkout';

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export type AlertSupport = 'unsupported' | 'unconfigured' | 'denied' | 'ready';

export async function orderAlertSupport(): Promise<AlertSupport> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  const { publicKey } = await checkoutAdminApi.pushKey();
  if (!publicKey) return 'unconfigured';
  return Notification.permission === 'denied' ? 'denied' : 'ready';
}

/**
 * Ask the browser for notification permission and register it with the server,
 * so new orders reach this device even when the dashboard tab is closed or its
 * socket is down. Returns true when subscribed.
 */
export async function enableOrderAlerts(): Promise<boolean> {
  const { publicKey } = await checkoutAdminApi.pushKey();
  if (!publicKey) return false;
  if ((await Notification.requestPermission()) !== 'granted') return false;

  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
  const json = sub.toJSON();
  await checkoutAdminApi.pushSubscribe({
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
  });
  return true;
}
