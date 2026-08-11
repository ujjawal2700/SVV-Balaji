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

    const overlap = await this.prisma.priceList.findFirst({
      where: {
        productId: dto.productId,
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
  }): Promise<ResolvedPrice> {
    const on = params.on ?? new Date();

    const candidates = await this.prisma.priceList.findMany({
      where: {
        productId: params.productId,
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

    const byChannel = (channel: SalesChannel) =>
      rows
        .filter((r) => r.channel === channel)
        .map((r) => ({
          customerType: r.customerType,
          minQuantity: r.minQuantity,
          unitPrice: Number(r.unitPrice),
          gstRatePercent: Number(r.gstRatePercent),
          effectiveFrom: r.effectiveFrom,
        }));

    return {
      product: { id: product.id, name: product.name, sku: product.sku, unit: product.unit },
      asOf: now,
      B2B: byChannel(SalesChannel.B2B),
      B2C: byChannel(SalesChannel.B2C),
    };
  }
}
