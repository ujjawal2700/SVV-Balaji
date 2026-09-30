import { api } from './client';

export interface InboxItem {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export const INBOX_KEY = ['storefront', 'notifications'] as const;

/** Desi Tokri broadcasts and transactional order updates + device registration. */
export const notificationsApi = {
  async inbox() {
    return (await api.get<{ items: InboxItem[]; unread: number }>('/storefront/notifications')).data;
  },
  async markRead(ids?: string[]) {
    await api.patch('/storefront/notifications/read', { ids });
  },
  async registerDevice(token: string) {
    await api.post('/storefront/notifications/devices', { token, app: 'CUSTOMER' });
  },
  /** No auth needed - called while signing out. */
  async unregisterDevice(token: string) {
    await api.post('/notifications/devices/unregister', { token });
  },
};
