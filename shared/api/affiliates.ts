import { api } from './client';

/**
 * Affiliate program, staff side (backend `src/affiliates`): applications,
 * the per-item commission ledger, the self-referral (fraud) log, the
 * category commission matrix and the manual payout run.
 */

export type AffiliateStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
export type CommissionStatus = 'PENDING' | 'APPROVED' | 'PAID' | 'REFUNDED' | 'CANCELLED';
export type AttributionStatus = 'ATTRIBUTED' | 'FRAUD' | 'NO_COMMISSION';
export type PayoutMethod = 'UPI' | 'BANK';

export interface AffiliateBalances {
  pending: number;
  approvedGross: number;
  clawbackDue: number;
  payable: number;
  paid: number;
  reversed: number;
}

export interface Affiliate {
  id: string;
  code: string;
  status: AffiliateStatus;
  fullName: string;
  phone: string;
  email: string | null;
  customerId: string | null;
  promotionUrl: string | null;
  audienceSize: string | null;
  promotionPlan: string | null;
  pan: string | null;
  payoutMethod: PayoutMethod;
  payoutUpiId: string | null;
  payoutAccountName: string | null;
  payoutAccountNumber: string | null;
  payoutIfsc: string | null;
  payoutBankName: string | null;
  rejectionReason: string | null;
  suspendedReason: string | null;
  reviewedAt: string | null;
  appliedAt: string;
}

export interface AffiliateListRow extends Affiliate {
  clicks: number;
  successfulOrders: number;
  flaggedOrders: number;
  balances: AffiliateBalances;
}

export interface CommissionRow {
  id: string;
  orderNumber: string;
  orderDate: string;
  orderStatus: string;
  affiliateId: string;
  affiliateCode: string;
  affiliateName: string;
  productName: string;
  categoryName: string | null;
  quantity: number;
  grossAmount: number;
  couponShare: number;
  baseAmount: number;
  ratePercent: number;
  rateSource: 'CATEGORY' | 'PARENT_CATEGORY' | 'DEFAULT';
  commissionAmount: number;
  refundedQuantity: number;
  refundedAmount: number;
  netAmount: number;
  status: CommissionStatus;
  statusNote: string | null;
  releaseDate: string;
  approvedAt: string | null;
  paidAt: string | null;
  payoutNumber: string | null;
  adjustments: Array<{ quantity: number; amount: number; clawback: boolean; createdAt: string; note: string | null }>;
}

export interface AttributionRow {
  id: string;
  status: AttributionStatus;
  fraudReasons: string[];
  fraudDetail: string | null;
  createdAt: string;
  baseTotal: number;
  commissionTotal: number;
  orderId: string;
  orderNumber: string;
  orderTotal: number;
  orderStatus: string;
  customerName: string;
  customerCode: string;
  affiliateId: string;
  affiliateCode: string;
  affiliateName: string;
}

export interface AffiliateSettings {
  enabled: boolean;
  cookieDays: number;
  holdDays: number;
  holdFrom: 'ORDER_DATE' | 'DELIVERY_DATE';
  defaultRatePercent: number;
  applyToB2B: boolean;
  minPayoutAmount: number;
  termsText: string | null;
  updatedAt: string | null;
}

export interface CategoryRateRow {
  id: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
  isActive: boolean;
  productCount: number;
  ratePercent: number | null;
  effectiveRatePercent: number;
  effectiveSource: 'CATEGORY' | 'PARENT_CATEGORY' | 'DEFAULT';
  inheritedFrom: string | null;
  updatedAt: string | null;
}

export interface PayoutDueRow extends Affiliate {
  commissionCount: number;
  oldestApprovedAt: string | null;
  balances: AffiliateBalances;
  payoutDetailsComplete: boolean;
}

export interface PayoutRow {
  id: string;
  payoutNumber: string;
  affiliateId: string;
  affiliateCode: string;
  affiliateName: string;
  grossAmount: number;
  clawbackAmount: number;
  netAmount: number;
  commissionCount: number;
  method: PayoutMethod;
  paidTo: string;
  reference: string;
  note: string | null;
  paidAt: string;
}

export const AFFILIATE_STATUS_COLOR: Record<AffiliateStatus, string> = { PENDING: 'gold', APPROVED: 'green', REJECTED: 'red', SUSPENDED: 'volcano' };
export const COMMISSION_STATUS_LABEL: Record<CommissionStatus, string> = {
  PENDING: 'On hold', APPROVED: 'Matured', PAID: 'Paid', REFUNDED: 'Returned', CANCELLED: 'Cancelled',
};
export const COMMISSION_STATUS_COLOR: Record<CommissionStatus, string> = {
  PENDING: 'gold', APPROVED: 'blue', PAID: 'green', REFUNDED: 'default', CANCELLED: 'default',
};
export const FRAUD_REASON_LABEL: Record<string, string> = {
  SAME_CUSTOMER: 'Affiliate\'s own account',
  PHONE_MATCH: 'Same phone',
  EMAIL_MATCH: 'Same email',
  PAYMENT_MATCH: 'Same payment instrument',
};

export const affiliatesApi = {
  list: (params: { status?: AffiliateStatus; search?: string } = {}) =>
    api.get<AffiliateListRow[]>('/affiliates', { params }).then((r) => r.data),
  detail: (id: string) => api.get<Affiliate & { dashboard: { balances: AffiliateBalances; clicks: number; successfulOrders: number; totalEarnings: number } }>(`/affiliates/${id}`).then((r) => r.data),
  approve: (id: string) => api.post(`/affiliates/${id}/approve`, {}).then((r) => r.data),
  reject: (id: string, reason: string) => api.post(`/affiliates/${id}/reject`, { reason }).then((r) => r.data),
  suspend: (id: string, reason: string) => api.post(`/affiliates/${id}/suspend`, { reason }).then((r) => r.data),
  reactivate: (id: string) => api.post(`/affiliates/${id}/reactivate`, {}).then((r) => r.data),
  commissions: (params: { affiliateId?: string; status?: CommissionStatus; page?: number; pageSize?: number }) =>
    api.get<{ total: number; page: number; pageSize: number; data: CommissionRow[] }>('/affiliates/commissions', { params }).then((r) => r.data),
  attributions: (params: { status?: AttributionStatus; affiliateId?: string } = {}) =>
    api.get<AttributionRow[]>('/affiliates/attributions', { params }).then((r) => r.data),

  settings: () => api.get<AffiliateSettings>('/affiliate-settings').then((r) => r.data),
  updateSettings: (body: Partial<Omit<AffiliateSettings, 'updatedAt'>>) => api.patch<AffiliateSettings>('/affiliate-settings', body).then((r) => r.data),
  categoryRates: () => api.get<{ defaultRatePercent: number; categories: CategoryRateRow[] }>('/affiliate-settings/category-rates').then((r) => r.data),
  setCategoryRates: (rates: Array<{ categoryId: string; ratePercent: number | null }>) =>
    api.put<{ defaultRatePercent: number; categories: CategoryRateRow[] }>('/affiliate-settings/category-rates', { rates }).then((r) => r.data),

  payoutsDue: () => api.get<{ minPayoutAmount: number; data: PayoutDueRow[] }>('/affiliate-payouts/due').then((r) => r.data),
  payouts: (affiliateId?: string) => api.get<PayoutRow[]>('/affiliate-payouts', { params: { affiliateId } }).then((r) => r.data),
  pay: (body: { affiliateId: string; reference: string; expectedNetAmount: number; note?: string }) =>
    api.post<PayoutRow>('/affiliate-payouts', body).then((r) => r.data),
};
