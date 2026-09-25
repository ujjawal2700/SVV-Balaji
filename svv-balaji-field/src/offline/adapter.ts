import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { message } from 'antd';
import axios, { type AxiosAdapter, type AxiosInstance, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { uuid } from './idb';
import { enqueue, saveOfflineFile } from './outbox';
import { offlineProfile } from './session';

/**
 * Offline capture for the field app.
 *
 * Installed as the axios *adapter* of the shared API client, in this app only,
 * so every existing form and hook works offline without being rewritten: a save
 * made with no connection is written to the outbox and answered with the record
 * the server would have returned, and the screens update as if it had saved.
 *
 * What is captured is an explicit allow-list (below) - the field expert's own
 * work. Anything else (approvals, status changes, admin actions) still needs a
 * connection and fails visibly, as before.
 */

/** Header the sync engine sets so a replayed request goes to the network, never back into the queue. */
export const REPLAY_HEADER = 'X-Offline-Replay';

type Method = 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface Route {
  method: Method;
  pattern: RegExp;
  /** Creates get a client id (see backend common/client-id.ts). */
  create?: boolean;
  label: (body: Record<string, unknown>, m: RegExpMatchArray) => string;
}

const name = (b: Record<string, unknown>, key = 'fullName') => (typeof b[key] === 'string' ? (b[key] as string) : '');
const farmerName = (id: unknown) => findFarmer(typeof id === 'string' ? id : '')?.fullName ?? 'farmer';

const ROUTES: Route[] = [
  { method: 'POST', pattern: /^\/farmers$/, create: true, label: (b) => `Register farmer ${name(b)}` },
  { method: 'PATCH', pattern: /^\/farmers\/([^/]+)$/, label: (_b, m) => `Update farmer ${farmerName(m[1])}` },
  { method: 'POST', pattern: /^\/farmers\/([^/]+)\/plots$/, create: true, label: (b, m) => `Add plot "${name(b, 'name')}" for ${farmerName(m[1])}` },
  { method: 'PATCH', pattern: /^\/farmers\/([^/]+)\/plots\/[^/]+$/, label: (_b, m) => `Update a plot of ${farmerName(m[1])}` },
  { method: 'DELETE', pattern: /^\/farmers\/([^/]+)\/plots\/[^/]+$/, label: (_b, m) => `Remove a plot of ${farmerName(m[1])}` },
  { method: 'POST', pattern: /^\/field-visits$/, create: true, label: (b) => `Field visit to ${farmerName(b.farmerId)}` },
  { method: 'PATCH', pattern: /^\/field-visits\/[^/]+$/, label: () => 'Edit a field visit' },
  { method: 'DELETE', pattern: /^\/field-visits\/[^/]+$/, label: () => 'Delete a field visit' },
  { method: 'POST', pattern: /^\/field-visits\/[^/]+\/documents$/, create: true, label: () => 'Attach a photo / document to a visit' },
  { method: 'DELETE', pattern: /^\/field-visits\/[^/]+\/documents\/[^/]+$/, label: () => 'Remove a visit document' },
  { method: 'POST', pattern: /^\/field-visit-plans$/, create: true, label: (b) => `Plan a visit to ${farmerName(b.farmerId)}` },
  { method: 'PATCH', pattern: /^\/field-visit-plans\/[^/]+$/, label: () => 'Reschedule a planned visit' },
  { method: 'POST', pattern: /^\/field-visit-plans\/[^/]+\/cancel$/, label: () => 'Cancel a planned visit' },
  { method: 'DELETE', pattern: /^\/field-visit-plans\/[^/]+$/, label: () => 'Delete a planned visit' },
  { method: 'POST', pattern: /^\/seed-distribution$/, create: true, label: (b) => `Seed handout to ${farmerName(b.farmerId)}` },
  { method: 'PATCH', pattern: /^\/seed-distribution\/[^/]+$/, label: () => 'Edit a seed handout' },
  { method: 'DELETE', pattern: /^\/seed-distribution\/[^/]+$/, label: () => 'Delete a seed handout' },
  { method: 'POST', pattern: /^\/training-sessions$/, create: true, label: (b) => `Training session "${name(b, 'title')}"` },
  { method: 'PATCH', pattern: /^\/training-sessions\/[^/]+$/, label: () => 'Edit a training session' },
  { method: 'DELETE', pattern: /^\/training-sessions\/[^/]+$/, label: () => 'Delete a training session' },
  { method: 'POST', pattern: /^\/training-sessions\/[^/]+\/attendance$/, label: () => 'Mark training attendance' },
  { method: 'DELETE', pattern: /^\/training-sessions\/[^/]+\/attendance\/[^/]+$/, label: () => 'Remove a training attendee' },
  { method: 'POST', pattern: /^\/training-sessions\/[^/]+\/materials$/, create: true, label: () => 'Add training material' },
  { method: 'DELETE', pattern: /^\/training-sessions\/[^/]+\/materials\/[^/]+$/, label: () => 'Remove training material' },
];

const UPLOAD = /^\/uploads\/([^/]+)$/;

let queryClient: QueryClient | null = null;

function pathOf(config: InternalAxiosRequestConfig) {
  const url = config.url ?? '';
  const withoutBase = url.startsWith('http') ? new URL(url).pathname.replace(/^.*?\/api\/v\d+/, '') : url;
  return withoutBase.split('?')[0].replace(/\/+$/, '') || '/';
}

/**
 * "The server could not be reached" - as opposed to "the server said no".
 * A gateway error (502/503/504) is the reverse proxy saying the API is down,
 * which the field expert experiences exactly like no signal.
 */
export function isUnreachable(error: unknown) {
  if (!axios.isAxiosError(error)) return false;
  if (!error.response) return true;
  return [502, 503, 504].includes(error.response.status);
}

const isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine);

