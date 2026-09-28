import { api } from './client';

/** Mirrors BroadcastAudienceType in svv-balaji-backend/src/notifications/notifications.dto.ts */
export type BroadcastAudienceType = 'EVERYONE' | 'CUSTOMERS' | 'RETAILERS' | 'RIDERS' | 'STAFF' | 'SPECIFIC';
export type RecipientKind = 'STAFF' | 'CUSTOMER' | 'RIDER';

export interface RecipientRef {
  kind: RecipientKind;
  id: string;
}

export interface BroadcastAudience {
  type: BroadcastAudienceType;
  roles?: string[];
  branchIds?: string[];
  cities?: string[];
  states?: string[];
  pincodes?: string[];
  salesExecutiveIds?: string[];
  warehouseIds?: string[];
  onlineOnly?: boolean;
  recipients?: RecipientRef[];
}

export interface SendBroadcastInput {
  title: string;
  body: string;
  imageUrl?: string;
  link?: string;
  audience: BroadcastAudience;
}

export interface AudiencePreview {
  staff: number;
  customers: number;
  riders: number;
  total: number;
  /** People with at least one signed-in device - they get the pop-up. */
  reachable: number;
  devices: number;
  pushEnabled: boolean;
}

export interface Broadcast {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  link: string | null;
  audience: BroadcastAudience;
  audienceSummary: string;
  recipientCount: number;
  reachableCount: number;
  deviceCount: number;
  sentCount: number;
  failedCount: number;
  readCount?: number;
  createdAt: string;
  createdBy?: { id: string; fullName: string };
  pushEnabled?: boolean;
}

export interface BroadcastOptions {
  roles: Array<{ value: string; label: string }>;
  branches: Array<{ id: string; name: string }>;
  outlets: Array<{ id: string; name: string; kind: string }>;
  salesExecutives: Array<{ id: string; fullName: string }>;
  cities: string[];
  pushEnabled: boolean;
}

export interface RecipientSearchResult extends RecipientRef {
  name: string;
  subtitle: string;
  group: string;
  devices: number;
}

export interface InboxItem {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export const PUSH_KEYS = {
  history: (page: number) => ['push-broadcasts', page] as const,
  options: ['push-broadcasts', 'options'] as const,
  inbox: ['notifications', 'inbox'] as const,
};

export const pushNotificationsApi = {
  async history(page = 1, pageSize = 20) {
    const r = await api.get<{ items: Broadcast[]; total: number; page: number; pageSize: number }>('/notifications/broadcasts', {
      params: { page, pageSize },
    });
    return r.data;
  },
  async options() {
    return (await api.get<BroadcastOptions>('/notifications/broadcasts/options')).data;
  },
  async search(q: string, kind?: RecipientKind) {
    return (await api.get<RecipientSearchResult[]>('/notifications/broadcasts/recipients', { params: { q, kind } })).data;
  },
  async preview(audience: BroadcastAudience) {
    return (await api.post<AudiencePreview>('/notifications/broadcasts/preview', audience)).data;
  },
  async send(input: SendBroadcastInput) {
    return (await api.post<Broadcast>('/notifications/broadcasts', input)).data;
  },

  // --- the signed-in staff member's own devices + inbox (admin panel, field app)
  async registerDevice(token: string, app: 'ADMIN' | 'FIELD') {
    await api.post('/notifications/me/devices', { token, app });
  },
  /** No auth needed - works after the session has already been cleared. */
  async unregisterDevice(token: string) {
    await api.post('/notifications/devices/unregister', { token });
  },
  async inbox() {
    return (await api.get<{ items: InboxItem[]; unread: number }>('/notifications/me/inbox')).data;
  },
  async markRead(ids?: string[]) {
    await api.patch('/notifications/me/inbox/read', { ids });
  },
};
