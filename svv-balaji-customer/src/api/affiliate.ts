import { api } from './client';

/**
 * Affiliate program, shopper side (backend `src/affiliates`). Every number here
 * - commission rates, what was earned, what was taken back, what is payable -
 * is the server's; this app only shows it.
 */

export type AffiliateStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
export type PayoutMethod = 'UPI' | 'BANK';
export type CommissionStatus = 'PENDING' | 'APPROVED' | 'PAID' | 'REFUNDED' | 'CANCELLED';

export interface AffiliateProfile {
  id: string;
  code: string;
  status: AffiliateStatus;
  fullName: string;
  phone: string;
  email: string | null;
  promotionUrl: string | null;
  payoutMethod: PayoutMethod;
  payoutUpiId: string | null;
  payoutAccountName: string | null;
  /** Masked, e.g. XXXX1234. */
  payoutAccountNumber: string | null;
  payoutIfsc: string | null;
  payoutBankName: string | null;
  rejectionReason: string | null;
  suspendedReason: string | null;
  appliedAt: string;
  reviewedAt: string | null;
}

export interface Balances {
  pending: number;
  approvedGross: number;
  clawbackDue: number;
  payable: number;
  paid: number;
  reversed: number;
}

export interface CommissionRow {
  id: string;
  orderNumber: string;
  orderDate: string;
  orderStatus: string;
  productName: string;
  categoryName: string | null;
  quantity: number;
  grossAmount: number;
  couponShare: number;
  baseAmount: number;
  ratePercent: number;
  commissionAmount: number;
  refundedQuantity: number;
  refundedAmount: number;
  netAmount: number;
  status: CommissionStatus;
  statusNote: string | null;
  releaseDate: string;
  paidAt: string | null;
  payoutNumber: string | null;
}

export interface AffiliateDashboard {
  clicks: number;
  clicksLast30Days: number;
  successfulOrders: number;
  conversionRatePercent: number;
  totalEarnings: number;
  balances: Balances;
  holdDays: number;
  recentCommissions: CommissionRow[];
}

export interface AffiliateMe {
  program: { enabled: boolean; cookieDays: number; holdDays: number; termsText: string | null };
  affiliate: AffiliateProfile | null;
  dashboard: AffiliateDashboard | null;
}

export interface PayoutRow {
  id: string;
  payoutNumber: string;
  netAmount: number;
  grossAmount: number;
  clawbackAmount: number;
  commissionCount: number;
  method: PayoutMethod;
  paidTo: string;
  reference: string;
  paidAt: string;
}

export interface PayoutDetails {
  payoutMethod?: PayoutMethod;
  payoutUpiId?: string;
  payoutAccountName?: string;
  payoutAccountNumber?: string;
  payoutIfsc?: string;
  payoutBankName?: string;
}

export interface ApplyBody extends PayoutDetails {
  fullName: string;
  email?: string;
  promotionUrl?: string;
  audienceSize?: string;
  promotionPlan?: string;
  pan?: string;
  acceptTerms: boolean;
}

export const COMMISSION_STATUS_LABEL: Record<CommissionStatus, string> = {
  PENDING: 'On hold',
  APPROVED: 'Ready for payout',
  PAID: 'Paid',
  REFUNDED: 'Returned',
  CANCELLED: 'Cancelled',
};

export const COMMISSION_STATUS_COLOR: Record<CommissionStatus, string> = {
  PENDING: 'gold',
  APPROVED: 'blue',
  PAID: 'green',
  REFUNDED: 'default',
  CANCELLED: 'default',
};

export interface AffiliateProgramInfo {
  enabled: boolean;
  cookieDays: number;
  holdDays: number;
  holdFrom: 'ORDER_DATE' | 'DELIVERY_DATE';
  minPayoutAmount: number;
  termsText: string | null;
  maxRatePercent: number;
  rates: Array<{ category: string; parentCategory: string | null; ratePercent: number }>;
  stats: { activeAffiliates: number; totalPaidOut: number };
}

export const affiliateApi = {
  /** Public - the landing page works without signing in. */
  program: () => api.get<AffiliateProgramInfo>('/storefront/affiliate/program').then((r) => r.data),
  /**
   * Record a visit through ?aff=CODE. The server answers with an HTTP-only
   * cookie this script can neither read nor write - that is the point.
   */
  track: (code: string, landingPath: string, referrer?: string) =>
    api
      .post<{ tracked: boolean; affiliateCode?: string }>(
        '/storefront/affiliate/track',
        { code, landingPath, referrer: referrer || undefined },
        { withCredentials: true },
      )
      .then((r) => r.data),
  me: () => api.get<AffiliateMe>('/storefront/affiliate/me').then((r) => r.data),
  apply: (body: ApplyBody) => api.post<AffiliateMe>('/storefront/affiliate/apply', body).then((r) => r.data),
  update: (body: PayoutDetails & { email?: string; promotionUrl?: string }) =>
    api.patch<AffiliateMe>('/storefront/affiliate/me', body).then((r) => r.data),
  commissions: (page = 1, pageSize = 20) =>
    api
      .get<{ total: number; page: number; pageSize: number; data: CommissionRow[] }>('/storefront/affiliate/commissions', { params: { page, pageSize } })
      .then((r) => r.data),
  payouts: () => api.get<PayoutRow[]>('/storefront/affiliate/payouts').then((r) => r.data),
};
