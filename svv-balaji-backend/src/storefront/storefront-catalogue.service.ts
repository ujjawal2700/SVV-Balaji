import { Injectable } from '@nestjs/common';
import { CustomerType, SalesChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';

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

  async listProducts(params: { channel: SalesChannel; customerType?: CustomerType; categorySlug?: string }) {
    const products = await this.prisma.product.findMany({
      where: {
        isActive: true,
        showOnStorefront: true,
        category: params.categorySlug ? { slug: params.categorySlug } : undefined,
      },
      include: { category: { select: { id: true, name: true, slug: true } } },
      orderBy: { name: 'asc' },
    });

    return Promise.all(products.map((p) => this.toCard(p, params)));
  }

  async getProduct(id: string, params: { channel: SalesChannel; customerType?: CustomerType }) {
    const product = await this.prisma.product.findFirst({
      where: { id, isActive: true, showOnStorefront: true },
      include: { category: { select: { id: true, name: true, slug: true } } },
    });
    if (!product) return null;
    return this.toCard(product, params, { detailed: true });
  }

  private async toCard(
    product: {
      id: string;
      name: string;
      sku: string;
      category: { id: string; name: string; slug: string } | null;
      unit: string;
      description: string | null;
      images: string[];
    },
    params: { channel: SalesChannel; customerType?: CustomerType },
    opts: { detailed?: boolean } = {},
  ) {
    const [price, availability] = await Promise.all([
      this.resolvePriceQuietly(product.id, params),
      this.availability(product.id),
    ]);

    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      category: product.category,
      unit: product.unit,
      description: opts.detailed ? product.description : undefined,
      images: product.images,
      price,
      inStock: availability.available > 0,
      ...(opts.detailed ? { availableQuantity: availability.available } : {}),
    };
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
  ) {
    try {
      const resolved = await this.pricing.resolve({
        productId,
        channel: params.channel,
        customerType: params.customerType,
        quantity: 1,
      });
      return { unitPrice: resolved.unitPrice, gstRatePercent: resolved.gstRatePercent, currency: resolved.currency };
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
