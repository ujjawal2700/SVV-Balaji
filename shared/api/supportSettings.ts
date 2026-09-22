import { api } from './client';
import type { SupportSettings, UpdateSupportSettingsInput } from './types';

export const supportSettingsApi = {
  async get(): Promise<SupportSettings> {
    const response = await api.get<SupportSettings>('/support-settings');
    return response.data;
  },

  async update(input: UpdateSupportSettingsInput): Promise<SupportSettings> {
    const response = await api.patch<SupportSettings>('/support-settings', input);
    return response.data;
  },

  async getStorefront(channel?: string): Promise<SupportSettings> {
    const response = await api.get<SupportSettings>('/support-settings/public', {
      params: channel ? { channel } : undefined,
    });
    return response.data;
  },
};
