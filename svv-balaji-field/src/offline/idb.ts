/**
 * A very small IndexedDB wrapper for the field app's offline store.
 *
 * Three object stores:
 *   outbox - changes made on the device, waiting to be sent (see outbox.ts)
 *   files  - photos/documents picked while offline, uploaded at sync time
 *   kv     - everything else: the persisted query cache, sync bookkeeping
 *
 * IndexedDB rather than localStorage because it holds Blobs (photos) natively,
 * has no 5 MB ceiling, and does not block the main thread.
 */
const DB_NAME = 'svv-field-offline';
const DB_VERSION = 1;

export type StoreName = 'outbox' | 'files' | 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error);
      };
    });
  }
  return dbPromise;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const request = work(tx.objectStore(store));
        tx.oncomplete = () => resolve((request ? request.result : undefined) as T);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export const idb = {
  get: <T>(store: StoreName, key: IDBValidKey) => run<T | undefined>(store, 'readonly', (s) => s.get(key)),
  getAll: <T>(store: StoreName) => run<T[]>(store, 'readonly', (s) => s.getAll()),
  /** Returns the key (the autoincremented `seq` for the outbox). */
  put: <T>(store: StoreName, value: T) => run<IDBValidKey>(store, 'readwrite', (s) => s.put(value)),
  delete: (store: StoreName, key: IDBValidKey) => run<void>(store, 'readwrite', (s) => s.delete(key)),
  clear: (store: StoreName) => run<void>(store, 'readwrite', (s) => s.clear()),
};

/** RFC 4122 v4, from the browser when it can (secure contexts), otherwise getRandomValues. */
export function uuid(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
