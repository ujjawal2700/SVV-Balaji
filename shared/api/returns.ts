import { api } from './client';
import { pruneEmpty } from './envelope';

/**
 * Returns & exchanges, staff side (backend `src/returns`). Customers (B2C) and
 * retailers (B2B) are separate queues: `/returns/customers` and
 * `/returns/retailers`, each behind its own permission.
 */

export type ReturnChannel = 'B2C' | 'B2B';
export type ReturnType = 'RETURN' | 'EXCHANGE';
export type ReturnLogistics = 'QUICK_DELIVERY' | 'SHIPROCKET';
export type RefundMethod = 'WALLET' | 'UPI' | 'BANK' | 'CREDIT_NOTE';
export type ReturnStatus =
  | 'REQUESTED' | 'APPROVED' | 'PICKUP_SCHEDULED' | 'PICKED_UP' | 'QC' | 'REFUND_INITIATED' | 'REPLACEMENT_PROCESSING'
  | 'SHIPPED' | 'DELIVERED' | 'COMPLETED' | 'REJECTED' | 'PICKUP_FAILED' | 'QC_FAILED' | 'DELIVERY_FAILED' | 'CANCELLED';

export const RETURN_STATUS_LABEL: Record<ReturnStatus, string> = {
  REQUESTED: 'Requested', APPROVED: 'Approved', PICKUP_SCHEDULED: 'Pickup scheduled', PICKED_UP: 'Picked up', QC: 'Received · QC pending',
  REFUND_INITIATED: 'Refund initiated', REPLACEMENT_PROCESSING: 'Replacement processing', SHIPPED: 'Replacement shipped',
  DELIVERED: 'Replacement delivered', COMPLETED: 'Completed', REJECTED: 'Rejected', PICKUP_FAILED: 'Pickup failed',
  QC_FAILED: 'QC failed', DELIVERY_FAILED: 'Replacement delivery failed', CANCELLED: 'Cancelled',
};

export const RETURN_STATUS_COLOR: Record<ReturnStatus, string> = {
  REQUESTED: 'blue', APPROVED: 'cyan', PICKUP_SCHEDULED: 'geekblue', PICKED_UP: 'purple', QC: 'gold', REFUND_INITIATED: 'orange',
  REPLACEMENT_PROCESSING: 'orange', SHIPPED: 'purple', DELIVERED: 'green', COMPLETED: 'green', REJECTED: 'red', PICKUP_FAILED: 'volcano',
  QC_FAILED: 'red', DELIVERY_FAILED: 'volcano', CANCELLED: 'default',
};

export const REFUND_METHOD_LABEL: Record<RefundMethod, string> = {
  WALLET: 'Refund Wallet', UPI: 'Manual UPI', BANK: 'Manual bank transfer', CREDIT_NOTE: 'Credit note (B2B)',
};

