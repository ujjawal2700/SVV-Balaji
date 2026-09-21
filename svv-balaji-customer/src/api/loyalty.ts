import { api } from './client';

/**
 * Loyalty, as the storefront sees it. Every number comes from the server: the
 * rates and eligibility are configured by Super Admin, and this app never
 * computes points itself (see svv-balaji-backend/src/loyalty/).
 */

export type LoyaltyLedgerType =
  | 'LOYALTY_EARN'
  | 'LOYALTY_REVERSAL'
  | 'LOYALTY_EXPIRY'
  | 'REFERRAL_REFERRER_REWARD'
  | 'REFERRAL_REFEREE_REWARD'
  | 'MANUAL_ADJUSTMENT';

export interface LoyaltyHistoryItem {
  id: string;
  type: LoyaltyLedgerType;
  points: number;
  orderNumber: string | null;
  note: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface LoyaltyProgram {
  earnPercent: number;
  pointValueInr: number;
  expiryMonths: number | null;
  minEligibleOrderAmount: number | null;
  maxRewardPerOrderInr: number | null;
  appliesToDiscountedProducts: boolean;
  calculationBase: 'EXCLUDING_TAX' | 'INCLUDING_TAX';
}

export interface LoyaltySummary {
  enabled: boolean;
  balance: number;
  balanceValueInr: number;
  lifetimeEarned: number;
  program: LoyaltyProgram | null;
  expiringSoon: { points: number; on: string } | null;
  history: LoyaltyHistoryItem[];
}

export interface LoyaltyEstimate {
  enabled: boolean;
  earnPercent: number;
  pointValueInr: number;
  points: number;
  rewardInr: number;
  eligibleAmount: number;
  skipReason: string | null;
  cappedByMax: boolean;
  lines: Array<{ productId: string; eligible: boolean; reason: string | null; points: number }>;
  unpriced: string[];
}

export const loyaltyApi = {
  summary(): Promise<LoyaltySummary> {
    return api.get<LoyaltySummary>('/storefront/loyalty').then((r) => r.data);
  },

  estimate(
    lines: Array<{ productId: string; quantity: number }>,
    channel: 'B2C' | 'B2B',
  ): Promise<LoyaltyEstimate> {
    return api
      .post<LoyaltyEstimate>('/storefront/loyalty/estimate', {
        lines,
        channel,
        customerType: channel === 'B2B' ? 'RETAILER' : 'CONSUMER',
      })
      .then((r) => r.data);
  },
};
