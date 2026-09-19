import type {
  CreateProductInput,
  LivePriceRule,
  PriceTierInput,
  Product,
  ProductVariantInput,
} from '@shared/api/types';

export const UNITS = ['KG', 'GRAM', 'LITRE', 'ML', 'PACK', 'PIECE', 'BOX', 'BAG'];

/** Fallback GST the pricing engine itself defaults to. */
export const DEFAULT_GST = 5;

/**
 * A tier row while it is being typed - either half can still be empty.
 * `unitPrice` is "the figure the operator types": a per-unit price normally, or
 * the TOTAL for `minQuantity` units when the product's tiers are entered as
 * totals (ProductFormValues.b2bTiersAreTotals).
 */
export interface TierRow {
  minQuantity?: number | null;
  unitPrice?: number | null;
}

/** The per-unit price a typed tier figure works out to. */
export function perUnitOf(row: TierRow, totals: boolean): number | null {
  if (typeof row?.unitPrice !== 'number') return null;
  if (!totals) return row.unitPrice;
  if (typeof row.minQuantity !== 'number' || row.minQuantity <= 0) return null;
  return round2(row.unitPrice / row.minQuantity);
}

/**
 * Discount vs MRP, 2dp, on the storefront's basis: MRP is GST-inclusive, so it is
 * compared with the per-unit price INCLUDING GST (577.50 vs 699 = 17.38%).
 * `perUnitExclGst` is what the engine stores; GST is added here.
 */
export function tierDiscount(
  mrp: number | null | undefined,
  perUnitExclGst: number | null,
  gst: number,
): number | null {
  if (!mrp || mrp <= 0 || perUnitExclGst === null) return null;
  const incl = round2(perUnitExclGst * (1 + gst / 100));
  return Math.max(0, Math.round(((mrp - incl) / mrp) * 10000) / 100);
}

export interface VariantFormRow {
  /** Present once the variant exists server-side; absent on a row not yet saved. */
  id?: string;
  name?: string;
  sku?: string;
  unit?: string;
  mrp?: number | null;
  images: string[];
  isActive: boolean;
  b2cPrice?: number | null;
  b2bTiers: TierRow[];
}

/**
 * The shape the antd Form holds. Deliberately flatter and looser than
 * `CreateProductInput`: every list is an array a Form.List can drive, numbers
 * may be null while an InputNumber is empty, and `mainCategoryId` exists only
 * because the screen asks for a category and a subcategory separately while the
 * API stores one `categoryId`.
 */
export interface ProductFormValues {
  // Basics
  name?: string;
  brand?: string;
  sku?: string;
  unit: string;
  packLabel?: string;
  badge?: string;
  description?: string;
  mainCategoryId?: string;
  categoryId?: string;
  highlights: string[];
  showOnStorefront: boolean;
  isTopPick: boolean;
  isDailyStaple: boolean;

  // Pricing (prices are EXCLUSIVE of GST - the order engine adds tax on top)
  mrp?: number | null;
  gstRatePercent: number;
  hsnCode?: string;
  b2cPrice?: number | null;
  b2bTiers: TierRow[];
  /** true = each tier is typed as the TOTAL for its quantity; the per-unit price is derived. */
  b2bTiersAreTotals: boolean;

  // Order limits + retailer panel
  minOrderQuantity?: number | null;
  maxOrderQuantity?: number | null;
  moqB2B?: number | null;
  maxOrderQuantityB2B?: number | null;
  packBoxSize?: number | null;
  bulkAvailable: boolean;
  gstInvoiceAvailable: boolean;
  businessSupportContact?: string;
  deliveryTerms?: string;

  // Media & SEO
  images: string[];
  slug?: string;
  metaTitle?: string;
  metaDescription?: string;

  // Product information
  manufacturer?: string;
  countryOfOrigin?: string;
  shelfLife?: string;
  returnPolicy?: string;
  warranty?: string;
  disclaimer?: string;
  rating?: number | null;
  reviewCount?: number | null;
  specifications: Array<{ label?: string; value?: string }>;
  faqs: Array<{ question?: string; answer?: string }>;
  offers: Array<{ title?: string; description?: string }>;

  // Inventory thresholds
  reorderPoint?: number | null;
  safetyStock?: number | null;
  allowBackorder: boolean;

  variants: VariantFormRow[];
}