export interface ReturnRow {
  id: string;
  requestNumber: string;
  type: ReturnType;
  status: ReturnStatus;
  statusLabel: string;
  logistics: ReturnLogistics;
  orderNumber: string;
  customer: { id: string; name: string; phone: string; code: string };
  product: string;
  quantity: number;
  reason: string;
  companyFault: boolean;
  refundAmount: number;
  priceDifference: number;
  differenceStatus: string;
  mediaCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReturnList {
  total: number;
  page: number;
  pageSize: number;
  counts: Partial<Record<ReturnStatus, number>>;
  rows: ReturnRow[];
}

export interface ReturnDetail {
  id: string;
  requestNumber: string;
  type: ReturnType;
  status: ReturnStatus;
  statusLabel: string;
  channel: ReturnChannel;
  logistics: ReturnLogistics;
  createdAt: string;
  raisedBy: string;
  order: { id: string; orderNumber: string; deliveredAt: string | null; paymentMode: string | null; paymentStatus: string; fulfillmentMethod: string | null };
  customer: { id: string; name: string; phone: string; email: string | null; customerCode: string };
  address: { fullName: string; phone: string; line1: string; line2: string | null; city: string; state: string; pincode: string };
  warehouse: { id: string; name: string; kind: string };
  item: { orderItemId: string; productId: string; name: string; sku: string; imageUrl: string | null; orderedQuantity: number };
  quantity: number;
  reason: { label: string; code: string | null; companyFault: boolean };
  description: string | null;
  mediaUrls: string[];
  adminNote: string | null;
  money: {
    unitPaid: number; itemValue: number; shippingFee: number; restockingFee: number; refundAmount: number;
    loyaltyPointsToRestore: number; referralPointsToRestore: number;
  };
  refund: {
    method: RefundMethod | null; upiId: string | null; accountName: string | null; accountNumber: string | null; ifsc: string | null;
    bankName: string | null; reference: string | null; note: string | null; refundedAt: string | null; allowedMethods: RefundMethod[];
  };
  exchange: {
    replacementProduct: { id: string; name: string; sku: string } | null;
    replacementName: string | null;
    replacementUnitPrice: number | null;
    replacementTotal: number | null;
    priceDifference: number;
    differenceStatus: string;
    differencePaidWallet: number;
    differenceReference: string | null;
    reservedAt: string | null;
    shippedAt: string | null;
    deliveredAt: string | null;
    allocations: Array<{ fgBatchNumber: string; expiryDate: string | null; quantity: number; dispatchedAt: string | null; releasedAt: string | null; releasedReason: string | null }>;
  } | null;
  qc: { decision: 'ACCEPT' | 'REJECT'; goodQuantity: number; damagedQuantity: number; notes: string | null; at: string } | null;
  qcRequired: boolean;
  lostInTransit: boolean;
  stock: Array<{ fgBatchNumber: string; quantity: number; disposition: 'GOOD' | 'DAMAGED' }>;
  shipments: Array<{
    id: string; direction: 'REVERSE' | 'FORWARD'; provider: string; awb: string | null; courier: string | null; trackingUrl: string | null;
    labelUrl: string | null; externalStatus: string; isActive: boolean; events: Array<{ at: string; status: string; note?: string }>; createdAt: string;
  }>;
  riderTasks: Array<{ id: string; taskNumber: string; kind: string; status: string; attempt: number; failureReasonCode: string | null; failureNote: string | null; createdAt: string; rider: { fullName: string; phone: string } | null }>;
  walletTransactions: Array<{ amount: number; reason: string; note: string | null; at: string }>;
  stamps: Record<string, string | null>;
  timeline: Array<{ type: string; fromStatus: ReturnStatus | null; toStatus: ReturnStatus | null; note: string | null; actorKind: string; actor: string; at: string }>;
  actions: string[];
  warning?: string;
}

export interface ReturnListQuery {
  status?: ReturnStatus;
  type?: ReturnType;
  logistics?: ReturnLogistics;
  search?: string;
  view?: 'open' | 'closed' | 'all';
  page?: number;
}

export interface ReturnSettings {
  id: string;
  channel: ReturnChannel;
  returnEnabled: boolean;
  exchangeEnabled: boolean;
  returnWindowHours: number;
  exchangeWindowHours: number;
  mediaRequired: boolean;
  minMediaCount: number;
  maxMediaCount: number;
  qcRequired: boolean;
  autoApprove: boolean;
  allowedRefundMethods: RefundMethod[];
  defaultRefundMethod: RefundMethod;
  returnShippingPayer: 'COMPANY' | 'CUSTOMER';
  returnShippingFee: number;
  restockingFeePercent: number;
  exchangeSameProductOnly: boolean;
  exchangeSameCategoryOnly: boolean;
  exchangeLowerPriceAction: 'REFUND_TO_WALLET' | 'NO_REFUND';
  restockOnQcPass: boolean;
  nonReturnableCategoryIds: string[];
  nonReturnableProductIds: string[];
  nonExchangeableCategoryIds: string[];
  nonExchangeableProductIds: string[];
  policyText: string | null;
  updatedAt: string;
}

export interface ReturnReason {
  id: string;
  code: string;
  label: string;
  forReturn: boolean;
  forExchange: boolean;
  channel: ReturnChannel | null;
  companyFault: boolean;
  requiresMedia: boolean;
  isActive: boolean;
  sortOrder: number;
}

const base = (channel: ReturnChannel) => (channel === 'B2C' ? '/returns/customers' : '/returns/retailers');

export const returnsApi = {
  list: (channel: ReturnChannel, q: ReturnListQuery) => api.get<ReturnList>(base(channel), { params: pruneEmpty(q) }).then((r) => r.data),
  detail: (channel: ReturnChannel, id: string) => api.get<ReturnDetail>(`${base(channel)}/${id}`).then((r) => r.data),
  /** POST an action ("approve", "qc", "refund", ...) and get the refreshed request back. */
  act: (channel: ReturnChannel, id: string, action: string, body: Record<string, unknown> = {}) =>
    api.post<ReturnDetail>(`${base(channel)}/${id}/${action}`, body).then((r) => r.data),

  settings: () => api.get<Record<ReturnChannel, ReturnSettings>>('/return-settings').then((r) => r.data),
  updateSettings: (channel: ReturnChannel, body: Partial<ReturnSettings>) => api.patch<ReturnSettings>(`/return-settings/${channel}`, body).then((r) => r.data),
  reasons: () => api.get<ReturnReason[]>('/return-settings/reasons').then((r) => r.data),
  createReason: (body: Partial<ReturnReason>) => api.post<ReturnReason>('/return-settings/reasons', body).then((r) => r.data),
  updateReason: (id: string, body: Partial<ReturnReason>) => api.patch<ReturnReason>(`/return-settings/reasons/${id}`, body).then((r) => r.data),

  refundWallet: (customerId: string) =>
    api.get<{ balance: number; transactions: Array<{ id: string; amount: number; reason: string; note: string | null; createdAt: string }> }>(`/wallet/customers/${customerId}/refund-wallet`).then((r) => r.data),
  adjustRefundWallet: (customerId: string, amount: number, note: string) =>
    api.post(`/wallet/customers/${customerId}/refund-wallet/adjust`, { amount, note }).then((r) => r.data),
};
