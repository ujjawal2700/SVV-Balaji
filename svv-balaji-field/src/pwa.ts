/**
 * Service worker registration and the install prompt.
 *
 * Both are wrapped rather than called inline because both fail in ways that
 * must not take the app down: a service worker is unavailable over plain HTTP,
 * and `beforeinstallprompt` does not exist on iOS at all.
 */

/** Registered only in a production build — a cached shell during development
 *  is how you spend twenty minutes debugging a change that already shipped. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/field/sw.js', { scope: '/field/' })
      .then((registration) => {
        // A new build is waiting behind the tab the user has open. Rather than
        // leaving them on yesterday's code until every tab closes, activate it
        // and reload once.
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;

          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              installing.postMessage('skip-waiting');
            }
          });
        });
      })
      .catch(() => {
        // Registration failing means no offline shell. The app still works —
        // not worth an error in front of a user standing in a field.
      });

    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  });
}

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferredPrompt: InstallPromptEvent | null = null;
const listeners = new Set<(available: boolean) => void>();

/**
 * Chrome fires `beforeinstallprompt` once, early, and it can only be used from
 * a user gesture later. So it is captured here at module load and handed to the
 * UI when someone taps Install.
 *
 * iOS/Safari never fires it — installing there is Share → Add to Home Screen,
 * which cannot be triggered from code. The UI detects that case and shows
 * instructions instead of a button that would do nothing.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    listeners.forEach((listener) => listener(true));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    listeners.forEach((listener) => listener(false));
  });
}

export function canPromptInstall(): boolean {
  return deferredPrompt !== null;
}

export function onInstallAvailabilityChange(listener: (available: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  listeners.forEach((listener) => listener(false));
  return outcome;
}

/** True when running from the home screen rather than inside a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS predates the standard and exposes it as a non-standard property.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** iOS cannot be prompted, so the UI has to explain the manual route. */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
