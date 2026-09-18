import { api } from './client';
import { pruneEmpty } from './envelope';
import type { AdjustCoinBalanceInput, CoinLedger, CoinTransaction, Referral, ReferralQuery } from './types';

/**
 * Super Admin reporting over the refer-a-friend program — who referred whom,
 * whether it qualified, and the coin ledger (including manual corrections)
 * behind any customer's balance. See shared/api/referralSettings.ts for the
 * separate screen that configures the program rather than reporting on it.
 */
export const referralsApi = {
  async list(query: ReferralQuery = {}): Promise<Referral[]> {
    const response = await api.get<Referral[]>('/referrals', { params: pruneEmpty(query) });
    return response.data;
  },

  async ledger(customerId: string): Promise<CoinLedger> {
    const response = await api.get<CoinLedger>(`/referrals/ledger/${customerId}`);
    return response.data;
  },

  async adjust(customerId: string, input: AdjustCoinBalanceInput): Promise<CoinTransaction> {
    const response = await api.post<CoinTransaction>(`/referrals/ledger/${customerId}/adjust`, input);
    return response.data;
  },
};
