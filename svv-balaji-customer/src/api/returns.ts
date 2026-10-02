import { api } from './client';

/**
 * Returns & exchanges, per order item. Everything money- and eligibility-shaped
 * (window, remaining quantity, refund amount, price difference) is decided by
 * the server (svv-balaji-backend/src/returns); this app only shows it.
 */

export type ReturnType = 'RETURN' | 'EXCHANGE';
export type RefundMethod = 'WALLET' | 'UPI' | 'BANK' | 'CREDIT_NOTE';
export type ReturnStatus =
  | 'REQUESTED' | 'APPROVED' | 'PICKUP_SCHEDULED' | 'PICKED_UP' | 'QC' | 'REFUND_INITIATED' | 'REPLACEMENT_PROCESSING'
  | 'SHIPPED' | 'DELIVERED' | 'COMPLETED' | 'REJECTED' | 'PICKUP_FAILED' | 'QC_FAILED' | 'DELIVERY_FAILED' | 'CANCELLED';

export interface ItemCheck {
  eligible: boolean;
  reason: string | null;
  closesAt: string | null;
}

export interface Eligibility {
  orderNumber: string;
  status: string;
  deliveredAt: string | null;
  logistics: 'QUICK_DELIVERY' | 'SHIPROCKET';
  policy: {
    returnWindowHours: number;
    exchangeWindowHours: number;
    mediaRequired: boolean;
    minMediaCount: number;
    maxMediaCount: number;
    exchangeSameProductOnly: boolean;
    exchangeSameCategoryOnly: boolean;
    refundMethods: RefundMethod[];
    defaultRefundMethod: RefundMethod;
    returnShippingFee: number;
    restockingFeePercent: number;
    policyText: string | null;
  };
  reasons: Array<{ id: string; code: string; label: string; forReturn: boolean; forExchange: boolean; requiresMedia: boolean; companyFault: boolean }>;
  items: Array<{
    orderItemId: string;
    productId: string;
    name: string;
    imageUrl: string | null;
    quantity: number;
    remainingQuantity: number;
    unitPaid: number;
    return: ItemCheck;
    exchange: ItemCheck;
    requests: Array<{ requestNumber: string; type: ReturnType; quantity: number; status: ReturnStatus; createdAt: string }>;
  }>;
}

export interface ReplacementOption {
  productId: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  packLabel: string | null;
  sameProduct: boolean;
  unitPrice: number;
  available: number;
}

export interface ReturnSummary {
  requestNumber: string;
  type: ReturnType;
  status: ReturnStatus;
  statusLabel: string;
  orderNumber: string;
  product: { name: string; imageUrl: string | null };
  quantity: number;
  refundAmount: number;
  priceDifference: number;
  differenceStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReturnDetail extends ReturnSummary {
  logistics: 'QUICK_DELIVERY' | 'SHIPROCKET';
  reason: string;
  description: string | null;
  mediaUrls: string[];
  unitPaid: number;
  itemValue: number;
  deductions: { shippingFee: number; restockingFee: number };
  refund: { method: RefundMethod | null; amount: number; reference: string | null; refundedAt: string | null; coinsRestored: { loyalty: number; referral: number } };
  exchange: {
    replacement: { name: string; imageUrl: string | null } | null;
    replacementTotal: number | null;
    priceDifference: number;
    differenceStatus: string;
    amountDue: number;
    canPay: boolean;
  } | null;
  pickupOtp: string | null;
  replacementOtp: string | null;
  rider: { fullName: string; phone: string } | null;
  tracking: Array<{ direction: 'REVERSE' | 'FORWARD'; courier: string | null; awb: string | null; trackingUrl: string | null; status: string }>;
  canCancel: boolean;
  timeline: Array<{ type: string; status: ReturnStatus | null; label: string; at: string; note: string | null }>;
  rejectedReason: string | null;
}

export interface CreateReturnInput {
  orderNumber: string;
  orderItemId: string;
  type: ReturnType;
  quantity: number;
  reasonId: string;
  description?: string;
  mediaUrls?: string[];
  replacementProductId?: string;
  refundMethod?: RefundMethod;
  upiId?: string;
  accountName?: string;
  accountNumber?: string;
  ifsc?: string;
  bankName?: string;
}

export interface DifferencePayment {
  paid: boolean;
  walletUsed: number;
  amountDue: number;
  gateway: { provider: 'mock' | 'razorpay'; keyId?: string; gatewayOrderId: string; amount: number; currency: string } | null;
}

const enc = encodeURIComponent;

export const returnsApi = {
  eligibility: (orderNumber: string) => api.get<Eligibility>(`/storefront/returns/orders/${enc(orderNumber)}/eligibility`).then((r) => r.data),
  replacements: (orderNumber: string, orderItemId: string) =>
    api.get<ReplacementOption[]>(`/storefront/returns/orders/${enc(orderNumber)}/items/${enc(orderItemId)}/replacements`).then((r) => r.data),
  uploadMedia: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<{ url: string; mimeType: string }>('/storefront/returns/media', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
  },
  create: (input: CreateReturnInput, idempotencyKey: string) =>
    api.post<ReturnDetail>('/storefront/returns', input, { headers: { 'Idempotency-Key': idempotencyKey } }).then((r) => r.data),
  list: () => api.get<ReturnSummary[]>('/storefront/returns').then((r) => r.data),
  detail: (requestNumber: string) => api.get<ReturnDetail>(`/storefront/returns/${enc(requestNumber)}`).then((r) => r.data),
  cancel: (requestNumber: string, note?: string) => api.post<ReturnDetail>(`/storefront/returns/${enc(requestNumber)}/cancel`, { note }).then((r) => r.data),
  payDifference: (requestNumber: string, useWallet: boolean) =>
    api.post<DifferencePayment>(`/storefront/returns/${enc(requestNumber)}/pay-difference`, { useWallet }).then((r) => r.data),
  confirmDifference: (requestNumber: string, body: { gatewayPaymentId: string; signature: string }) =>
    api.post<{ paid: boolean }>(`/storefront/returns/${enc(requestNumber)}/pay-difference/confirm`, body).then((r) => r.data),
  refundWallet: () =>
    api
      .get<{ balance: number; transactions: Array<{ id: string; amount: number; balanceAfter: number; reason: string; note: string | null; orderNumber: string | null; requestNumber: string | null; createdAt: string }> }>(
        '/storefront/wallet/refund',
      )
      .then((r) => r.data),
};

export const RETURN_STATUS_COLOR: Record<ReturnStatus, string> = {
  REQUESTED: 'blue', APPROVED: 'cyan', PICKUP_SCHEDULED: 'geekblue', PICKED_UP: 'purple', QC: 'gold', REFUND_INITIATED: 'orange',
  REPLACEMENT_PROCESSING: 'orange', SHIPPED: 'purple', DELIVERED: 'green', COMPLETED: 'green', REJECTED: 'red', PICKUP_FAILED: 'volcano',
  QC_FAILED: 'red', DELIVERY_FAILED: 'volcano', CANCELLED: 'default',
};

export const REFUND_METHOD_LABEL: Record<RefundMethod, string> = {
  WALLET: 'Refund Wallet (instant, use on your next order)',
  UPI: 'UPI transfer',
  BANK: 'Bank transfer',
  CREDIT_NOTE: 'Credit note against your account',
};
