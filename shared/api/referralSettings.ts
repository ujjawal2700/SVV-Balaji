import { api } from './client';
import type { ReferralSettings, UpdateReferralSettingsInput } from './types';

/**
 * The one-row config behind the refer-a-friend program — reward amounts,
 * trigger and on/off switch. See shared/api/types.ts and
 * svv-balaji-backend/src/common/referral.service.ts for how it's applied.
 */
export const referralSettingsApi = {
  async get(): Promise<ReferralSettings> {
    const response = await api.get<ReferralSettings>('/referral-settings');
    return response.data;
  },

  async update(input: UpdateReferralSettingsInput): Promise<ReferralSettings> {
    const response = await api.patch<ReferralSettings>('/referral-settings', input);
    return response.data;
  },
};
