import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomerType, Prisma, SalesChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePriceListDto,
  SetPriceListActiveDto,
  SupersedePriceDto,
} from './dto/pricing.dto';

export interface ResolvedPrice {
  priceListId: string;
  unitPrice: number;
  gstRatePercent: number;
  currency: string;
  channel: SalesChannel;
  appliedRule: string;
}

/**
 * WS1.6 - the channel pricing engine.
 *
 * The client sells the same pack to a distributor and to a consumer at
 * different prices (decision of 11-Aug-2026), so price cannot be a column on
 * the product. It is a dated rule keyed on (product, channel, customer type),
 * and this service is the only place that decides which rule wins.
 *
 * Two properties matter more than anything else here:
 *
 *   1. A B2C order can never resolve a B2B price. Channel is part of the query,
 *      not a filter applied afterwards, so there is no code path where the
 *      wrong channel's rate can leak through.
 *   2. Rules are superseded, never edited. An invoice raised last quarter must
 *      still reprint at last quarter's rate, and a price row referenced by an
 *      order line has to stay exactly as it was.
 */
@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePriceListDto, createdById: string) {
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Product not found');

    this.assertChannelTypeCoherent(dto.channel, dto.customerType);

    const effectiveFrom = new Date(dto.effectiveFrom);
    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
    if (effectiveTo && effectiveTo <= effectiveFrom) {
      throw new BadRequestException('effectiveTo must be after effectiveFrom');
    }

    if (dto.variantId) {
      const variant = await this.prisma.productVariant.findUnique({
        where: { id: dto.variantId },
      });
      if (!variant) throw new NotFoundException('Product variant not found');
      if (variant.productId !== dto.productId) {
        throw new BadRequestException(
          'That variant belongs to a different product - a price rule cannot cross products',
        );
      }
    }

    const overlap = await this.prisma.priceList.findFirst({
      where: {
        productId: dto.productId,
        // Scoped to the same variant (or to product-level rules when null), so
        // two pack sizes do not read as overlapping rules for one another.
        variantId: dto.variantId ?? null,
        channel: dto.channel,
        customerType: dto.customerType ?? null,
        minQuantity: dto.minQuantity ?? 1,
        isActive: true,
        effectiveFrom: { lte: effectiveTo ?? new Date('2999-12-31') },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: effectiveFrom } }],
      },
    });
    if (overlap) {
      throw new BadRequestException(
        `An active ${dto.channel} price for this product already covers that period ` +
          `(rule ${overlap.id}, effective ${overlap.effectiveFrom.toISOString().slice(0, 10)}). ` +
          'Supersede it rather than creating an overlapping rule.',
      );
    }

    return this.prisma.priceList.create({
      data: {
        productId: dto.productId,
        variantId: dto.variantId,
        channel: dto.channel,
        customerType: dto.customerType,
        unitPrice: dto.unitPrice,
        gstRatePercent: dto.gstRatePercent ?? 5,
        minQuantity: dto.minQuantity ?? 1,
        effectiveFrom,
        effectiveTo,
        currency: dto.currency ?? 'INR',
        createdById,
      },
      include: { product: { select: { id: true, name: true, sku: true } } },
    });
  }

  private assertChannelTypeCoherent(channel: SalesChannel, customerType?: CustomerType | null) {
    if (!customerType) return;
    if (channel === SalesChannel.B2C && customerType !== CustomerType.CONSUMER) {
      throw new BadRequestException(
        `${customerType} is a B2B customer type - it cannot carry a B2C price`,
      );
    }
    if (channel === SalesChannel.B2B && customerType === CustomerType.CONSUMER) {
      throw new BadRequestException('CONSUMER is a B2C customer type - it cannot carry a B2B price');
    }
  }

  async findAll(filters: {
    productId?: string;
    channel?: SalesChannel;
    activeOnly?: boolean;
  }) {
    const where: Prisma.PriceListWhereInput = {
      productId: filters.productId,
      channel: filters.channel,
    };
    if (filters.activeOnly) where.isActive = true;

    return this.prisma.priceList.findMany({
      where,
      orderBy: [{ channel: 'asc' }, { effectiveFrom: 'desc' }, { minQuantity: 'desc' }],
      include: { product: { select: { id: true, name: true, sku: true } } },
    });
  }

  /**
   * Resolve the price that applies to one order line.
   *
   * Selection, in order of precedence:
   *   1. a rule for this exact customer type beats a channel-wide rule
   *   2. the highest quantity break the line qualifies for
   *   3. the most recently effective rule
   *
   * Anything expired, deactivated, not yet effective, or belonging to the other
   * channel is excluded by the query itself.
   */
  async resolve(params: {
    productId: string;
    channel: SalesChannel;
    customerType?: CustomerType;
    quantity: number;
    on?: Date;
    variantId?: string | null;
  }): Promise<ResolvedPrice> {
    const on = params.on ?? new Date();

    const candidates = await this.prisma.priceList.findMany({
      where: {
        productId: params.productId,
        // Null is a value here, not a wildcard. A caller that did not name a
        // variant gets product-level rules only, so a 5kg rate can never be
        // charged for a line that asked for the product itself.
        variantId: params.variantId ?? null,
        channel: params.channel,
        isActive: true,
        minQuantity: { lte: params.quantity },
        effectiveFrom: { lte: on },
        AND: [
          // still in force on the date being priced
          { OR: [{ effectiveTo: null }, { effectiveTo: { gt: on } }] },
          // a rule for this customer type, or a channel-wide one
          params.customerType
            ? { OR: [{ customerType: params.customerType }, { customerType: null }] }
            : { customerType: null },
        ],
      },
    });

    if (candidates.length === 0) {
      const product = await this.prisma.product.findUnique({
        where: { id: params.productId },
        select: { name: true, sku: true },
      });
      throw new BadRequestException(
        `No ${params.channel} price is defined for ${product?.name ?? params.productId}` +
          `${product ? ` (${product.sku})` : ''} at quantity ${params.quantity} ` +
          `on ${on.toISOString().slice(0, 10)}. Add a price list rule before taking the order.`,
      );
    }

    const winner = candidates.sort((a, b) => {
      const specificity = Number(b.customerType !== null) - Number(a.customerType !== null);
      if (specificity !== 0) return specificity;
      if (b.minQuantity !== a.minQuantity) return b.minQuantity - a.minQuantity;
      return b.effectiveFrom.getTime() - a.effectiveFrom.getTime();
    })[0];

    return {
      priceListId: winner.id,
      unitPrice: Number(winner.unitPrice),
      gstRatePercent: Number(winner.gstRatePercent),
      currency: winner.currency,
      channel: winner.channel,
      appliedRule:
        `${winner.channel}` +
        `${winner.customerType ? `/${winner.customerType}` : ''}` +
        ` from qty ${winner.minQuantity}, effective ${winner.effectiveFrom
          .toISOString()
          .slice(0, 10)}`,
    };
  }

  /**
   * Replace a rate with a new one from a given date, closing the old rule the
   * instant before. This is the only supported way to change a price.
   */
  async supersede(id: string, dto: SupersedePriceDto, createdById: string) {
    const existing = await this.prisma.priceList.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Price list rule not found');

    const from = new Date(dto.effectiveFrom);
    if (from <= existing.effectiveFrom) {
      throw new BadRequestException(
        'The replacement must take effect after the rule it supersedes',
      );
    }

    const closeAt = new Date(from.getTime() - 1);

    return this.prisma.$transaction(async (tx) => {
      await tx.priceList.update({
        where: { id },
        data: { effectiveTo: closeAt },
      });

      return tx.priceList.create({
        data: {
          productId: existing.productId,
          // The replacement prices whatever the old rule priced - superseding
          // a variant rate must not silently widen it to the whole product.
          variantId: existing.variantId,
          channel: existing.channel,
          customerType: existing.customerType,
          unitPrice: dto.unitPrice,
          gstRatePercent: dto.gstRatePercent ?? existing.gstRatePercent,
          minQuantity: existing.minQuantity,
          currency: existing.currency,
          effectiveFrom: from,
          createdById,
        },
      });
    });
  }

  /**
   * Make the live ladder for one (product|variant, channel) match a desired
   * list of quantity breaks, by creating, superseding or closing rules - never
   * by editing one in place, so anything an invoice already references keeps
   * reproducing. This is what the Add/Edit Product screen calls: the operator
   * sees one table of breaks and saves it, and the dated-rule bookkeeping is
   * done here instead of being left to the form.
   *
   * Scope is deliberately narrow: only channel-wide rules (customerType null)
   * are touched. A distributor-specific rate is a commercial arrangement set
   * on the Price Lists screen, and a product save must not quietly close it.
   *
   * Takes a transaction client so the caller can commit the product row and its
   * prices together - a product that saved but lost its price would surface as
   * an unpriced SKU on the storefront.
   */
  async syncLadder(
    tx: Prisma.TransactionClient,
    params: {
      productId: string;
      variantId?: string | null;
      channel: SalesChannel;
      /** unitPrice is per unit. tierTotal is set when the operator entered a total for minQuantity units. */
      tiers: { minQuantity: number; unitPrice: number; tierTotal?: number | null }[];
      gstRatePercent: number;
      createdById: string;
      now?: Date;
    },
  ): Promise<{ created: number; superseded: number; closed: number }> {
    const now = params.now ?? new Date();
    const variantId = params.variantId ?? null;

    const breaks = params.tiers.map((t) => t.minQuantity);
    const duplicate = breaks.find((q, i) => breaks.indexOf(q) !== i);
    if (duplicate !== undefined) {
      throw new BadRequestException(
        `Two ${params.channel} price tiers start at quantity ${duplicate}. Each quantity break can carry one price.`,
      );
    }

    const current = await tx.priceList.findMany({
      where: {
        productId: params.productId,
        variantId,
        channel: params.channel,
        customerType: null,
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
    });

    const byBreak = new Map(current.map((row) => [row.minQuantity, row]));
    const result = { created: 0, superseded: 0, closed: 0 };

    for (const tier of params.tiers) {
      const existing = byBreak.get(tier.minQuantity);

      if (!existing) {
        await tx.priceList.create({
          data: {
            productId: params.productId,
            variantId,
            channel: params.channel,
            unitPrice: tier.unitPrice,
            tierTotal: tier.tierTotal ?? null,
            gstRatePercent: params.gstRatePercent,
            minQuantity: tier.minQuantity,
            effectiveFrom: now,
            createdById: params.createdById,
          },
        });
        result.created += 1;
        continue;
      }

      const unchanged =
        Number(existing.unitPrice) === tier.unitPrice &&
        (existing.tierTotal === null ? null : Number(existing.tierTotal)) === (tier.tierTotal ?? null) &&
        Number(existing.gstRatePercent) === params.gstRatePercent;
      if (unchanged) continue;

      // Same shape as supersede(): close the old rule the instant before the
      // new one opens, so there is never a gap or an overlap in coverage.
      await tx.priceList.update({
        where: { id: existing.id },
        data: { effectiveTo: new Date(now.getTime() - 1) },
      });
      await tx.priceList.create({
        data: {
          productId: params.productId,
          variantId,
          channel: params.channel,
          unitPrice: tier.unitPrice,
          tierTotal: tier.tierTotal ?? null,
          gstRatePercent: params.gstRatePercent,
          minQuantity: tier.minQuantity,
          currency: existing.currency,
          effectiveFrom: now,
          createdById: params.createdById,
        },
      });
      result.superseded += 1;
    }

    // A break the operator removed from the table stops applying from now.
    for (const row of current) {
      if (breaks.includes(row.minQuantity)) continue;
      await tx.priceList.update({ where: { id: row.id }, data: { effectiveTo: now } });
      result.closed += 1;
    }

    return result;
  }

  async setActive(id: string, dto: SetPriceListActiveDto) {
    const existing = await this.prisma.priceList.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Price list rule not found');

    return this.prisma.priceList.update({
      where: { id },
      data: { isActive: dto.isActive },
    });
  }

  /**
   * Side-by-side view of what a product costs in each channel today - the
   * screen the admin panel needs for the product master (WS2.2).
   */
  async channelComparison(productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');

    const now = new Date();
    const rows = await this.prisma.priceList.findMany({
      where: {
        productId,
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      orderBy: [{ channel: 'asc' }, { minQuantity: 'asc' }],
    });

    const byChannel = (channel: SalesChannel, variantId: string | null) =>
      rows
        .filter((r) => r.channel === channel && r.variantId === variantId)
        .map((r) => ({
          id: r.id,
          customerType: r.customerType,
          minQuantity: r.minQuantity,
          unitPrice: Number(r.unitPrice),
          tierTotal: r.tierTotal === null ? null : Number(r.tierTotal),
          gstRatePercent: Number(r.gstRatePercent),
          effectiveFrom: r.effectiveFrom,
        }));

    const variants = await this.prisma.productVariant.findMany({
      where: { productId },
      orderBy: { displayOrder: 'asc' },
      select: { id: true, name: true, sku: true },
    });

    return {
      product: { id: product.id, name: product.name, sku: product.sku, unit: product.unit },
      asOf: now,
      B2B: byChannel(SalesChannel.B2B, null),
      B2C: byChannel(SalesChannel.B2C, null),
      // Per-pack-size rates, so the admin screen can show the whole ladder for
      // a product with variants without a call per variant.
      variants: variants.map((v) => ({
        ...v,
        B2B: byChannel(SalesChannel.B2B, v.id),
        B2C: byChannel(SalesChannel.B2C, v.id),
      })),
    };
  }
}
