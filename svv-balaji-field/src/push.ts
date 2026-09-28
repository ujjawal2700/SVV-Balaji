import { useEffect, useRef } from 'react';
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { app, VAPID_KEY } from './firebase';

/**
 * Push notifications (Firebase Cloud Messaging) for this app.
 *
 * - Signed in  -> this device's token is registered with the API, so Super Admin broadcasts
 *                 arrive as system notifications with the app logo, even with the app closed.
 * - Signed out -> the token is unregistered, so nothing pops up; messages still wait in the
 *                 in-app inbox for the next sign-in. The API independently refuses to push to a
 *                 device whose login session has ended, in case the sign-out call never landed.
 *
 * The Firebase worker gets its own scope so it never replaces the app's offline service worker.
 */
const BASE = import.meta.env.BASE_URL;
const SCOPE = `${BASE}firebase-cloud-messaging-push-scope`;
const LOGO = `${BASE}svv-balaji.png`;
const TOKEN_KEY = 'svv.push.token';

export type PushState = 'granted' | 'denied' | 'default' | 'unsupported';

export interface PushPayload {
  title?: string;
  body?: string;
  imageUrl?: string;
  link?: string;
  tag?: string;
}

const storage = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (v: string | null) => {
    try {
      if (v) localStorage.setItem(TOKEN_KEY, v);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private mode - the server-side session check still protects signed-out devices */
    }
  },
};

async function supported(): Promise<boolean> {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'Notification' in window && (await isSupported().catch(() => false));
}

export async function pushPermission(): Promise<PushState> {
  if (!(await supported())) return 'unsupported';
  return Notification.permission as PushState;
}

/**
 * Ask for permission (if not yet decided), get this device's token and hand it to `register`.
 * `interactive` = called from a button tap; some browsers (Safari) only show the prompt then.
 */
export async function enablePush(register: (token: string) => Promise<unknown>, interactive = false): Promise<PushState> {
  if (!(await supported())) return 'unsupported';
  let permission = Notification.permission as PushState;
  if (permission === 'default' && (interactive || !/^((?!chrome|android).)*safari/i.test(navigator.userAgent))) {
    permission = (await Notification.requestPermission()) as PushState;
  }
  if (permission !== 'granted') return permission;

  const registration = await navigator.serviceWorker.register(`${BASE}firebase-messaging-sw.js`, { scope: SCOPE });
  const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) return 'default';
  await register(token);
  storage.set(token);
  return 'granted';
}

/** Sign-out: forget this device server-side. Safe to call when nothing was registered. */
export async function disablePush(unregister: (token: string) => Promise<unknown>) {
  const token = storage.get();
  if (!token) return;
  storage.set(null);
  await unregister(token).catch(() => undefined);
}

/** While the app is open Firebase hands the message to the page instead of the worker - draw it anyway. */
async function listenForeground(onPush: (p: PushPayload) => void): Promise<() => void> {
  if (!(await supported())) return () => undefined;
  return onMessage(getMessaging(app), async (payload) => {
    const d = (payload.data ?? {}) as PushPayload;
    onPush(d);
    if (Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.getRegistration(SCOPE);
    const options: NotificationOptions & { image?: string; renotify?: boolean } = {
      body: d.body ?? '',
      icon: LOGO,
      badge: LOGO,
      tag: d.tag ?? 'svv-broadcast',
      renotify: true,
      data: { link: d.link ?? '' },
    };
    if (d.imageUrl) options.image = d.imageUrl;
    await reg?.showNotification(d.title ?? 'SVV Balaji', options);
  });
}

/**
 * Mount once, inside the auth provider. Registers on sign-in, unregisters on sign-out, and calls
 * `onPush` for every message received while the app is open (e.g. to refresh the inbox badge).
 */
export function usePushRegistration(opts: {
  /** undefined while the session is still being restored - neither signed in nor out yet. */
  signedIn: boolean | undefined;
  /** Changes when a different person signs in, so the token is re-pointed to them. */
  identity: string | null | undefined;
  register: (token: string) => Promise<unknown>;
  unregister: (token: string) => Promise<unknown>;
  onPush?: (p: PushPayload) => void;
}) {
  const { signedIn, identity, register, unregister, onPush } = opts;
  const onPushRef = useRef(onPush);
  onPushRef.current = onPush;

  useEffect(() => {
    if (signedIn === undefined) return;
    if (signedIn) void enablePush(register).catch(() => undefined);
    else void disablePush(unregister);
    // register/unregister are stable API functions; identity is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, identity]);

  useEffect(() => {
    if (!signedIn) return;
    let stop: () => void = () => undefined;
    let cancelled = false;
    void listenForeground((p) => onPushRef.current?.(p)).then((fn) => {
      if (cancelled) fn();
      else stop = fn;
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [signedIn]);
}