export const EMPTY_FORM: ProductFormValues = {
  unit: 'KG',
  highlights: [],
  // Draft by default: a product with no price or copy yet must not appear to
  // shoppers the moment it is created.
  showOnStorefront: false,
  isTopPick: false,
  isDailyStaple: false,
  gstRatePercent: DEFAULT_GST,
  b2bTiers: [],
  b2bTiersAreTotals: false,
  bulkAvailable: false,
  gstInvoiceAvailable: true,
  images: [],
  specifications: [],
  faqs: [],
  offers: [],
  reorderPoint: 0,
  safetyStock: 0,
  allowBackorder: false,
  variants: [],
};

// --- price arithmetic -------------------------------------------------------

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Exclusive price -> what a shopper reads. Same rounding the storefront API applies. */
export const inclusiveOf = (exclusive: number, gst: number) => round2(exclusive * (1 + gst / 100));

/** MRP is a GST-inclusive figure, so a discount is measured against the inclusive price. */
export function discountPercent(mrp: number | null | undefined, exclusive: number | null | undefined, gst: number) {
  if (!mrp || exclusive === null || exclusive === undefined || mrp <= 0) return null;
  const incl = inclusiveOf(exclusive, gst);
  if (incl >= mrp) return 0;
  return Math.round(((mrp - incl) / mrp) * 100);
}

/**
 * The 1-9 / 10-49 / 50-99 / 100+ ladder the storefront used to compute on the
 * fly, as a starting point an operator can then edit. Shares are of MRP; each
 * result is converted to the exclusive base the engine stores.
 */
export const LADDER_SHARES: Array<[number, number]> = [
  [1, 0.9],
  [10, 0.8],
  [50, 0.72],
  [100, 0.65],
];

export function ladderFromMrp(mrp: number, gst: number, totals = false): TierRow[] {
  return LADDER_SHARES.map(([minQuantity, share]) => {
    const perUnit = round2(Math.round(mrp * share) / (1 + gst / 100));
    return { minQuantity, unitPrice: totals ? round2(perUnit * minQuantity) : perUnit };
  });
}

// --- API -> form ------------------------------------------------------------

const num = (value: string | number | null | undefined): number | null =>
  value === null || value === undefined || value === '' ? null : Number(value);

/** Channel-wide rules only - customer-type rates belong to the Price Lists screen. */
const channelWide = (rules: LivePriceRule[] | undefined) =>
  (rules ?? []).filter((r) => r.customerType === null);

function tiersFrom(rules: LivePriceRule[] | undefined, totals: boolean): TierRow[] {
  return channelWide(rules)
    .map((r) => ({
      minQuantity: r.minQuantity,
      // Show back exactly what was typed: the stored total, not total/qty x qty.
      unitPrice: totals ? (r.tierTotal ?? round2(r.unitPrice * r.minQuantity)) : r.unitPrice,
    }))
    .sort((a, b) => a.minQuantity - b.minQuantity);
}

function b2cFrom(rules: LivePriceRule[] | undefined): number | null {
  const single = channelWide(rules).find((r) => r.minQuantity === 1);
  return single ? single.unitPrice : null;
}

