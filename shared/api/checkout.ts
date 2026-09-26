import { api } from './client';

/** Super Admin side of checkout & fulfilment: rules, coupons, packing/dispatch actions, live-order catch-up. */

export interface CheckoutSettings {
  id: string;
  localRadiusKm: string;
  centralWarehouseId: string | null;
  localBaseFee: string;
  localFreeAbove: string | null;
  shipBaseFee: string;
  shipFreeAbove: string | null;
  b2bBaseFee: string;
  b2bFreeAbove: string | null;
  prepMinutes: number;
  minutesPerKm: number;
  shipMinDays: number;
  shipMaxDays: number;
  codEnabled: boolean;
  codMaxAmount: string | null;
  reservationTtlMinutes: number;
  deliveryOtpDigits: number;
  /** B2B credit: the day "Net N days" counts from. */
  creditPeriodStart: 'DISPATCH' | 'ORDER_DATE';
}

export type UpdateCheckoutSettingsInput = Partial<{
  localRadiusKm: number;
  centralWarehouseId: string | null;
  localBaseFee: number;
  localFreeAbove: number | null;
  shipBaseFee: number;
  shipFreeAbove: number | null;
  b2bBaseFee: number;
  b2bFreeAbove: number | null;
  prepMinutes: number;
  minutesPerKm: number;
  shipMinDays: number;
  shipMaxDays: number;
  codEnabled: boolean;
  codMaxAmount: number | null;
  reservationTtlMinutes: number;
  deliveryOtpDigits: number;
  creditPeriodStart: 'DISPATCH' | 'ORDER_DATE';
}>;

export interface ServerCoupon {
  id: string;
  code: string;
  title: string;
  description: string;
  type: 'PERCENT' | 'FIXED';
  value: string;
  minOrderValue: string;
  maxDiscount: string | null;
  audience: 'ALL' | 'B2C' | 'B2B';
  validFrom: string | null;
  expiresAt: string | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  usedCount: number;
  isActive: boolean;
}

export interface ServerCouponInput {
  code?: string;
  title: string;
  description?: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  minOrderValue?: number;
  maxDiscount?: number | null;
  audience?: string;
  validFrom?: string | null;
  expiresAt?: string | null;
  usageLimit?: number | null;
  perCustomerLimit?: number | null;
  isActive?: boolean;
}

export interface PickPlanRow {
  allocationId: string;
  product: string;
  sku: string;
  fgBatchNumber: string;
  expiryDate: string | null;
  quantity: number;
  scanned: boolean;
}

export interface StartPackingResult {
  status: string;
  complete: boolean;
  shortfalls: Array<{ productName: string; short: number }>;
  plan: PickPlanRow[];
}

export interface ScanResult {
  scanned: string;
  remaining: number;
  packed: boolean;
  plan: PickPlanRow[];
}

/** One row of the live orders feed (socket event and reconciliation share this shape). */
export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  channel: 'B2B' | 'B2C';
  source: 'STAFF' | 'STOREFRONT';
  customerName: string;
  customerCode: string;
  total: number;
  paymentStatus: string;
  paymentMode: string | null;
  fulfillmentMethod: 'LOCAL' | 'SHIPROCKET' | null;
  nodeId: string;
  nodeName: string;
  branchId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderSyncResult {
  serverTime: string;
  hasMore: boolean;
  orders: OrderSummary[];
}

export const checkoutAdminApi = {
  settings: () => api.get<CheckoutSettings>('/checkout-settings').then((r) => r.data),
  updateSettings: (input: UpdateCheckoutSettingsInput) => api.patch<CheckoutSettings>('/checkout-settings', input).then((r) => r.data),

  coupons: () => api.get<ServerCoupon[]>('/coupons').then((r) => r.data),
  createCoupon: (input: ServerCouponInput) => api.post<ServerCoupon>('/coupons', input).then((r) => r.data),
  updateCoupon: (id: string, input: Partial<ServerCouponInput>) => api.patch<ServerCoupon>(`/coupons/${id}`, input).then((r) => r.data),

  pickPlan: (orderId: string) => api.get<PickPlanRow[]>(`/orders/${orderId}/pick-plan`).then((r) => r.data),
  startPacking: (orderId: string) => api.post<StartPackingResult>(`/orders/${orderId}/start-packing`).then((r) => r.data),
  scan: (orderId: string, code: string) => api.post<ScanResult>(`/orders/${orderId}/scan`, { code }).then((r) => r.data),
  assignRider: (orderId: string, riderName: string, riderPhone: string) =>
    api.post(`/orders/${orderId}/assign-rider`, { riderName, riderPhone }).then((r) => r.data),
  ship: (orderId: string) => api.post(`/orders/${orderId}/ship`).then((r) => r.data),
  verifyOtp: (orderId: string, otp: string) => api.post<{ delivered: boolean }>(`/orders/${orderId}/verify-otp`, { otp }).then((r) => r.data),

  syncSince: (since: string) => api.get<OrderSyncResult>('/orders-sync', { params: { since } }).then((r) => r.data),
  pushKey: () => api.get<{ publicKey: string | null }>('/notifications/push/key').then((r) => r.data),
  pushSubscribe: (sub: { endpoint: string; p256dh: string; auth: string }) => api.post('/notifications/push/subscribe', sub).then((r) => r.data),
};