function parseBody(data: unknown): Record<string, unknown> | undefined {
  if (data === undefined || data === null || data === '') return undefined;
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return undefined;
    }
  }
  return typeof data === 'object' ? (data as Record<string, unknown>) : undefined;
}

function respond(config: InternalAxiosRequestConfig, data: unknown): AxiosResponse {
  return { data, status: 202, statusText: 'Saved offline', headers: { 'x-offline-queued': '1' }, config, request: null };
}

let lastNotice = 0;
function noticeSavedOffline() {
  // One notice per burst: a visit with a photo is two queued requests.
  if (Date.now() - lastNotice < 3000) return;
  lastNotice = Date.now();
  void message.info({
    key: 'offline-saved',
    content: 'No connection — saved on this device. It will sync automatically when you are back online.',
    duration: 5,
  });
}

// --- Reading what the app already has cached, to fill in the saved record ------------

type ListData = { data: Array<Record<string, unknown>>; meta?: unknown };
const isList = (d: unknown): d is ListData => Boolean(d) && Array.isArray((d as ListData).data);

function findFarmer(id: string): { id: string; fullName: string; farmerCode: string | null; village?: string; branchId?: string } | undefined {
  if (!queryClient || !id) return undefined;
  for (const [, data] of queryClient.getQueriesData<ListData>({ queryKey: ['farmers', 'list'] })) {
    const hit = isList(data) ? data.data.find((f) => f.id === id) : undefined;
    if (hit) return hit as never;
  }
  return undefined;
}

function findLot(id: unknown) {
  if (!queryClient || typeof id !== 'string') return undefined;
  for (const [, data] of queryClient.getQueriesData<ListData>({ queryKey: ['seed-distribution', 'stock'] })) {
    const hit = isList(data) ? data.data.find((l) => l.id === id) : undefined;
    if (hit) return hit;
  }
  return undefined;
}

