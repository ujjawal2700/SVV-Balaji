import { Injectable } from '@nestjs/common';
import { CustomerType, SalesChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';

/** Quantity breaks the retailer tier table is drawn from, when staff defined them. */
export interface PriceTier {
  minQuantity: number;
  maxQuantity: number | null;
  /** Exclusive of GST - the figure the order engine bills against. */
  unitPrice: number;
  /** What a shopper reads: `unitPrice` plus GST, rounded once, here. */
  unitPriceInclGst: number;
  gstRatePercent: number;
  /** The total the tier was entered as ("5 packs for 2750"), or null when entered per unit. */
  tierTotal: number | null;
  /**
   * Effective per-unit price against MRP, 2dp. Null when there is no MRP.
   * Like for like: MRP is a GST-INCLUSIVE figure, so it is compared with the
   * per-unit price INCLUDING GST (577.50 vs 699 = 17.38%), never with the
   * exclusive base. Kept in one function so the basis lives in one place.
   */
  discountPercent: number | null;
}

/**
 * (mrp - perUnit incl. GST) / mrp as a percentage to 2dp, never negative.
 * `perUnitExclGst` is what is stored; GST is added here, once.
 */
export function tierDiscountPercent(
  mrp: number | null,
  perUnitExclGst: number,
  gstRatePercent: number,
): number | null {
  if (mrp === null || mrp <= 0) return null;
  const perUnitInclGst = inclusiveOf(perUnitExclGst, gstRatePercent);
  return Math.max(0, Math.round(((mrp - perUnitInclGst) / mrp) * 10000) / 100);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Stored prices are GST-exclusive (that is what SalesService adds tax on top
 * of), but the storefront shows GST-inclusive ones. The conversion lives here,
 * once, so every screen shows the same rounded figure instead of each
 * re-deriving it and drifting by a paisa.
 */
export const inclusiveOf = (unitPrice: number, gstRatePercent: number) =>
  round2(unitPrice * (1 + gstRatePercent / 100));

/**
 * The read-only surface a shopper needs before they are signed in: what can be
 * bought, at what price for their channel, and whether it is actually in
 * stock. Every staff catalogue/price/stock endpoint in this codebase sits
 * behind JwtAuthGuard - this is the first one that does not, so it is
 * deliberately thin: it exposes nothing beyond what a product page needs, and
 * only for products staff have marked `showOnStorefront`.
 */
@Injectable()
export class StorefrontCatalogueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  async listProducts(params: {
    channel: SalesChannel;
    customerType?: CustomerType;
    categorySlug?: string;
    /** Only products pinned to the "Popular Products" / Top Picks shelf. */
    topPick?: boolean;
    /** Only products pinned to the "Best of the Basics" shelf. */
    dailyStaple?: boolean;
    limit?: number;
  }) {
    const products = await this.prisma.product.findMany({
      take: params.limit,
      where: {
        isActive: true,
        showOnStorefront: true,
        ...(params.topPick ? { isTopPick: true } : {}),
        ...(params.dailyStaple ? { isDailyStaple: true } : {}),
        // Matches a parent category as well as a leaf: a shopper opening
        // "Atta & Flour" expects everything filed under its subcategories
        // too, not an empty page because each product sits on a child.
        ...(params.categorySlug
          ? {
              category: {
                OR: [
                  { slug: params.categorySlug },
                  { parent: { slug: params.categorySlug } },
                ],
              },
            }
          : {}),
      },
      include: { category: { select: { id: true, name: true, slug: true } } },
      orderBy: { name: 'asc' },
    });

    return Promise.all(products.map((p) => this.toCard(p, params)));
  }

  /**
   * `idOrSlug` because the storefront routes on whatever it was given: links
   * that predate the real catalogue carry the old mock ids, which were seeded
   * as slugs precisely so those links keep resolving.
   */
  async getProduct(idOrSlug: string, params: { channel: SalesChannel; customerType?: CustomerType }) {
    const product = await this.prisma.product.findFirst({
      where: {
        isActive: true,
        showOnStorefront: true,
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: {
        // The parent rides along so the page can draw "Home > Atta & Flour >
        // Chakki Atta" and link the middle crumb to a real category page.
        category: {
          select: { id: true, name: true, slug: true, parent: { select: { id: true, name: true, slug: true } } },
        },
        variants: { where: { isActive: true }, orderBy: { displayOrder: 'asc' } },
        specifications: { orderBy: { displayOrder: 'asc' } },
        faqs: { orderBy: { displayOrder: 'asc' } },
        offers: { orderBy: { displayOrder: 'asc' } },
      },
    });
    if (!product) return null;
    return this.toCard(product, params, { detailed: true });
  }

  private async toCard(
    product: {
      id: string;
      name: string;
      sku: string;
      category: {
        id: string;
        name: string;
        slug: string;
        parent?: { id: string; name: string; slug: string } | null;
      } | null;
      unit: string;
      description: string | null;
      images: string[];
      // Present only on the detailed read. Declared rather than swept up by
      // the index signature below, which would type them as `{}`.
      specifications?: Array<{ label: string; value: string }>;
      faqs?: Array<{ question: string; answer: string }>;
      offers?: Array<{ title: string; description: string }>;
      variants?: Array<Record<string, any>>;
      [key: string]: unknown;
    },
    params: { channel: SalesChannel; customerType?: CustomerType },
    opts: { detailed?: boolean } = {},
  ) {
    const [price, availability] = await Promise.all([
      this.resolvePriceQuietly(product.id, params),
      this.availability(product.id),
    ]);

    const card = {
      id: product.id,
      slug: product.slug ?? null,
      name: product.name,
      sku: product.sku,
      category: product.category,
      unit: product.unit,
      description: opts.detailed ? product.description : undefined,
      images: product.images,
      price,
      inStock: availability.available > 0,
      // Needed on the card, not just the detail page: a listing has to decide
      // between "Out of stock" and "orderable" for every tile it draws.
      allowBackorder: product.allowBackorder === true,

      // Card-level marketing fields: the listing grid renders these, so they
      // cannot wait for the detail call.
      brand: product.brand ?? null,
      packLabel: product.packLabel ?? null,
      mrp: product.mrp === null || product.mrp === undefined ? null : Number(product.mrp),
      badge: product.badge ?? null,
      rating: product.rating === null || product.rating === undefined ? null : Number(product.rating),
      reviewCount: product.reviewCount ?? null,
    };

    if (!opts.detailed) return card;

    const tiers = await this.priceTiers(
      product.id,
      params,
      null,
      card.mrp,
    );

    return {
      ...card,
      availableQuantity: availability.available,

      highlights: product.highlights ?? [],
      hsnCode: product.hsnCode ?? null,
      manufacturer: product.manufacturer ?? null,
      countryOfOrigin: product.countryOfOrigin ?? null,
      shelfLife: product.shelfLife ?? null,
      disclaimer: product.disclaimer ?? null,
      returnPolicy: product.returnPolicy ?? null,
      warranty: product.warranty ?? null,

      orderLimits: {
        minOrderQuantity: product.minOrderQuantity ?? 1,
        maxOrderQuantity: product.maxOrderQuantity ?? null,
        moqB2B: product.moqB2B ?? 1,
        maxOrderQuantityB2B: product.maxOrderQuantityB2B ?? null,
        packBoxSize: product.packBoxSize ?? null,
        bulkAvailable: product.bulkAvailable ?? false,
        allowBackorder: product.allowBackorder ?? false,
      },

      businessInfo: {
        gstInvoiceAvailable: product.gstInvoiceAvailable ?? true,
        businessSupportContact: product.businessSupportContact ?? null,
        deliveryTerms: product.deliveryTerms ?? null,
      },

      // Empty arrays, never null: the storefront hides a section on length 0,
      // and a null would make every consumer guard twice.
      specifications: (product.specifications ?? []).map((s) => ({
        label: s.label,
        value: s.value,
      })),
      faqs: (product.faqs ?? []).map((f) => ({ question: f.question, answer: f.answer })),
      offers: (product.offers ?? []).map((o) => ({ title: o.title, description: o.description })),
      variants: await this.variantCards(product, params),
      priceTiers: tiers,
    };
  }

  /**
   * One price per variant, resolved through the same engine as the product's
   * own - a variant with no rule of its own reports null rather than silently
   * inheriting the parent's rate, because charging a 10kg price for a 5kg bag
   * is worse than showing nothing.
   */
  private async variantCards(
    product: { unit: string; variants?: Array<Record<string, any>> },
    params: { channel: SalesChannel; customerType?: CustomerType },
  ) {
    const variants = product.variants ?? [];
    return Promise.all(
      variants.map(async (variant) => ({
        id: variant.id,
        name: variant.name,
        sku: variant.sku,
        unit: variant.unit ?? product.unit,
        mrp: variant.mrp === null || variant.mrp === undefined ? null : Number(variant.mrp),
        images: variant.images ?? [],
        price: await this.resolvePriceQuietly(variant.productId, params, variant.id),
        // The variant's own ladder: the wholesale matrix prices each pack size
        // by the quantity entered for THAT pack, exactly as an order line will be.
        priceTiers: await this.priceTiers(
          variant.productId,
          params,
          variant.id,
          variant.mrp === null || variant.mrp === undefined ? null : Number(variant.mrp),
        ),
      })),
    );
  }

  /**
   * The wholesale tier ladder, read from the quantity breaks staff actually
   * defined rather than computed as a percentage of MRP. `maxQuantity` is
   * derived by looking at where the next break starts, so the storefront can
   * label a row "10-49" without duplicating that arithmetic.
   */
  private async priceTiers(
    productId: string,
    params: { channel: SalesChannel; customerType?: CustomerType },
    variantId: string | null = null,
    mrp: number | null = null,
  ): Promise<PriceTier[]> {
    const now = new Date();
    const rows = await this.prisma.priceList.findMany({
      where: {
        productId,
        variantId,
        channel: params.channel,
        isActive: true,
        effectiveFrom: { lte: now },
        // Both conditions go under AND rather than two OR keys: a second OR
        // property would overwrite the first, and the one silently dropped
        // would be the expiry window - putting expired rates on the page.
        AND: [
          { OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
          params.customerType
            ? { OR: [{ customerType: params.customerType }, { customerType: null }] }
            : { customerType: null },
        ],
      },
      orderBy: { minQuantity: 'asc' },
    });

    // A customer-type rule outranks a channel-wide one at the same break -
    // the same precedence PricingService.resolve applies, kept consistent so
    // the table a shopper reads matches what their order will be charged.
    const byBreak = new Map<number, (typeof rows)[number]>();
    for (const row of rows) {
      const held = byBreak.get(row.minQuantity);
      if (!held || (row.customerType !== null && held.customerType === null)) {
        byBreak.set(row.minQuantity, row);
      }
    }

    const ladder = [...byBreak.values()].sort((a, b) => a.minQuantity - b.minQuantity);
    return ladder.map((row, index) => ({
      minQuantity: row.minQuantity,
      maxQuantity: index + 1 < ladder.length ? ladder[index + 1].minQuantity - 1 : null,
      unitPrice: Number(row.unitPrice),
      unitPriceInclGst: inclusiveOf(Number(row.unitPrice), Number(row.gstRatePercent)),
      gstRatePercent: Number(row.gstRatePercent),
      tierTotal: row.tierTotal === null ? null : Number(row.tierTotal),
      discountPercent: tierDiscountPercent(mrp, Number(row.unitPrice), Number(row.gstRatePercent)),
    }));
  }

  /**
   * A missing price rule is common for a product mid-onboarding, not a bug in
   * the catalogue - PricingService.resolve() throws for the order-taking path,
   * where silence would be worse than a loud error. A storefront listing needs
   * the opposite: one unpriced SKU should not 500 the whole page.
   */
  private async resolvePriceQuietly(
    productId: string,
    params: { channel: SalesChannel; customerType?: CustomerType },
    variantId?: string,
  ) {
    try {
      const resolved = await this.pricing.resolve({
        productId,
        variantId,
        channel: params.channel,
        customerType: params.customerType,
        quantity: 1,
      });
      return {
        unitPrice: resolved.unitPrice,
        unitPriceInclGst: inclusiveOf(resolved.unitPrice, resolved.gstRatePercent),
        gstRatePercent: resolved.gstRatePercent,
        currency: resolved.currency,
      };
    } catch {
      return null;
    }
  }

  /**
   * Sellable quantity for a product across every warehouse: released by QA,
   * not expired, minus whatever is already reserved against another order.
   * No endpoint in the staff API aggregates this today - packaging.controller
   * exposes stock per warehouse per batch, which is the right granularity for
   * a warehouse manager and the wrong one for a product page.
   */
  private async availability(productId: string) {
    const rows = await this.prisma.finishedGoodsStock.findMany({
      where: {
        fgBatch: {
          productId,
          qaReleased: true,
          OR: [{ expiryDate: null }, { expiryDate: { gt: new Date() } }],
        },
      },
      select: { quantity: true, reservedQuantity: true },
    });

    const available = rows.reduce((sum, r) => sum + (r.quantity - r.reservedQuantity), 0);
    return { available: Math.max(0, available) };
  }
}
