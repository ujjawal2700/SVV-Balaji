import { dehydrate, hydrate, type QueryClient } from '@tanstack/react-query';
import { idb } from './idb';

/**
 * Keeps what the app has loaded - farmers, visits, plans, seed stock, training,
 * branches - on the device, so opening the app with no signal shows the last
 * data it saw instead of empty screens.
 *
 * Stored per user (a shared phone never shows one expert's data to another),
 * for up to 7 days, and wiped on sign-out. Only successful queries are kept.
 * When the app is online again every screen refetches, so this is a starting
 * point, never the source of truth.
 */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const keyFor = (userId: string) => `query-cache:${userId}`;

interface Stored {
  key: string;
  savedAt: number;
  state: unknown;
}

export async function restoreQueryCache(client: QueryClient, userId: string) {
  try {
    const stored = await idb.get<Stored>('kv', keyFor(userId));
    if (!stored || Date.now() - stored.savedAt > MAX_AGE_MS) return;
    hydrate(client, stored.state as never);
  } catch {
    // A corrupt or unreadable store just means starting empty.
  }
}

export function persistQueryCache(client: QueryClient, currentUserId: () => string | undefined) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = () => {
    const userId = currentUserId();
    if (!userId) return;
    const state = dehydrate(client, {
      shouldDehydrateQuery: (q) => q.state.status === 'success' && q.state.data !== undefined,
    });
    void idb.put('kv', { key: keyFor(userId), savedAt: Date.now(), state } satisfies Stored).catch(() => undefined);
  };
  client.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' && event.type !== 'added' && event.type !== 'removed') return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, 1500);
  });
  // Also on the way out, so the last change before the tab closes is kept.
  window.addEventListener('pagehide', save);
}

export async function clearQueryCache(userId: string | undefined) {
  if (userId) await idb.delete('kv', keyFor(userId)).catch(() => undefined);
}