/** What the server would have sent back, near enough for the screens to show it. */
function syntheticRecord(method: Method, path: string, body: Record<string, unknown> | undefined, m: RegExpMatchArray | null) {
  const now = new Date().toISOString();
  const me = offlineProfile.current();
  const b = body ?? {};
  const farmer = typeof b.farmerId === 'string' ? findFarmer(b.farmerId) : undefined;
  const base: Record<string, unknown> = { ...b, _pending: true, updatedAt: now };

  if (method === 'POST' && /^\/farmers$/.test(path)) {
    return { ...base, status: 'PENDING_VERIFICATION', farmerCode: null, qualityRating: null, createdAt: now, createdById: me?.id };
  }
  if (method === 'POST' && /^\/field-visits$/.test(path)) {
    return { ...base, farmer, expertId: me?.id, expert: me ? { id: me.id, fullName: me.fullName } : undefined, createdAt: now, documents: [] };
  }
  if (method === 'POST' && /^\/field-visit-plans$/.test(path)) {
    return {
      ...base, farmer, status: 'PLANNED', expertId: b.expertId ?? me?.id,
      expert: me ? { id: me.id, fullName: me.fullName } : undefined, branchId: b.branchId ?? farmer?.branchId, createdAt: now,
    };
  }
  if (method === 'POST' && /^\/seed-distribution$/.test(path)) {
    const lot = findLot(b.seedStockId) as Record<string, unknown> | undefined;
    return {
      ...base, farmer, distributedById: me?.id, distributedBy: me ? { id: me.id, fullName: me.fullName } : undefined,
      unit: lot?.unit ?? b.unit ?? 'KG', seedName: lot?.seedName ?? b.seedName, seedVariety: lot?.seedVariety ?? b.seedVariety,
      batchNumber: lot?.batchNumber ?? b.batchNumber, createdAt: now,
    };
  }
  if (method === 'POST' && /^\/training-sessions$/.test(path)) {
    return { ...base, conductedById: me?.id, conductedBy: me ? { id: me.id, fullName: me.fullName } : undefined, _count: { attendances: 0, materials: 0 }, createdAt: now };
  }
  if (method === 'POST' && /\/cancel$/.test(path)) {
    return { id: path.split('/')[2], status: 'CANCELLED', cancelReason: b.reason ?? null, _pending: true };
  }
  if (method === 'POST' && /\/attendance$/.test(path)) {
    const ids = Array.isArray(b.farmerIds) ? (b.farmerIds as string[]) : [];
    return { id: path.split('/')[2], _pending: true, attendances: ids.map((farmerId) => ({ farmerId, attended: true, farmer: findFarmer(farmerId) })), materials: [] };
  }
  if (method === 'DELETE') return { id: path.split('/').pop(), deleted: true, _pending: true };
  if (method === 'PATCH') return { ...base, id: m?.[1] ?? path.split('/').pop() };
  return { ...base, createdAt: now };
}

// --- Showing the saved change on screen straight away ---------------------------------

/** Which cached lists a path's records live in. */
function listPredicate(path: string): ((key: QueryKey) => boolean) | null {
  if (/^\/farmers(\/[^/]+)?$/.test(path)) return (k) => k[0] === 'farmers' && k[1] === 'list';
  const plots = path.match(/^\/farmers\/([^/]+)\/plots/);
  if (plots) return (k) => k[0] === 'farmers' && k[1] === plots[1] && k[2] === 'plots' && k[3] === 'list';
  if (/^\/field-visits(\/[^/]+)?$/.test(path)) return (k) => k[0] === 'field-visits' && k[1] === 'list';
  if (/^\/field-visit-plans/.test(path)) return (k) => k[0] === 'field-visits' && k[1] === 'plans' && k[2] === 'list';
  if (/^\/seed-distribution(\/[^/]+)?$/.test(path)) return (k) => k[0] === 'seed-distribution' && k[1] === 'list';
  if (/^\/training-sessions(\/[^/]+)?$/.test(path)) return (k) => k[0] === 'training-sessions' && k[1] === 'list';
  return null;
}