export function productToFormValues(product: Product): ProductFormValues {
  const category = product.category;
  // A leaf category reports its parent; a top-level one is its own "main".
  const mainCategoryId = category?.parent?.id ?? category?.id;

  const live = product.pricing;
  const gst =
    channelWide(live?.B2C)[0]?.gstRatePercent ?? channelWide(live?.B2B)[0]?.gstRatePercent ?? DEFAULT_GST;

  return {
    name: product.name,
    brand: product.brand ?? undefined,
    sku: product.sku,
    unit: product.unit,
    packLabel: product.packLabel ?? undefined,
    badge: product.badge ?? undefined,
    description: product.description ?? undefined,
    mainCategoryId,
    categoryId: product.categoryId ?? undefined,
    highlights: product.highlights ?? [],
    showOnStorefront: product.showOnStorefront,
    isTopPick: product.isTopPick,
    isDailyStaple: product.isDailyStaple,

    mrp: num(product.mrp),
    gstRatePercent: gst,
    hsnCode: product.hsnCode ?? undefined,
    b2cPrice: b2cFrom(live?.B2C),
    b2bTiers: tiersFrom(live?.B2B, product.b2bTiersAreTotals),
    b2bTiersAreTotals: product.b2bTiersAreTotals,

    minOrderQuantity: product.minOrderQuantity,
    maxOrderQuantity: product.maxOrderQuantity,
    moqB2B: product.moqB2B,
    maxOrderQuantityB2B: product.maxOrderQuantityB2B,
    packBoxSize: product.packBoxSize,
    bulkAvailable: product.bulkAvailable,
    gstInvoiceAvailable: product.gstInvoiceAvailable,
    businessSupportContact: product.businessSupportContact ?? undefined,
    deliveryTerms: product.deliveryTerms ?? undefined,

    images: product.images ?? [],
    slug: product.slug ?? undefined,
    metaTitle: product.metaTitle ?? undefined,
    metaDescription: product.metaDescription ?? undefined,

    manufacturer: product.manufacturer ?? undefined,
    countryOfOrigin: product.countryOfOrigin ?? undefined,
    shelfLife: product.shelfLife ?? undefined,
    returnPolicy: product.returnPolicy ?? undefined,
    warranty: product.warranty ?? undefined,
    disclaimer: product.disclaimer ?? undefined,
    rating: num(product.rating),
    reviewCount: product.reviewCount,
    specifications: (product.specifications ?? []).map((s) => ({ label: s.label, value: s.value })),
    faqs: (product.faqs ?? []).map((f) => ({ question: f.question, answer: f.answer })),
    offers: (product.offers ?? []).map((o) => ({ title: o.title, description: o.description })),

    reorderPoint: product.reorderPoint,
    safetyStock: product.safetyStock,
    allowBackorder: product.allowBackorder,

    variants: (product.variants ?? []).map((v) => {
      const own = live?.variants.find((lv) => lv.id === v.id);
      return {
        id: v.id,
        name: v.name,
        sku: v.sku,
        unit: v.unit ?? undefined,
        mrp: num(v.mrp),
        images: v.images ?? [],
        isActive: v.isActive,
        b2cPrice: b2cFrom(own?.B2C),
        b2bTiers: tiersFrom(own?.B2B, product.b2bTiersAreTotals),
      };
    }),
  };
}

// --- form -> API ------------------------------------------------------------

const clean = (s: string | undefined | null) => (s ?? '').trim();

/** Drops half-typed tier rows and sorts by break, so the server always gets a clean ascending ladder. */
export function cleanTiers(rows: TierRow[] | undefined, totals = false): PriceTierInput[] {
  return (rows ?? [])
    .filter(
      (r): r is { minQuantity: number; unitPrice: number } =>
        typeof r?.minQuantity === 'number' && typeof r?.unitPrice === 'number',
    )
    .map((r) => ({
      minQuantity: Math.trunc(r.minQuantity),
      ...(totals ? { totalPrice: round2(r.unitPrice) } : { unitPrice: round2(r.unitPrice) }),
    }))
    .sort((a, b) => a.minQuantity - b.minQuantity);
}

/**
 * The whole form as one API payload.
 *
 * Lists (highlights, specs, FAQs, offers, variants, price tiers) are always
 * sent - even empty - because the server treats a present list as
 * authoritative. Omitting an emptied list would leave the old rows behind, and
 * "I deleted every FAQ but they came back" is exactly the failure a Super Admin
 * cannot diagnose from the screen.
 */
