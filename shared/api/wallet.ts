import { api } from './client';
import type { UpdateWalletSettingsInput, WalletBalance, WalletSettings } from './types';

/**
 * Wallet-wide config: whether referral coins and loyalty coins redeem
 * separately or as one combined balance at checkout. See
 * svv-balaji-backend/src/wallet/wallet.service.ts.
 */
export const walletApi = {
  async getSettings(): Promise<WalletSettings> {
    const response = await api.get<WalletSettings>('/wallet/settings');
    return response.data;
  },

  async updateSettings(input: UpdateWalletSettingsInput): Promise<WalletSettings> {
    const response = await api.patch<WalletSettings>('/wallet/settings', input);
    return response.data;
  },

  async customerBalance(customerId: string): Promise<WalletBalance> {
    const response = await api.get<WalletBalance>(`/wallet/customers/${customerId}`);
    return response.data;
  },
};
