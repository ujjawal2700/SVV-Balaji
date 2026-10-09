import { useSyncExternalStore } from 'react';

/**
 * The new-order chime for the staff panel (public/sounds/new-order.mp3).
 *
 * Browsers refuse to play audio until the person has interacted with the page,
 * so the first click / key press anywhere unlocks it. After that it plays even
 * while the dashboard tab is in the background, as long as the tab is open.
 * Each browser can mute it (top bar toggle); the choice is kept per browser.
 */

const SOUND_URL = `${import.meta.env.BASE_URL}sounds/new-order.mp3`;
const MUTE_KEY = 'svv.orderSound.muted';

let audio: HTMLAudioElement | null = null;
let unlocked = false;
let lastPlayed = 0;

function player(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  if (!audio) {
    audio = new Audio(SOUND_URL);
    audio.preload = 'auto';
  }
  return audio;
}

/** Call once at start-up: the first user gesture primes the audio element. */
export function installOrderSoundUnlock() {
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
        a.muted = false; // not allowed yet - try again on the next interaction
      });
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

// ---------------------------------------------------------------- mute

const listeners = new Set<() => void>();
let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
})();

export function setOrderSoundMuted(next: boolean) {
  muted = next;
  try {
    localStorage.setItem(MUTE_KEY, next ? '1' : '0');
  } catch {
    /* private mode: holds for this session */
  }
  listeners.forEach((l) => l());
}

export function useOrderSoundMuted() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => muted,
  );
}

/**
 * Play the chime. Several orders landing together (e.g. the catch-up after a
 * reconnect) ring once, not once each.
 */
export function playOrderSound(force = false) {
  if (muted && !force) return;
  const now = Date.now();
  if (!force && now - lastPlayed < 3000) return;
  lastPlayed = now;
  const a = player();
  if (!a) return;
  a.currentTime = 0;
  void a.play().catch(() => undefined);
}
