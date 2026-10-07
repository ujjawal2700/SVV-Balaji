import { api } from './client';

/**
 * Percentage-based loyalty program. The server owns every rule and every
 * calculation; nothing in either front end works out points itself.
 * See svv-balaji-backend/src/loyalty/.
 */

export type LoyaltyEligibility = 'INHERIT' | 'ELIGIBLE' | 'NOT_ELIGIBLE';
export type LoyaltyCalculationBase = 'EXCLUDING_TAX' | 'INCLUDING_TAX';

export const LOYALTY_ELIGIBILITY_LABELS: Record<LoyaltyEligibility, string> = {
  INHERIT: 'Inherit',
  ELIGIBLE: 'Loyalty eligible',
  NOT_ELIGIBLE: 'Loyalty not eligible',
};

export const LOYALTY_CALCULATION_BASE_LABELS: Record<LoyaltyCalculationBase, string> = {
  EXCLUDING_TAX: 'Item value excluding GST',
  INCLUDING_TAX: 'Item value including GST',
};

/** Decimals arrive as strings (Prisma), same convention as the rest of the panel. */
export interface LoyaltySettings {
  id: string;
  isActive: boolean;
  earnPercentB2C: string;
  earnPercentB2B: string;
  pointValueInr: string;
  calculationBase: LoyaltyCalculationBase;
  defaultEligible: boolean;
  appliesToDiscountedProducts: boolean;
  minEligibleItemAmount: string | null;
  minEligibleOrderAmount: string | null;
  maxRewardPerOrderInr: string | null;
  pointsExpiryMonths: number | null;
  updatedAt: string;
}

export interface UpdateLoyaltySettingsInput {
  isActive?: boolean;
  earnPercentB2C?: number;
  earnPercentB2B?: number;
  pointValueInr?: number;
  calculationBase?: LoyaltyCalculationBase;
  defaultEligible?: boolean;
  appliesToDiscountedProducts?: boolean;
  minEligibleItemAmount?: number | null;
  minEligibleOrderAmount?: number | null;
  maxRewardPerOrderInr?: number | null;
  pointsExpiryMonths?: number | null;
}

export type EligibilitySource = 'PRODUCT' | 'CATEGORY' | 'PARENT_CATEGORY' | 'DEFAULT';

export interface EligibilityPreview {
  eligible: boolean;
  source: EligibilitySource;
  programActive: boolean;
}

export interface LoyaltyOrderLine {
  product: string;
  sku: string;
  quantity: number;
  baseAmount: number;
  eligible: boolean;
  ineligibleReason: 'PRODUCT_NOT_ELIGIBLE' | 'DISCOUNTED' | 'BELOW_MIN_ITEM' | null;
  eligibilitySource: EligibilitySource;
  points: number;
  reversedPoints: number;
}

export interface LoyaltyOrderBreakdown {
  orderNumber: string;
  status: string;
  credited: boolean;
  earn: {
    eligibleAmount: number;
    percentApplied: number;
    pointValueApplied: number;
    calculationBase: LoyaltyCalculationBase;
    rewardInr: number;
    points: number;
    cappedByMax: boolean;
    skipReason: 'PROGRAM_OFF' | 'NO_RATE' | 'NO_ELIGIBLE_ITEMS' | 'BELOW_MIN_ORDER' | null;
    lines: LoyaltyOrderLine[];
  } | null;
  returns: Array<{
    product: string;
    quantity: number;
    reason: string;
    refundAmount: number | null;
    recordedBy: string;
    createdAt: string;
  }>;
  ledger: Array<{ id: string; reason: string; amount: number; note: string | null; createdAt: string }>;
}

export interface RecordReturnInput {
  items: Array<{ orderItemId: string; quantity: number }>;
  reason: string;
  refundAmount?: number;
}

export interface RecordReturnResult {
  orderNumber: string;
  loyaltyPointsReversed: number;
}

export type CoinReason =
  | 'LOYALTY_EARN' | 'LOYALTY_REVERSAL' | 'LOYALTY_EXPIRY' | 'LOYALTY_REDEMPTION' | 'LOYALTY_REDEMPTION_REFUND'
  | 'REFERRAL_REFERRER_REWARD' | 'REFERRAL_REFEREE_REWARD' | 'REFERRAL_REDEMPTION' | 'REFERRAL_REDEMPTION_REFUND'
  | 'MANUAL_ADJUSTMENT';

export interface CoinLedgerQuery {
  reason?: CoinReason;
  source?: 'LOYALTY' | 'REFERRAL';
  channel?: 'B2B' | 'B2C';
  /** YYYY-MM-DD (IST), inclusive. */
  from?: string;
  to?: string;
  search?: string;
  customerId?: string;
  page?: number;
  limit?: number;
}

export interface CoinLedgerRow {
  id: string;
  createdAt: string;
  amount: number;
  reason: CoinReason;
  reasonLabel: string;
  source: 'LOYALTY' | 'REFERRAL';
  note: string | null;
  expiresAt: string | null;
  remainingAmount: number | null;
  customer: { id: string; name: string; customerCode: string; channel: 'B2B' | 'B2C'; phone: string };
  order: { id: string; orderNumber: string; channel: 'B2B' | 'B2C' } | null;
  performedBy: string | null;
  referralText: string | null;
}

export interface CoinLedgerSummary {
  issued: number;
  redeemed: number;
  reversed: number;
  expired: number;
  manualAdded: number;
  manualRemoved: number;
  outstanding: number;
  customers: number;
  transactions: number;
  byReason: Array<{ reason: CoinReason; label: string; count: number; amount: number }>;
}

export const loyaltyApi = {
  /** GET /loyalty/ledger - every coin movement across customers, with totals. */
  async coinLedger(q: CoinLedgerQuery): Promise<{ data: CoinLedgerRow[]; meta: { total: number; page: number; limit: number }; summary: CoinLedgerSummary }> {
    const response = await api.get('/loyalty/ledger', { params: q });
    return response.data;
  },

  /** GET /loyalty/ledger/export - same filters, CSV file. */
  async coinLedgerCsv(q: CoinLedgerQuery): Promise<Blob> {
    const response = await api.get('/loyalty/ledger/export', { params: q, responseType: 'blob' });
    return response.data as Blob;
  },

  async getSettings(): Promise<LoyaltySettings> {
    const response = await api.get<LoyaltySettings>('/loyalty/settings');
    return response.data;
  },

  async updateSettings(input: UpdateLoyaltySettingsInput): Promise<LoyaltySettings> {
    const response = await api.patch<LoyaltySettings>('/loyalty/settings', input);
    return response.data;
  },

  async eligibility(productEligibility: LoyaltyEligibility, categoryId?: string): Promise<EligibilityPreview> {
    const response = await api.get<EligibilityPreview>('/loyalty/eligibility', {
      params: { productEligibility, categoryId },
    });
    return response.data;
  },

  async orderBreakdown(orderNumber: string): Promise<LoyaltyOrderBreakdown> {
    const response = await api.get<LoyaltyOrderBreakdown>(`/loyalty/orders/${encodeURIComponent(orderNumber)}`);
    return response.data;
  },

  async recordReturn(orderId: string, input: RecordReturnInput): Promise<RecordReturnResult> {
    const response = await api.post<RecordReturnResult>(`/orders/${orderId}/returns`, input);
    return response.data;
  },
};
