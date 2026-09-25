import type { QueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { api } from '@shared/api/client';
import { unwrap } from '@shared/api/envelope';
import { REPLAY_HEADER, isUnreachable } from './adapter';
import {
  OFFLINE_FILE_PREFIX,
  deleteOfflineFile,
  getOfflineFile,
  itemsFor,
  loadOutbox,
  offlineFileId,
  outboxState,
  removeItem,
  setLastSyncAt,
  updateItem,
  type OutboxItem,
} from './outbox';
import { offlineProfile } from './session';

/**
 * Sends the outbox to the server, oldest first.
 *
 * - Runs when the connection comes back, when the app opens, when it returns to
 *   the foreground, every 20 s while anything is waiting, and on "Sync now".
 * - Strictly in order: a visit to a farmer registered offline is sent after
 *   the farmer.
 * - "Could not reach the server" stops the run and leaves everything queued
 *   for the next attempt. "The server said no" (a validation error - say the
 *   seed lot ran out in the meantime) marks that one change failed, with the
 *   server's reason, and carries on; nothing is ever dropped silently. Failed
 *   changes wait on the Sync screen to be retried or discarded.
 * - Photos saved offline are uploaded just before the change that uses them.
 */

let client: QueryClient | null = null;
let running = false;

class StopSync extends Error {}

async function uploadOfflineFiles(value: unknown): Promise<unknown> {
  if (typeof value === 'string' && value.startsWith(OFFLINE_FILE_PREFIX)) {
    const id = offlineFileId(value);
    const file = await getOfflineFile(id);
    if (!file) throw new Error('A photo saved on this device is missing and cannot be uploaded');
    const form = new FormData();
    form.append('file', new File([file.blob], file.name, { type: file.type }));
    try {
      const response = await api.post(`/uploads/${file.folder}`, form, {
        headers: { 'Content-Type': undefined, [REPLAY_HEADER]: '1' } as never,
      });
      const stored = unwrap<{ url: string }>(response.data);
      await deleteOfflineFile(id);
      return stored.url;
    } catch (error) {
      if (isUnreachable(error)) throw new StopSync();
      throw error;
    }
  }
  if (Array.isArray(value)) return Promise.all(value.map(uploadOfflineFiles));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = await uploadOfflineFiles(v);
    return out;
  }
  return value;
}

function serverMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) return data.message.join('. ');
    if (typeof data?.message === 'string') return data.message;
    return `${error.response?.status ?? ''} ${error.message}`.trim();
  }
  return error instanceof Error ? error.message : 'Unknown error';
}

async function sendOne(item: OutboxItem): Promise<'sent' | 'failed'> {
  const attempt = { ...item, attempts: item.attempts + 1, lastAttemptAt: new Date().toISOString() };
  try {
    const body = await uploadOfflineFiles(item.body);
    if (body !== item.body) {
      // Keep the uploaded URLs, so a later retry does not upload the photo again.
      await updateItem({ ...attempt, body });
    }
    await api.request({ method: item.method, url: item.url, data: body, headers: { [REPLAY_HEADER]: '1' } });
    await removeItem(item.seq as number);
    return 'sent';
  } catch (error) {
    if (error instanceof StopSync || isUnreachable(error)) throw new StopSync();
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    // A delete of something already gone has done its job.
    if (item.method === 'DELETE' && status === 404) {
      await removeItem(item.seq as number);
      return 'sent';
    }
    // Signed out / session revoked: stop, keep everything for after sign-in.
    if (status === 401) throw new StopSync();
    const latest = outboxState.get().items.find((i) => i.seq === item.seq) ?? item;
    await updateItem({ ...latest, attempts: attempt.attempts, lastAttemptAt: attempt.lastAttemptAt, status: 'failed', error: serverMessage(error) });
    return 'failed';
  }
}

export async function syncNow(): Promise<{ sent: number; failed: number }> {
  const me = offlineProfile.current();
  if (running || !me || !navigator.onLine) return { sent: 0, failed: 0 };
  running = true;
  outboxState.set({ syncing: true, lastSyncError: null });
  let sent = 0;
  let failed = 0;
  try {
    await loadOutbox();
    for (const item of itemsFor(me.id).filter((i) => i.status === 'pending')) {
      const result = await sendOne(item);
      if (result === 'sent') sent += 1;
      else failed += 1;
    }
    await setLastSyncAt(new Date().toISOString());
  } catch (error) {
    if (!(error instanceof StopSync)) outboxState.set({ lastSyncError: serverMessage(error) });
  } finally {
    running = false;
    outboxState.set({ syncing: false });
    // Replace the device's placeholders with what the server now holds.
    if (sent > 0) void client?.invalidateQueries();
  }
  return { sent, failed };
}

export async function retryItem(item: OutboxItem) {
  await updateItem({ ...item, status: 'pending', error: undefined });
  return syncNow();
}

export async function retryAllFailed() {
  const me = offlineProfile.current();
  for (const item of itemsFor(me?.id).filter((i) => i.status === 'failed')) {
    await updateItem({ ...item, status: 'pending', error: undefined });
  }
  return syncNow();
}

export async function discardItem(item: OutboxItem) {
  await removeItem(item.seq as number);
  void client?.invalidateQueries();
}

/** Starts the triggers. Called once from main.tsx. */
export function startSync(queryClient: QueryClient) {
  client = queryClient;
  const kick = () => void syncNow();
  const setOnline = () => {
    outboxState.set({ online: navigator.onLine });
    if (navigator.onLine) setTimeout(kick, 1000);
  };
  window.addEventListener('online', setOnline);
  window.addEventListener('offline', setOnline);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') kick();
  });
  setInterval(() => {
    const me = offlineProfile.current();
    if (navigator.onLine && itemsFor(me?.id).some((i) => i.status === 'pending')) kick();
  }, 20_000);
  void loadOutbox().then(kick);
}
