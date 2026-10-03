/**
 * The new-order sound and the in-app events the pop-ups listen to.
 *
 * Browsers refuse to play audio until the person has touched the page, so the
 * first tap anywhere (sign in, "Go online", ...) unlocks it. A rider who opens
 * the app and never touches it gets the vibration and the pop-up, not sound.
 * With the app closed or in the background the phone's own notification sound
 * plays instead (web push cannot choose a custom sound).
 */

const SOUND_URL = `${import.meta.env.BASE_URL}sounds/new-order.wav`;

let audio: HTMLAudioElement | null = null;
let unlocked = false;

function player(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  if (!audio) {
    audio = new Audio(SOUND_URL);
    audio.preload = 'auto';
  }
  return audio;
}

/** Call once at start-up: the first user gesture primes the audio element. */
export function installSoundUnlock() {
  if (unlocked || typeof window === 'undefined') return;
  const unlock = () => {
    const a = player();
    if (!a) return;
    a.muted = true;
    a.play()
      .then(() => {
        a.pause();
        a.currentTime = 0;
        a.muted = false;
        unlocked = true;
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
      })
      .catch(() => {
        a.muted = false; // not yet allowed - try again on the next tap
      });
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

/** Play the alert. `loop` keeps it ringing until stopRing() (a waiting offer). */
export function ring(loop: boolean) {
  const a = player();
  navigator.vibrate?.(loop ? [400, 200, 400, 200, 400] : [200, 100, 200]);
  if (!a) return;
  a.loop = loop;
  a.currentTime = 0;
  void a.play().catch(() => undefined);
}

export function stopRing() {
  if (!audio) return;
  audio.pause();
  audio.loop = false;
  audio.currentTime = 0;
  navigator.vibrate?.(0);
}

// ------------------------------------------------------------------ events

export type OfferClosed = { offerId: string; taskId: string; status: 'TAKEN' | 'WITHDRAWN' | 'EXPIRED' | string };
export type TaskAssigned = { taskId: string; by: 'ACCEPT' | 'STAFF' };

const bus = new EventTarget();

export const riderEvents = {
  offerClosed: (d: OfferClosed) => bus.dispatchEvent(new CustomEvent('offer-closed', { detail: d })),
  assigned: (d: TaskAssigned) => bus.dispatchEvent(new CustomEvent('assigned', { detail: d })),
  on<K extends 'offer-closed' | 'assigned'>(type: K, fn: (d: K extends 'assigned' ? TaskAssigned : OfferClosed) => void) {
    const h = (e: Event) => fn((e as CustomEvent).detail);
    bus.addEventListener(type, h);
    return () => bus.removeEventListener(type, h);
  },
};
