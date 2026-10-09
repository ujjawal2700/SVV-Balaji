import { api } from './client';
import type { ServerCoupon, ServerCouponInput } from './checkout';
import type { Coupon, CreateCouponInput } from './types';

/**
 * Cart coupons, backed by the server (`/coupons`) - the same table checkout
 * validates against. (This used to keep coupons in the admin's localStorage,
 * so a coupon created in Admin never reached the storefront and every code
 * was rejected as "invalid or expired".)
 *
 * The admin screens speak the older `Coupon` shape; it is mapped here.
 */

/** The admin picks a date; the coupon works until the end of that day in India. */
const endOfDayIst = (date: string) => `${date}T23:59:59.999+05:30`;
const istDate = (iso: string) => new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 10);

function fromServer(c: ServerCoupon & { createdAt?: string; updatedAt?: string }): Coupon {
  return {
    id: c.id,
    code: c.code,
    title: c.title,
    description: c.description ?? '',
    discountType: c.type === 'PERCENT' ? 'PERCENTAGE' : 'FIXED',
    discountValue: Number(c.value),
    minOrderValue: Number(c.minOrderValue ?? 0),
    maxDiscount: c.maxDiscount !== null && c.maxDiscount !== undefined ? Number(c.maxDiscount) : undefined,
    targetAudience: c.audience,
    expiryDate: c.expiresAt ? istDate(c.expiresAt) : undefined,
    usageLimit: c.usageLimit ?? undefined,
    usedCount: c.usedCount,
    isActive: c.isActive,
    createdAt: c.createdAt ?? '',
    updatedAt: c.updatedAt ?? '',
  };
}

function toServer(input: Partial<CreateCouponInput>): Partial<ServerCouponInput> {
  const out: Partial<ServerCouponInput> = {};
  if (input.code !== undefined) out.code = input.code.trim().toUpperCase();
  if (input.title !== undefined) out.title = input.title.trim();
  if (input.description !== undefined) out.description = input.description.trim();
  if (input.discountType !== undefined) out.type = input.discountType === 'PERCENTAGE' ? 'PERCENT' : 'FIXED';
  if (input.discountValue !== undefined) out.value = Number(input.discountValue);
  if (input.minOrderValue !== undefined) out.minOrderValue = Number(input.minOrderValue ?? 0);
  if (input.maxDiscount !== undefined) out.maxDiscount = input.maxDiscount ? Number(input.maxDiscount) : null;
  if (input.targetAudience !== undefined) out.audience = input.targetAudience;
  if (input.expiryDate !== undefined) out.expiresAt = input.expiryDate ? endOfDayIst(input.expiryDate) : null;
  if (input.usageLimit !== undefined) out.usageLimit = input.usageLimit ? Number(input.usageLimit) : null;
  if (input.isActive !== undefined) out.isActive = input.isActive;
  return out;
}

export const couponsApi = {
  async list(includeInactive = true): Promise<Coupon[]> {
    const rows = (await api.get<ServerCoupon[]>('/coupons')).data.map(fromServer);
    return includeInactive ? rows : rows.filter((c) => c.isActive);
  },

  async create(input: CreateCouponInput): Promise<Coupon> {
    return fromServer((await api.post<ServerCoupon>('/coupons', toServer(input))).data);
  },

  async update(id: string, input: Partial<CreateCouponInput>): Promise<Coupon> {
    const { code: _code, ...rest } = input; // a code never changes once customers may hold it
    return fromServer((await api.patch<ServerCoupon>(`/coupons/${id}`, toServer(rest))).data);
  },

  setActive(id: string, isActive: boolean): Promise<Coupon> {
    return this.update(id, { isActive });
  },

  /** Refused by the server once the coupon has been used on an order - switch it off instead. */
  async remove(id: string): Promise<void> {
    await api.delete(`/coupons/${id}`);
  },

  /** Indicative only (cart before a quote); checkout's server quote is what is charged. */
  calculateDiscount(coupon: Coupon, orderSubtotal: number): number {
    if (!coupon.isActive) return 0;
    if (orderSubtotal < coupon.minOrderValue) return 0;

    if (coupon.discountType === 'FIXED') {
      return Math.min(coupon.discountValue, orderSubtotal);
    }

    const percentDiscount = Math.round((orderSubtotal * coupon.discountValue) / 100);
    if (coupon.maxDiscount && coupon.maxDiscount > 0) {
      return Math.min(percentDiscount, coupon.maxDiscount, orderSubtotal);
    }
    return Math.min(percentDiscount, orderSubtotal);
  },
};