function applyToCache(method: Method, path: string, record: Record<string, unknown>) {
  if (!queryClient) return;
  const predicate = listPredicate(path);
  const id = record.id as string | undefined;
  if (predicate) {
    for (const [key, data] of queryClient.getQueriesData<ListData>({ predicate: (q) => predicate(q.queryKey) })) {
      if (!isList(data)) continue;
      let rows = data.data;
      const filters = (key[key.length - 1] ?? {}) as Record<string, unknown>;
      if (method === 'POST' && !/\/(cancel|attendance|documents|materials)$/.test(path)) {
        rows = [record, ...rows.filter((r) => r.id !== id)];
      } else if (method === 'DELETE') {
        rows = rows.filter((r) => r.id !== id);
      } else if (/\/cancel$/.test(path) && filters && filters.status === 'PLANNED') {
        rows = rows.filter((r) => r.id !== id);
      } else {
        rows = rows.map((r) => (r.id === id ? { ...r, ...record } : r));
      }
      queryClient.setQueryData(key, { ...data, data: rows });
    }
  }
  // An edit also shows on the record's own screen (farmer profile, visit drawer).
  const detail = path.match(/^\/(farmers|field-visits|training-sessions)\/([^/]+)$/);
  if (detail && method === 'PATCH') {
    queryClient.setQueryData<Record<string, unknown>>([detail[1], 'detail', detail[2]], (old) =>
      old ? { ...old, ...record } : old,
    );
  }
}

// --- The adapter ----------------------------------------------------------------

async function queue(config: InternalAxiosRequestConfig, route: Route, m: RegExpMatchArray, path: string, body: Record<string, unknown> | undefined) {
  const me = offlineProfile.current();
  if (!me) throw new axios.AxiosError('Not signed in', 'ERR_NETWORK', config);
  const record = syntheticRecord(route.method, path, body, m);
  await enqueue({
    userId: me.id,
    method: route.method,
    url: path,
    body,
    label: route.label(body ?? {}, m),
    entityId: (body?.id as string | undefined) ?? (record.id as string | undefined),
  });
  applyToCache(route.method, path, record);
  noticeSavedOffline();
  return respond(config, record);
}

async function saveUploadOffline(config: InternalAxiosRequestConfig, folder: string) {
  const form = config.data as FormData;
  const file = form?.get?.('file');
  if (!(file instanceof Blob)) throw new axios.AxiosError('Nothing to upload', 'ERR_BAD_REQUEST', config);
  const fileName = file instanceof File ? file.name : 'photo.jpg';
  const marker = await saveOfflineFile(folder, file, fileName);
  noticeSavedOffline();
  return respond(config, { url: marker, key: marker, mimeType: file.type, bytes: file.size, offline: true });
}

export function installOfflineAdapter(api: AxiosInstance, client: QueryClient) {
  queryClient = client;
  const network = axios.getAdapter(api.defaults.adapter) as AxiosAdapter;

  api.defaults.adapter = async (config) => {
    const method = (config.method ?? 'get').toUpperCase();
    if (config.headers?.has(REPLAY_HEADER)) {
      // The sync engine: always the network, and the marker never leaves the device.
      config.headers.delete(REPLAY_HEADER);
      return network(config);
    }
    if (method === 'GET') return network(config);

    const path = pathOf(config);

    const upload = path.match(UPLOAD);
    if (upload && method === 'POST') {
      if (!isOnline()) return saveUploadOffline(config, upload[1]);
      try {
        return await network(config);
      } catch (error) {
        if (isUnreachable(error)) return saveUploadOffline(config, upload[1]);
        throw error;
      }
    }

    let route: Route | undefined;
    let match: RegExpMatchArray | null = null;
    for (const r of ROUTES) {
      if (r.method !== method) continue;
      match = path.match(r.pattern);
      if (match) {
        route = r;
        break;
      }
    }
    if (!route || !match) return network(config);

    const body = parseBody(config.data);
    // Every create carries its own id, online or not: if the response is lost
    // on the way back, the replay is recognised instead of duplicated.
    if (route.create && body && !body.id) {
      body.id = uuid();
      config.data = JSON.stringify(body);
    }

    if (!isOnline()) return queue(config, route, match, path, body);
    try {
      return await network(config);
    } catch (error) {
      if (isUnreachable(error)) return queue(config, route, match, path, body);
      throw error;
    }
  };
}

/** True for a record the app saved on the device and has not synced yet. */
export const isPendingRecord = (r: unknown) => Boolean(r && (r as { _pending?: boolean })._pending);