export function formValuesToPayload(values: ProductFormValues): CreateProductInput {
  const variants: ProductVariantInput[] = (values.variants ?? []).map((v) => ({
    ...(v.id ? { id: v.id } : {}),
    name: clean(v.name),
    sku: clean(v.sku).toUpperCase(),
    unit: clean(v.unit) || undefined,
    mrp: typeof v.mrp === 'number' ? v.mrp : undefined,
    images: (v.images ?? []).filter(Boolean),
    isActive: v.isActive ?? true,
    pricing: {
      ...(typeof v.b2cPrice === 'number' ? { b2cPrice: round2(v.b2cPrice) } : {}),
      b2bTiers: cleanTiers(v.b2bTiers, values.b2bTiersAreTotals),
    },
  }));

  const opt = (n: number | null | undefined) => (typeof n === 'number' ? n : undefined);

  return {
    name: clean(values.name),
    sku: clean(values.sku).toUpperCase(),
    unit: clean(values.unit),
    // A subcategory wins; otherwise the main category is the product's home.
    categoryId: values.categoryId || values.mainCategoryId || undefined,
    description: clean(values.description),
    images: (values.images ?? []).filter(Boolean),
    showOnStorefront: values.showOnStorefront,
    slug: clean(values.slug) || undefined,
    metaTitle: clean(values.metaTitle),
    metaDescription: clean(values.metaDescription),
    reorderPoint: opt(values.reorderPoint),
    safetyStock: opt(values.safetyStock),
    allowBackorder: values.allowBackorder,

    brand: clean(values.brand),
    packLabel: clean(values.packLabel),
    mrp: opt(values.mrp),
    badge: clean(values.badge),
    hsnCode: clean(values.hsnCode),
    rating: opt(values.rating),
    reviewCount: opt(values.reviewCount),
    highlights: (values.highlights ?? []).map(clean).filter(Boolean),
    manufacturer: clean(values.manufacturer),
    countryOfOrigin: clean(values.countryOfOrigin),
    shelfLife: clean(values.shelfLife),
    disclaimer: clean(values.disclaimer),
    returnPolicy: clean(values.returnPolicy),
    warranty: clean(values.warranty),
    minOrderQuantity: opt(values.minOrderQuantity),
    maxOrderQuantity: opt(values.maxOrderQuantity),
    moqB2B: opt(values.moqB2B),
    maxOrderQuantityB2B: opt(values.maxOrderQuantityB2B),
    packBoxSize: opt(values.packBoxSize),
    bulkAvailable: values.bulkAvailable,
    gstInvoiceAvailable: values.gstInvoiceAvailable,
    businessSupportContact: clean(values.businessSupportContact),
    deliveryTerms: clean(values.deliveryTerms),
    isTopPick: values.isTopPick,
    isDailyStaple: values.isDailyStaple,
    b2bTiersAreTotals: values.b2bTiersAreTotals,

    specifications: (values.specifications ?? [])
      .map((s) => ({ label: clean(s.label), value: clean(s.value) }))
      .filter((s) => s.label && s.value),
    faqs: (values.faqs ?? [])
      .map((f) => ({ question: clean(f.question), answer: clean(f.answer) }))
      .filter((f) => f.question && f.answer),
    offers: (values.offers ?? [])
      .map((o) => ({ title: clean(o.title), description: clean(o.description) }))
      .filter((o) => o.title && o.description),

    variants,

    pricing: {
      gstRatePercent: values.gstRatePercent ?? DEFAULT_GST,
      // Blank B2C price = "leave what is live alone", not "close it".
      ...(typeof values.b2cPrice === 'number' ? { b2cPrice: round2(values.b2cPrice) } : {}),
      b2bTiers: cleanTiers(values.b2bTiers, values.b2bTiersAreTotals),
    },
  };
}

/** First form-field name segment -> the tab that owns it, so a validation error can switch tabs. */
export const FIELD_TAB: Record<string, string> = {
  name: 'basic', brand: 'basic', sku: 'basic', unit: 'basic', packLabel: 'basic', badge: 'basic',
  description: 'basic', mainCategoryId: 'basic', categoryId: 'basic', highlights: 'basic',
  showOnStorefront: 'basic', isTopPick: 'basic', isDailyStaple: 'basic',

  mrp: 'pricing', gstRatePercent: 'pricing', hsnCode: 'pricing', b2cPrice: 'pricing',
  b2bTiers: 'pricing', b2bTiersAreTotals: 'pricing', minOrderQuantity: 'pricing', maxOrderQuantity: 'pricing', moqB2B: 'pricing',
  maxOrderQuantityB2B: 'pricing', packBoxSize: 'pricing', bulkAvailable: 'pricing',
  gstInvoiceAvailable: 'pricing', businessSupportContact: 'pricing', deliveryTerms: 'pricing',

  images: 'media', slug: 'media', metaTitle: 'media', metaDescription: 'media',

  manufacturer: 'info', countryOfOrigin: 'info', shelfLife: 'info', returnPolicy: 'info',
  warranty: 'info', disclaimer: 'info', rating: 'info', reviewCount: 'info', specifications: 'info',

  offers: 'offers', faqs: 'offers',

  reorderPoint: 'inventory', safetyStock: 'inventory', allowBackorder: 'inventory',

  variants: 'variants',
};
