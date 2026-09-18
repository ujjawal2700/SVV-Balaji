import type { Coupon, CreateCouponInput } from './types';

const STORAGE_KEY = 'svv_balaji_coupons_v1';

const INITIAL_COUPONS: Coupon[] = [
  {
    id: 'cpn-1',
    code: 'BALAJI50',
    title: 'Super Saver Discount',
    description: 'Flat ₹50 OFF on orders above ₹499',
    discountType: 'FIXED',
    discountValue: 50,
    minOrderValue: 499,
    targetAudience: 'ALL',
    expiryDate: '2026-12-31',
    usageLimit: 1000,
    usedCount: 142,
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'cpn-2',
    code: 'WELCOME100',
    title: 'Welcome First Order',
    description: 'Flat ₹100 OFF on your cart above ₹799',
    discountType: 'FIXED',
    discountValue: 100,
    minOrderValue: 799,
    targetAudience: 'B2C',
    expiryDate: '2026-11-30',
    usageLimit: 500,
    usedCount: 89,
    isActive: true,
    createdAt: '2026-09-05T00:00:00.000Z',
    updatedAt: '2026-09-05T00:00:00.000Z',
  },
  {
    id: 'cpn-3',
    code: 'FARM10',
    title: 'Farm Fresh 10% Off',
    description: '10% instant discount up to ₹250 on orders above ₹999',
    discountType: 'PERCENTAGE',
    discountValue: 10,
    minOrderValue: 999,
    maxDiscount: 250,
    targetAudience: 'ALL',
    expiryDate: '2026-10-31',
    usageLimit: 2000,
    usedCount: 310,
    isActive: true,
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
  },
  {
    id: 'cpn-4',
    code: 'BULK200',
    title: 'B2B Wholesale Saver',
    description: 'Flat ₹200 OFF on wholesale orders above ₹2,500',
    discountType: 'FIXED',
    discountValue: 200,
    minOrderValue: 2500,
    targetAudience: 'B2B',
    expiryDate: '2026-12-31',
    usageLimit: 500,
    usedCount: 45,
    isActive: true,
    createdAt: '2026-09-12T00:00:00.000Z',
    updatedAt: '2026-09-12T00:00:00.000Z',
  },
];

function loadStoredCoupons(): Coupon[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // Ignore JSON error and return defaults
  }
  return INITIAL_COUPONS;
}

function persistCoupons(coupons: Coupon[]): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(coupons));
      // Dispatch storage event for same-window updates
      window.dispatchEvent(new Event('coupons_updated'));
    }
  } catch {
    // Ignore error
  }
}

export const couponsApi = {
  list(includeInactive = true): Coupon[] {
    const all = loadStoredCoupons();
    if (includeInactive) return all;
    return all.filter((c) => c.isActive);
  },

  get(id: string): Coupon | undefined {
    return loadStoredCoupons().find((c) => c.id === id);
  },

  getByCode(code: string): Coupon | undefined {
    const normalized = code.trim().toUpperCase();
    return loadStoredCoupons().find((c) => c.code.toUpperCase() === normalized);
  },

  create(input: CreateCouponInput): Coupon {
    const all = loadStoredCoupons();
    const code = input.code.trim().toUpperCase();

    if (all.some((c) => c.code.toUpperCase() === code)) {
      throw new Error(`Coupon code "${code}" already exists.`);
    }

    const newCoupon: Coupon = {
      id: `cpn-${Date.now()}`,
      code,
      title: input.title.trim(),
      description: input.description.trim(),
      discountType: input.discountType,
      discountValue: Number(input.discountValue),
      minOrderValue: Number(input.minOrderValue || 0),
      maxDiscount: input.maxDiscount ? Number(input.maxDiscount) : undefined,
      targetAudience: input.targetAudience || 'ALL',
      expiryDate: input.expiryDate,
      usageLimit: input.usageLimit ? Number(input.usageLimit) : undefined,
      usedCount: 0,
      isActive: input.isActive ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updated = [newCoupon, ...all];
    persistCoupons(updated);
    return newCoupon;
  },

  update(id: string, input: Partial<CreateCouponInput>): Coupon {
    const all = loadStoredCoupons();
    const index = all.findIndex((c) => c.id === id);
    if (index === -1) {
      throw new Error('Coupon not found');
    }

    const existing = all[index];
    const code = input.code ? input.code.trim().toUpperCase() : existing.code;

    if (all.some((c) => c.id !== id && c.code.toUpperCase() === code)) {
      throw new Error(`Coupon code "${code}" is already in use.`);
    }

    const updatedCoupon: Coupon = {
      ...existing,
      code,
      title: input.title !== undefined ? input.title.trim() : existing.title,
      description: input.description !== undefined ? input.description.trim() : existing.description,
      discountType: input.discountType ?? existing.discountType,
      discountValue: input.discountValue !== undefined ? Number(input.discountValue) : existing.discountValue,
      minOrderValue: input.minOrderValue !== undefined ? Number(input.minOrderValue) : existing.minOrderValue,
      maxDiscount: input.maxDiscount !== undefined ? (input.maxDiscount ? Number(input.maxDiscount) : undefined) : existing.maxDiscount,
      targetAudience: input.targetAudience ?? existing.targetAudience,
      expiryDate: input.expiryDate !== undefined ? input.expiryDate : existing.expiryDate,
      usageLimit: input.usageLimit !== undefined ? (input.usageLimit ? Number(input.usageLimit) : undefined) : existing.usageLimit,
      isActive: input.isActive ?? existing.isActive,
      updatedAt: new Date().toISOString(),
    };

    all[index] = updatedCoupon;
    persistCoupons(all);
    return updatedCoupon;
  },

  setActive(id: string, isActive: boolean): Coupon {
    return this.update(id, { isActive });
  },

  remove(id: string): void {
    const all = loadStoredCoupons().filter((c) => c.id !== id);
    persistCoupons(all);
  },

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
