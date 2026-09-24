import { api } from './client';

/**
 * Storefront checkout, as the browser sees it. Note what is NOT in the request
 * types: no price, no tax, no fee, no delivery method. The server decides all
 * of them (see svv-balaji-backend/src/checkout/) and this app only displays them.
 */

export type FulfillmentMethod = 'LOCAL' | 'SHIPROCKET';
export type PaymentMode = 'ONLINE' | 'COD' | 'CREDIT';

export interface Address {
  id: string;
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  latitude: string | null;
  longitude: string | null;
  isDefault: boolean;
}

export interface AddressInput {
  label?: string;
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  latitude?: number;
  longitude?: number;
  isDefault?: boolean;
}

export interface CheckoutRequest {
  addressId: string;
  items: Array<{ productId: string; quantity: number }>;
  couponCode?: string;
  /** Loyalty points to spend - or, in wallet COMBINED mode, the total wallet coins to spend. */
  redeemPoints?: number;
  /** Referral coins to spend. Only meaningful in wallet SEPARATE mode. */
  redeemReferralPoints?: number;
  paymentMode?: PaymentMode;
  /** The total the customer was shown - the server only compares it to notice a price change. */
  expectedTotal?: number;
}

export interface Quote {
  channel: 'B2B' | 'B2C';
  fulfillment: {
    method: FulfillmentMethod;
    nodeId: string;
    nodeName: string;
    nodeKind: string;
    distanceKm: number | null;
    etaMin: string;
    etaMax: string;
    etaLabel: string;
    reason: string;
  };
  lines: Array<{
    productId: string; name: string; sku: string; image: string | null;
    quantity: number; unitPrice: number; gstRatePercent: number;
    gross: number; discount: number; taxable: number; tax: number; total: number;
  }>;
  totals: {
    subtotal: number; couponDiscount: number; loyaltyDiscount: number; referralDiscount: number; discount: number;
    taxable: number; tax: number; deliveryFee: number; totalPayable: number;
  };
  coupon: { code: string; discount: number } | null;
  loyalty: { enabled: boolean; balance: number; pointValueInr: number; redeemPoints: number; maxPoints: number; minPoints: number };
  referral: { enabled: boolean; balance: number; pointValueInr: number; redeemPoints: number; maxPoints: number; minPoints: number };
  wallet: {
    mode: 'SEPARATE' | 'COMBINED';
    combined: {
      enabled: boolean; balance: number; pointValueInr: number;
      maxPoints: number; minPoints: number; redeemPoints: number;
    } | null;
  };
  payment: { mode: PaymentMode; allowedModes: PaymentMode[]; codUnavailableReason: string | null; creditUnavailableReason: string | null };
}

export interface CheckoutSession {
  sessionId: string;
  expiresAt: string;
  quote: Quote;
  payment: {
    mode: PaymentMode;
    amount: number;
    requiresPayment: boolean;
    gateway: { provider: 'mock' | 'razorpay'; keyId?: string; gatewayOrderId: string; amount: number; currency: string } | null;
  };
}

export interface PlacedOrder {
  orderId: string;
  orderNumber: string;
  alreadyPlaced: boolean;
}

export interface OfferCoupon {
  code: string;
  title: string;
  description: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  minOrderValue: number;
  maxDiscount: number | null;
  expiresAt: string | null;
}

export interface OrderLine {
  productId: string;
  name: string | null;
  imageUrl: string | null;
  unit: string;
  mrp: number | null;
  quantity: number;
  unitPrice: number;
  /** False when the product has since been taken off sale - it can't be reordered. */
  available: boolean;
}

export interface ProductReview {
  rating: number;
  comment: string | null;
}

export interface OrderSummaryRow {
  orderNumber: string;
  status: string;
  placedAt: string;
  deliveredAt: string | null;
  total: number;
  fulfillmentMethod: FulfillmentMethod | null;
  nodeName: string;
  itemCount: number;
  items: Array<string | null>;
  lines: OrderLine[];
  /** Delivered, and at least one product in it hasn't been rated yet. */
  reviewPending: boolean;
}

export interface OrderDetail {
  orderNumber: string;
  status: string;
  channel: 'B2B' | 'B2C';
  placedAt: string;
  deliveredAt: string | null;
  fulfillment: { method: FulfillmentMethod | null; nodeName: string; nodeCity: string | null; distanceKm: number | null; etaMin: string | null; etaMax: string | null; etaLabel: string | null };
  address: { fullName: string; phone: string; line1: string; line2: string | null; landmark: string | null; city: string; state: string; pincode: string };
  items: Array<{ productId: string; name: string | null; sku: string | null; imageUrl?: string | null; mrp: number | null; unit: string; available: boolean; quantity: number; unitPrice: number; gstRatePercent: number; discount: number; total: number; review: ProductReview | null }>;
  totals: {
    subtotal: number; discount: number; couponCode: string | null;
    loyaltyRedeemedPoints: number; loyaltyRedeemedInr: number;
    referralRedeemedPoints: number; referralRedeemedInr: number;
    tax: number; deliveryFee: number; total: number;
  };
  payment: { mode: PaymentMode | null; status: string; reference: string | null };
  deliveryOtp: string | null;
  rider: { name: string | null; phone: string | null } | null;
  shipment: { awb: string | null; courier: string | null; trackingUrl: string | null; status: string } | null;
  timeline: Array<{ type: string; at: string; note: string | null }>;
}

export const checkoutApi = {
  addresses: () => api.get<Address[]>('/storefront/addresses').then((r) => r.data),
  createAddress: (input: AddressInput) => api.post<Address>('/storefront/addresses', input).then((r) => r.data),
  updateAddress: (id: string, input: Partial<AddressInput>) => api.patch<Address>(`/storefront/addresses/${id}`, input).then((r) => r.data),
  deleteAddress: (id: string) => api.delete(`/storefront/addresses/${id}`).then((r) => r.data),

  quote: (req: CheckoutRequest) => api.post<Quote>('/storefront/checkout/quote', req).then((r) => r.data),
  start: (req: CheckoutRequest) => api.post<CheckoutSession>('/storefront/checkout/sessions', req).then((r) => r.data),
  confirm: (sessionId: string, body: { gatewayPaymentId?: string; signature?: string }) =>
    api.post<PlacedOrder>(`/storefront/checkout/sessions/${sessionId}/confirm`, body).then((r) => r.data),
  abort: (sessionId: string) => api.post(`/storefront/checkout/sessions/${sessionId}/abort`).then((r) => r.data),

  coupons: () => api.get<OfferCoupon[]>('/storefront/coupons').then((r) => r.data),
  orders: () => api.get<OrderSummaryRow[]>('/storefront/orders').then((r) => r.data),
  order: (orderNumber: string) => api.get<OrderDetail>(`/storefront/orders/${encodeURIComponent(orderNumber)}`).then((r) => r.data),
  reviewProduct: (orderNumber: string, body: { productId: string; rating: number; comment?: string }) =>
    api
      .post<{ productId: string } & ProductReview>(`/storefront/orders/${encodeURIComponent(orderNumber)}/reviews`, body)
      .then((r) => r.data),
};

/** The server's error, in a form the UI can branch on (`code`) and show (`message`). */
export function checkoutError(error: unknown): { code?: string; message: string; quote?: Quote } {
  const data = (error as { response?: { data?: { code?: string; message?: string | string[]; quote?: Quote } } })?.response?.data;
  const message = Array.isArray(data?.message) ? data?.message.join('. ') : data?.message;
  return { code: data?.code, message: message ?? (error instanceof Error ? error.message : 'Something went wrong'), quote: data?.quote };
}
