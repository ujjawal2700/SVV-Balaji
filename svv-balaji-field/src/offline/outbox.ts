import { useSyncExternalStore } from 'react';
import { idb, uuid } from './idb';

/**
 * The outbox: every change the field expert makes while the server cannot be
 * reached, in the order it was made, waiting to be sent.
 *
 * Each entry is the HTTP request the app would have made - method, path, JSON
 * body - so replaying it at sync time goes through exactly the same API and
 * validation as an online save. Creates carry a client-generated id (see the
 * backend's common/client-id.ts), which is what makes a replay safe to repeat.
 *
 * Entries belong to the user who made them. A shared phone signing in as
 * somebody else never sends another person's work under their account.
 */

export type OutboxStatus = 'pending' | 'failed';

export interface OutboxItem {
  seq?: number;
  userId: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Path relative to the API base, e.g. `/field-visits`. */
  url: string;
  body?: unknown;
  /** Human description for the Sync screen. */
  label: string;
  /** The record this change creates or touches, when there is one. */
  entityId?: string;
  createdAt: string;
  status: OutboxStatus;
  attempts: number;
  lastAttemptAt?: string;
  /** Why the server refused it (status failed). */
  error?: string;
}

/** A photo or document picked while offline, uploaded when the change that uses it syncs. */
export interface OfflineFile {
  id: string;
  folder: string;
  name: string;
  type: string;
  blob: Blob;
  createdAt: string;
}

/** Marker put in a form's file field in place of an uploaded URL: `offline-file:<id>/<name>`. */
export const OFFLINE_FILE_PREFIX = 'offline-file:';

// --- In-memory mirror, so React can read the queue synchronously -------------------

interface OutboxState {
  items: OutboxItem[];
  syncing: boolean;
  online: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
}

let state: OutboxState = {
  items: [],
  syncing: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  lastSyncAt: null,
  lastSyncError: null,
};
const listeners = new Set<() => void>();

function set(patch: Partial<OutboxState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const outboxState = {
  get: () => state,
  set,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useOutbox() {
  return useSyncExternalStore(outboxState.subscribe, outboxState.get, outboxState.get);
}

// --- Queue operations ---------------------------------------------------------------

export async function loadOutbox() {
  const items = await idb.getAll<OutboxItem>('outbox');
  items.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  const meta = await idb.get<{ key: string; value: string | null }>('kv', 'lastSyncAt');
  set({ items, lastSyncAt: meta?.value ?? state.lastSyncAt });
  return items;
}

export async function enqueue(item: Omit<OutboxItem, 'seq' | 'createdAt' | 'status' | 'attempts'>) {
  const full: OutboxItem = { ...item, createdAt: new Date().toISOString(), status: 'pending', attempts: 0 };
  const seq = (await idb.put('outbox', full)) as number;
  await loadOutbox();
  return seq;
}

export async function updateItem(item: OutboxItem) {
  await idb.put('outbox', item);
  await loadOutbox();
}

export async function removeItem(seq: number) {
  await idb.delete('outbox', seq);
  await loadOutbox();
}

export async function setLastSyncAt(iso: string) {
  await idb.put('kv', { key: 'lastSyncAt', value: iso });
  set({ lastSyncAt: iso });
}

export function itemsFor(userId: string | undefined) {
  return state.items.filter((i) => i.userId === userId);
}

// --- Offline files ------------------------------------------------------------------

export async function saveOfflineFile(folder: string, file: Blob, name: string) {
  const id = uuid();
  const record: OfflineFile = {
    id,
    folder,
    name: name || 'file',
    type: file.type || 'application/octet-stream',
    blob: file,
    createdAt: new Date().toISOString(),
  };
  await idb.put('files', record);
  return `${OFFLINE_FILE_PREFIX}${id}/${encodeURIComponent(record.name)}`;
}

export function offlineFileId(marker: string) {
  return marker.slice(OFFLINE_FILE_PREFIX.length).split('/')[0];
}

export const getOfflineFile = (id: string) => idb.get<OfflineFile>('files', id);
export const deleteOfflineFile = (id: string) => idb.delete('files', id);
