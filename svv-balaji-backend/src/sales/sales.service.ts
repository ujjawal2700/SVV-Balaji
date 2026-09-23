import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  CustomerStatus,
  OrderStatus,
  PaymentStatus,
  PaymentTerms,
  Prisma,
  SalesChannel,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { scopedBranchId } from '../common/branch-scope';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { SequenceService } from '../common/sequence.service';
import { PricingService } from '../pricing/pricing.service';
import { ReferralService } from '../common/referral.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { refundCouponForOrder } from '../checkout/coupons.service';
import { heldByOthers, lockStockRows } from '../checkout/stock-holds';
import { OrderEventsService } from '../realtime/order-events.service';
import type { RecordReturnDto } from '../loyalty/dto/loyalty.dto';
import {
  CancelOrderDto,
  CreateOrderDto,
  UpdatePaymentStatusDto,
} from './dto/order.dto';

/** Forward-only order lifecycle. Anything not listed here is refused. */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: [OrderStatus.PLACED, OrderStatus.CANCELLED],
  PLACED: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.ALLOCATED, OrderStatus.CANCELLED],
  ALLOCATED: [OrderStatus.PACKED, OrderStatus.CANCELLED],
  PACKED: [OrderStatus.DISPATCHED, OrderStatus.CANCELLED],
  DISPATCHED: [OrderStatus.DELIVERED],
  DELIVERED: [],
  CANCELLED: [],
};

/**
 * WS1.5 - sales and order fulfilment, for both channels.
 *
 * Three things in here are load-bearing and should not be softened:
 *
 *   1. `channel` is copied onto the order from the customer at placement and
 *      never read from the customer again. The channel an order was taken
 *      through is a fact about that order.
 *   2. Prices are resolved once, at placement, and frozen onto the line along
 *      with the rule that produced them. A later price change cannot restate an
 *      order that is already out of the door.
 *   3. Allocation only ever draws QA-released stock, and records exactly which
 *      pack batches went to which line. That allocation row is what keeps the
 *      traceability chain intact through the sales half of the system - without
 *      it, a delivered order is anonymous and the whole farm-to-fork promise
 *      stops at the warehouse door.
 */
@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly pricing: PricingService,
    private readonly referrals: ReferralService,
    private readonly loyalty: LoyaltyService,
    private readonly events: OrderEventsService,
  ) {}

  async create(dto: CreateOrderDto, placedById: string | null) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) throw new NotFoundException('Customer not found');

    if (customer.status !== CustomerStatus.ACTIVE) {
      throw new BadRequestException(
        `Customer ${customer.customerCode} is ${customer.status} and cannot place orders`,
      );
    }

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.warehouseId },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    const productIds = dto.items.map((i) => i.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new BadRequestException(
        'The same product appears on more than one line - combine them into a single line',
      );
    }

    const orderDate = dto.orderDate ? new Date(dto.orderDate) : new Date();

    // Price every line through the pricing engine, in this order's channel.
    // A B2C order physically cannot pick up a B2B rate: the channel is part of
    // the resolution query.
    const priced = await Promise.all(
      dto.items.map(async (item) => {
        const price = await this.pricing.resolve({
          productId: item.productId,
          channel: customer.channel,
          customerType: customer.type,
          quantity: item.quantity,
          on: orderDate,
        });

        const lineSubtotal = round2(price.unitPrice * item.quantity);
        const lineTax = round2((lineSubtotal * price.gstRatePercent) / 100);

        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: price.unitPrice,
          priceListId: price.priceListId,
          gstRatePercent: price.gstRatePercent,
          lineSubtotal,
          lineTax,
          lineTotal: round2(lineSubtotal + lineTax),
        };
      }),
    );

    const subtotal = round2(priced.reduce((s, l) => s + l.lineSubtotal, 0));
    const taxTotal = round2(priced.reduce((s, l) => s + l.lineTax, 0));
    const total = round2(subtotal + taxTotal);

    const paymentTerms =
      customer.channel === SalesChannel.B2C ? PaymentTerms.PREPAID : customer.paymentTerms;

    return this.prisma.$transaction(async (tx) => {
      /**
       * FRD 25 - the credit check has to be inside the transaction.
       *
       * It used to run just before `$transaction` opened, which made it
       * advisory under load: two orders for the same customer could both read
       * the outstanding balance, both find headroom, and both commit - jointly
       * exceeding a limit neither had breached on its own. Reading it on the
       * transaction client means the second one sees the first.
       */
      if (paymentTerms !== PaymentTerms.PREPAID) {
        await this.assertWithinCreditLimit(customer.id, total, tx);
      }

      const orderNumber = await this.sequence.next(tx, 'SO', orderDate);

      return tx.order.create({
        data: {
          orderNumber,
          channel: customer.channel,
          /**
           * FRD 24.2 - snapshot, not a lookup.
           *
           * Falls back to the customer's shipping address, then their billing
           * address. Captured now so that editing the customer later cannot
           * rewrite where this order was sent.
           */
          deliveryAddress:
            dto.deliveryAddress ?? customer.shippingAddress ?? customer.billingAddress,
          customerId: customer.id,
          /**
           * A-13 (16 Aug): an order may be saved as a DRAFT.
           *
           * A B2B order is a phone call with someone reading out a list, and
           * staff need to save half of one. Defaults to PLACED so every
           * existing caller is unaffected.
           *
           * Note what is NOT conditional: the prices above are resolved and
           * frozen now, at creation. That is correct for a placed order and is
           * revisited when a draft is placed - see `place()`. Freezing a
           * draft's price would let somebody park an order to hold an old rate.
           */
          status: dto.status === 'DRAFT' ? OrderStatus.DRAFT : OrderStatus.PLACED,
          orderDate,
          requiredByDate: dto.requiredByDate ? new Date(dto.requiredByDate) : undefined,
          warehouseId: dto.warehouseId,
          branchId: customer.branchId ?? warehouse.branchId,
          subtotal,
          taxTotal,
          total,
          paymentTerms,
          placedById: placedById ?? undefined,
          notes: dto.notes,
          items: { create: priced },
        },
        include: {
          items: { include: { product: { select: { id: true, name: true, sku: true } } } },
          customer: { select: { customerCode: true, name: true, channel: true, type: true } },
        },
      });
    });
  }

  /**
   * Credit is only extended as far as the agreed limit. A customer on credit
   * terms with no limit recorded is refused outright rather than treated as
   * unlimited - the safer reading of a missing number.
   */
  /**
   * @param client the transaction client when called inside one, so the read
   *   sees the same snapshot as the write it is guarding. Falls back to the
   *   base client for the one caller (`place`) that is not yet transactional.
   */
  async assertWithinCreditLimit(
    customerId: string,
    orderTotal: number,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const customer = await client.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');

    if (customer.creditLimit === null || customer.creditLimit === undefined) {
      throw new BadRequestException(
        `${customer.customerCode} is on ${customer.paymentTerms} terms but has no credit limit ` +
          'recorded. Set a limit before taking an order on credit.',
      );
    }

    const openOrders = await client.order.findMany({
      where: {
        customerId,
        status: { not: OrderStatus.CANCELLED },
        /**
         * What is actually owed.
         *
         * PAID is settled. REFUNDED is money returned, so it is not a
         * receivable either - counting it would hold credit against a customer
         * for an order they were paid back for. FAILED and PARTIAL both still
         * represent exposure and stay in.
         */
        paymentStatus: { notIn: [PaymentStatus.PAID, PaymentStatus.REFUNDED] },
      },
      select: { total: true },
    });

    const exposure = openOrders.reduce((s, o) => s + Number(o.total), 0);
    const limit = Number(customer.creditLimit);

    if (exposure + orderTotal > limit) {
      throw new BadRequestException(
        `Order of ${orderTotal.toFixed(2)} would take ${customer.customerCode} to ` +
          `${(exposure + orderTotal).toFixed(2)} against a credit limit of ${limit.toFixed(2)} ` +
          `(${exposure.toFixed(2)} already outstanding)`,
      );
    }
  }

  async findAll(user: JwtPayload, filters: {
    channel?: SalesChannel;
    status?: OrderStatus;
    customerId?: string;
    warehouseId?: string;
    from?: Date;
    to?: Date;
  }) {
    const where: Prisma.OrderWhereInput = {
      channel: filters.channel,
      status: filters.status,
      customerId: filters.customerId,
      warehouseId: filters.warehouseId,
      // FRD 5.2 - a branch user sees their own branch's orders only.
      branchId: scopedBranchId(user, undefined),
    };
    if (filters.from || filters.to) {
      where.orderDate = { gte: filters.from, lte: filters.to };
    }

    return this.prisma.order.findMany({
      where,
      orderBy: { orderDate: 'desc' },
      include: {
        customer: { select: { customerCode: true, name: true, channel: true, phone: true } },
        items: {
          select: {
            productId: true, quantity: true, lineTotal: true, nameSnapshot: true, skuSnapshot: true,
            product: { select: { name: true, sku: true } },
          },
        },
        warehouse: { select: { name: true, kind: true } },
        shipment: { select: { awb: true, courier: true, trackingUrl: true } },
      },
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        warehouse: { select: { id: true, name: true, location: true } },
        shipment: true,
        placedBy: { select: { id: true, fullName: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, unit: true } },
            priceList: { select: { id: true, effectiveFrom: true, minQuantity: true } },
          },
        },
        /**
         * Released allocations are included deliberately (A-13). The detail
         * screen shows them struck through - "this order held FG-...-003 and
         * gave it back on the 14th" is exactly the question the audit trail
         * exists to answer. `releasedAt` is what tells the two apart.
         */
        allocations: {
          orderBy: { createdAt: 'asc' },
          include: {
            fgBatch: {
              select: {
                id: true,
                fgBatchNumber: true,
                expiryDate: true,
                manufacturingDate: true,
                packagingDate: true,
                netWeight: true,
                weightUnit: true,
                qaReleased: true,
                holdStatus: true,
                // The upstream chain: which raw lots, from which farmers/suppliers.
                productionBatch: {
                  select: {
                    productionBatchNumber: true,
                    consumptions: {
                      select: {
                        rawMaterialBatch: {
                          select: {
                            batchNumber: true,
                            cropName: true,
                            farmer: { select: { farmerCode: true, fullName: true, village: true, district: true, state: true } },
                            supplier: { select: { supplierCode: true, fullName: true, city: true, district: true, state: true } },
                          },
                        },
                      },
                    },
                  },
                },
                // Who signed the finished batch off, and when.
                qualityInspections: {
                  where: { stage: 'FINISHED_GOODS' },
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                  select: { result: true, createdAt: true, inspectedBy: { select: { fullName: true } } },
                },
              },
            },
          },
        },
        // The order's own timeline (placed, confirmed, packed, rider/AWB, delivered ...).
        events: {
          orderBy: { createdAt: 'asc' },
          include: { actor: { select: { fullName: true } } },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private assertTransition(from: OrderStatus, to: OrderStatus) {
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw new BadRequestException(
        `An order cannot go from ${from} to ${to}` +
          (ALLOWED_TRANSITIONS[from].length
            ? ` - allowed from here: ${ALLOWED_TRANSITIONS[from].join(', ')}`
            : ' - this is a terminal state'),
      );
    }
  }

  /**
   * Move a DRAFT to PLACED, re-pricing it as it goes (A-13).
   *
   * -------------------------------------------------------------------------
   * The re-pricing is the whole point, not an optimisation.
   *
   * A draft is a working document: someone saved half an order on Monday. If
   * the prices captured then were kept, a salesperson could park an order
   * before a price rise and place it afterwards at the old rate. That is a
   * commercial hole, and it would be invisible - the order would look
   * perfectly ordinary.
   *
   * So every line is resolved again at placement, against today's price list,
   * and the totals and credit check are redone with the new figures. The line
   * also records WHICH price rule produced it, so an invoice dispute has an
   * answer years later.
   *
   * A price that has moved is not an error. The caller sees the new total in
   * the response; the screen shows it back before the order is confirmed.
   * -------------------------------------------------------------------------
   */
  async place(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true, customer: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (order.status !== OrderStatus.DRAFT) {
      throw new BadRequestException(
        `Only a DRAFT can be placed - this order is ${order.status}.`,
      );
    }

    if (order.customer.status !== CustomerStatus.ACTIVE) {
      throw new BadRequestException(
        `Customer ${order.customer.customerCode} is ${order.customer.status} and cannot place orders`,
      );
    }

    const placedOn = new Date();

    const repriced = await Promise.all(
      order.items.map(async (item) => {
        const price = await this.pricing.resolve({
          productId: item.productId,
          channel: order.channel,
          customerType: order.customer.type,
          quantity: item.quantity,
          on: placedOn,
        });

        const lineSubtotal = round2(price.unitPrice * item.quantity);
        const lineTax = round2((lineSubtotal * price.gstRatePercent) / 100);

        return {
          id: item.id,
          previousUnitPrice: Number(item.unitPrice),
          unitPrice: price.unitPrice,
          priceListId: price.priceListId,
          gstRatePercent: price.gstRatePercent,
          lineSubtotal,
          lineTax,
          lineTotal: round2(lineSubtotal + lineTax),
        };
      }),
    );

    const subtotal = round2(repriced.reduce((sum, l) => sum + l.lineSubtotal, 0));
    const taxTotal = round2(repriced.reduce((sum, l) => sum + l.lineTax, 0));
    const total = round2(subtotal + taxTotal);

    const changed = repriced.filter((l) => l.previousUnitPrice !== l.unitPrice);

    const placed = await this.prisma.$transaction(async (tx) => {
      /**
       * Redone against the NEW total - a draft that was within the credit
       * limit at the old price may not be at the new one - and inside the
       * transaction for the same reason as `create`: two drafts placed at once
       * would otherwise both pass a check neither could pass second.
       */
      if (order.paymentTerms !== PaymentTerms.PREPAID) {
        await this.assertWithinCreditLimit(order.customerId, total, tx);
      }

      for (const line of repriced) {
        await tx.orderItem.update({
          where: { id: line.id },
          data: {
            unitPrice: line.unitPrice,
            priceListId: line.priceListId,
            gstRatePercent: line.gstRatePercent,
            lineSubtotal: line.lineSubtotal,
            lineTax: line.lineTax,
            lineTotal: line.lineTotal,
          },
        });
      }

      return tx.order.update({
        where: { id },
        data: { status: OrderStatus.PLACED, subtotal, taxTotal, total, orderDate: placedOn },
        include: { items: true, customer: true },
      });
    });

    return {
      order: placed,
      /**
       * Surfaced rather than buried: if a price moved between drafting and
       * placing, whoever placed it needs to see that before they confirm.
       */
      repriced: changed.map((l) => ({
        orderItemId: l.id,
        from: l.previousUnitPrice,
        to: l.unitPrice,
      })),
    };
  }

  /** Timeline entry + live update for anyone watching the orders screen. Never fails the caller. */
  async record(orderId: string, type: string, actorId?: string, note?: string): Promise<void> {
    try {
      await this.prisma.orderEvent.create({ data: { orderId, type, note, actorId: actorId && actorId !== 'system' ? actorId : undefined } });
    } catch (err) {
      this.logger.warn(`Could not log ${type} for order ${orderId}: ${err instanceof Error ? err.message : String(err)}`);
    }
    this.events.publish('updated', orderId);
  }

  async confirm(id: string) {
    const updated = await this.confirmCore(id);
    await this.record(id, 'CONFIRMED');
    return updated;
  }

  private async confirmCore(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    this.assertTransition(order.status, OrderStatus.CONFIRMED);

    const updated = await this.prisma.order.update({
      where: { id },
      data: { status: OrderStatus.CONFIRMED },
    });

    // Best-effort and outside any transaction: the FIRST_ORDER referral
    // reward, if configured. Never lets a coin-crediting bug fail an order
    // confirmation - see ReferralService's note on why these calls take the
    // plain PrismaService rather than a nested tx.
    await this.referrals.onOrderConfirmed(this.prisma, order.customerId, order.id).catch((err) => {
      this.logger.warn(`Referral reward check failed for confirmed order ${order.orderNumber}: ${err instanceof Error ? err.message : String(err)}`);
    });

    return updated;
  }

  /**
   * Batch-wise picking (FRD 25). Assigns specific finished-goods batches to
   * each line and reserves them.
   *
   * Two rules decide which batches are eligible:
   *   - only QA-released batches, mirroring the finished-goods gate that already
   *     blocks dispatch of a failed inspection
   *   - nothing already past its expiry date
   *
   * Eligible stock is then consumed first-expiry-first-out, so the shortest-dated
   * stock moves before it becomes a write-off.
   */
  async allocate(id: string, allocatedById: string) {
    const result = await this.allocateCore(id, allocatedById);
    await this.record(id, 'ALLOCATED', allocatedById);
    return result;
  }

  private async allocateCore(id: string, allocatedById: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      // Live only: a released allocation is history, not a current holding,
      // and counting it would make an order that was cancelled and re-placed
      // permanently un-allocatable.
      include: { items: true, allocations: { where: { releasedAt: null } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    this.assertTransition(order.status, OrderStatus.ALLOCATED);

    if (order.allocations.length > 0) {
      throw new BadRequestException(
        'This order already has allocations - cancel it and re-place rather than double-allocating',
      );
    }

    const today = startOfDay(new Date());
    const productIds = order.items.map((i) => i.productId);

    return this.prisma.$transaction(async (tx) => {
      /**
       * Serialise every other allocation (or re-allocation) competing for the
       * same products in this warehouse. Without this, two concurrent
       * `allocateCore`/`reallocate` calls can both read `reservedQuantity`
       * before either writes it, both see the same "free" packs, and both
       * increment - over-reserving the batch. `lockStockRows` locks in `id`
       * order (see checkout/stock-holds.ts), so this can never deadlock
       * against a checkout hold or another allocation doing the same thing.
       */
      await lockStockRows(tx, order.warehouseId, productIds);

      const created: Array<{
        orderItemId: string;
        fgBatchNumber: string;
        quantity: number;
        expiryDate: Date | null;
      }> = [];

      /**
       * Lines that could not be filled completely. Empty on a clean allocation.
       * Returned rather than thrown so the warehouse can pick what exists while
       * procurement chases the rest - see the note at the shortfall check.
       */
      const shortfalls: Array<{
        orderItemId: string;
        productId: string;
        productName: string;
        sku: string | null;
        requested: number;
        allocated: number;
        short: number;
      }> = [];

      for (const item of order.items) {
        const stock = await tx.finishedGoodsStock.findMany({
          where: {
            warehouseId: order.warehouseId,
            fgBatch: { productId: item.productId, qaReleased: true, holdStatus: 'ACTIVE' },
          },
          include: {
            fgBatch: {
              select: { id: true, fgBatchNumber: true, expiryDate: true },
            },
          },
        });

        const eligible = stock
          .filter((s) => s.quantity - s.reservedQuantity > 0)
          .filter((s) => !s.fgBatch.expiryDate || s.fgBatch.expiryDate >= today)
          .sort(byFirstExpiryFirstOut);

        // Stock another paid order (or a customer mid-payment) has already been
        // promised is not ours to pick - see checkout/stock-holds.ts.
        const promisedToOthers = await heldByOthers(tx, order.warehouseId, item.productId, order.id);
        const availableTotal = Math.max(
          0,
          eligible.reduce((sum, s) => sum + (s.quantity - s.reservedQuantity), 0) - promisedToOthers,
        );

        /**
         * FRD 25.4 - "Partially Available" is a real outcome.
         *
         * This used to throw the moment one line was short, so an order for
         * 100 packs with 90 in stock was refused outright and the warehouse
         * could not start picking anything. That is not what the FRD
         * describes, and it is not what a warehouse does: they pick what is
         * there and chase the rest.
         *
         * So allocation now takes what exists and reports what it could not
         * fill. The shortfall is returned explicitly rather than being left
         * for the caller to derive from the numbers, because the failure mode
         * this opens up is an order that *looks* allocated and quietly ships
         * short - and the only defence against that is making the gap loud.
         */
        if (availableTotal < item.quantity) {
          const product = await tx.product.findUnique({
            where: { id: item.productId },
            select: { name: true, sku: true },
          });
          shortfalls.push({
            orderItemId: item.id,
            productId: item.productId,
            productName: product?.name ?? item.productId,
            sku: product?.sku ?? null,
            requested: item.quantity,
            allocated: availableTotal,
            short: item.quantity - availableTotal,
          });
        }

        // Take whatever is there, up to what was asked for.
        let outstanding = Math.min(item.quantity, availableTotal);
        for (const row of eligible) {
          if (outstanding === 0) break;
          const take = Math.min(outstanding, row.quantity - row.reservedQuantity);
          if (take <= 0) continue;

          await tx.orderAllocation.create({
            data: {
              orderId: order.id,
              orderItemId: item.id,
              fgBatchId: row.fgBatchId,
              warehouseId: row.warehouseId,
              quantity: take,
              allocatedById,
            },
          });

          await tx.finishedGoodsStock.update({
            where: { id: row.id },
            data: { reservedQuantity: { increment: take } },
          });

          created.push({
            orderItemId: item.id,
            fgBatchNumber: row.fgBatch.fgBatchNumber,
            quantity: take,
            expiryDate: row.fgBatch.expiryDate,
          });

          outstanding -= take;
        }
      }

      /**
       * Nothing at all is still a refusal.
       *
       * Partial is a workable state; zero is not. Moving an order to ALLOCATED
       * having reserved nothing would produce a picking slip with no lines on
       * it, and the status would be a lie rather than a partial truth.
       */
      if (created.length === 0) {
        throw new BadRequestException(
          `No QA-released stock is available in this warehouse for any line on this order. ` +
            shortfalls
              .map((f) => `${f.productName}: ${f.requested} needed, none available`)
              .join('; '),
        );
      }

      // The order's product-level reservation has now become real batch allocations.
      await tx.stockReservation.updateMany({
        where: { orderId: order.id, status: 'COMMITTED' },
        data: { status: 'RELEASED' },
      });

      const updated = await tx.order.update({
        where: { id },
        data: { status: OrderStatus.ALLOCATED },
      });

      return {
        order: updated,
        allocations: created,
        shortfalls,
        /** True when every line was filled in full. */
        complete: shortfalls.length === 0,
      };
    });
  }

  /**
   * Move the order along the fulfilment chain.
   *
   * Dispatch is the point at which reserved stock actually leaves: both the
   * held quantity and the on-hand quantity come down together, so a warehouse
   * count and the system agree the moment the vehicle goes.
   */
  async advance(id: string, to: OrderStatus, performedById: string) {
    await this.assertLifecycleGuards(id, to);
    const result = await this.advanceCore(id, to, performedById);
    await this.record(id, to, performedById);
    return result;
  }

  /**
   * Storefront orders cannot skip the steps that make them trustworthy. A
   * shortcut through the plain status endpoints would defeat the very controls
   * (scan, rider, AWB, doorstep OTP) the fulfilment pipeline exists to enforce.
   */
  private async assertLifecycleGuards(id: string, to: OrderStatus) {
    const o = await this.prisma.order.findUnique({
      where: { id },
      include: { allocations: { where: { releasedAt: null } }, shipment: true },
    });
    if (!o || o.source !== 'STOREFRONT') return;

    if (to === OrderStatus.PACKED && o.allocations.some((a) => !a.scannedAt)) {
      throw new BadRequestException('Scan every allocated batch before marking this order packed');
    }
    if (to === OrderStatus.DISPATCHED) {
      if (o.fulfillmentMethod === 'LOCAL' && !o.riderName) throw new BadRequestException('Assign a rider before sending this order out for delivery');
      if (o.fulfillmentMethod === 'SHIPROCKET' && !o.shipment) throw new BadRequestException('Create the shipment (AWB) before dispatching this order');
    }
    if (to === OrderStatus.DELIVERED && o.fulfillmentMethod === 'LOCAL' && !o.deliveryOtpVerifiedAt) {
      throw new BadRequestException("Enter the customer's delivery OTP to complete this delivery");
    }
  }

  private async advanceCore(id: string, to: OrderStatus, performedById: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      // Live allocations only. A released one has already had its reservation
      // returned and must not be dispatched.
      include: { allocations: { where: { releasedAt: null } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    this.assertTransition(order.status, to);

    if (to !== OrderStatus.DISPATCHED) {
      const updated = await this.prisma.order.update({
        where: { id },
        data: { status: to, ...this.stampFor(to) },
      });

      if (to === OrderStatus.DELIVERED) {
        // Best-effort, outside any transaction - see confirm() above for why.
        await this.referrals.onOrderDelivered(this.prisma, order.customerId, order.id).catch((err) => {
          this.logger.warn(`Referral reward check failed for delivered order ${order.orderNumber}: ${err instanceof Error ? err.message : String(err)}`);
        });

        // Loyalty points are credited on delivery. Best-effort for the same
        // reason as above - a rewards bug must never block a delivery - but
        // NOT fire-and-forget-and-forget: the credit is idempotent and the
        // hourly sweep (LoyaltyService.sweepDelivered) retries any order whose
        // credit failed here.
        await this.loyalty.creditForDeliveredOrder(order.id).catch((err) => {
          this.logger.warn(`Loyalty credit failed for delivered order ${order.orderNumber}, sweep will retry: ${err instanceof Error ? err.message : String(err)}`);
        });
      }

      return updated;
    }

    // A batch frozen or recalled AFTER allocation must not leave the building.
    const held = await this.prisma.finishedGoodsBatch.findMany({
      where: {
        id: { in: order.allocations.map((a) => a.fgBatchId) },
        holdStatus: { not: 'ACTIVE' },
      },
      select: { fgBatchNumber: true, holdStatus: true },
    });
    if (held.length > 0) {
      throw new BadRequestException(
        `Cannot dispatch: ${held.map((b) => `${b.fgBatchNumber} is ${b.holdStatus}`).join(', ')}. ` +
          'Release the hold, or re-allocate this order from another batch.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      for (const allocation of order.allocations) {
        const row = await tx.finishedGoodsStock.findUnique({
          where: {
            warehouseId_fgBatchId: {
              warehouseId: allocation.warehouseId,
              fgBatchId: allocation.fgBatchId,
            },
          },
        });
        if (!row) {
          throw new BadRequestException(
            `Stock row for allocated batch ${allocation.fgBatchId} has gone missing - ` +
              'investigate before dispatching',
          );
        }

        await tx.finishedGoodsStock.update({
          where: { id: row.id },
          data: {
            quantity: { decrement: allocation.quantity },
            reservedQuantity: { decrement: allocation.quantity },
          },
        });

        /**
         * A-13: finished goods stock now moves alongside a ledger row, the
         * same invariant raw material has always held. Written inside the same
         * transaction as the decrement - if the movement cannot be recorded,
         * the stock does not move either.
         */
        await tx.stockMovement.create({
          data: {
            fgBatchId: allocation.fgBatchId,
            fromWarehouseId: allocation.warehouseId,
            movementType: 'STOCK_OUT',
            quantity: allocation.quantity,
            unit: 'PACK',
            reason: `Dispatched on order ${order.orderNumber}`,
            performedById,
          },
        });
      }

      return tx.order.update({
        where: { id },
        data: { status: OrderStatus.DISPATCHED, ...this.stampFor(OrderStatus.DISPATCHED) },
      });
    });
  }

  /**
   * The timestamp a transition leaves behind, if it leaves one.
   *
   * Only DISPATCHED and DELIVERED are stamped. The intermediate steps -
   * confirmed, allocated, packed - are internal handling with no commitment
   * attached to them, and `updatedAt` already covers "when did this last
   * move". These two are different: they are the only points a promise to the
   * customer was either kept or missed, which is what FRD 34's Delivery
   * Reports actually measure.
   *
   * Stamped server-side rather than accepted from the client. A dispatch time
   * a caller can choose is a dispatch time that gets backdated to hit a
   * target, and the whole point of the column is that it is evidence.
   */
  private stampFor(to: OrderStatus): { dispatchedAt?: Date; deliveredAt?: Date } {
    const now = new Date();
    if (to === OrderStatus.DISPATCHED) return { dispatchedAt: now };
    if (to === OrderStatus.DELIVERED) return { deliveredAt: now };
    return {};
  }

  /**
   * Swap out allocations that point at a frozen or recalled batch.
   *
   * The recall flow's answer to "this order was promised FG-X and FG-X is now
   * withheld". For a not-yet-dispatched order it gives back the reservation on
   * every held batch (rows are released, never deleted - the audit still shows
   * what was promised and why it changed) and re-picks the same quantity from
   * ACTIVE, QA-released, unexpired stock, first-expiry-first-out, exactly as
   * `allocate` does. A dispatched order cannot be fixed here - those packs are
   * with the customer, which is what the recall's forward trace is for.
   *
   * Partial is reported, not hidden: if healthy stock cannot cover it the
   * shortfall comes back and the order keeps whatever could be re-picked.
   */
  async reallocate(id: string, allocatedById: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        allocations: {
          where: { releasedAt: null },
          include: { fgBatch: { select: { fgBatchNumber: true, holdStatus: true } } },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.ALLOCATED && order.status !== OrderStatus.PACKED) {
      throw new BadRequestException(
        `Only an allocated or packed order can be re-allocated (this one is ${order.status})`,
      );
    }

    const stale = order.allocations.filter((a) => a.fgBatch.holdStatus !== 'ACTIVE');
    if (stale.length === 0) {
      throw new BadRequestException('None of this order\'s batches is frozen or recalled - nothing to re-allocate');
    }

    const today = startOfDay(new Date());

    return this.prisma.$transaction(async (tx) => {
      const released: Array<{ fgBatchNumber: string; quantity: number; reason: string }> = [];
      const perLine = new Map<string, number>();

      for (const a of stale) {
        const row = await tx.finishedGoodsStock.findUnique({
          where: { warehouseId_fgBatchId: { warehouseId: a.warehouseId, fgBatchId: a.fgBatchId } },
        });
        if (row) {
          await tx.finishedGoodsStock.update({
            where: { id: row.id },
            data: { reservedQuantity: { decrement: Math.min(a.quantity, row.reservedQuantity) } },
          });
        }
        const reason = `Batch ${a.fgBatch.fgBatchNumber} is ${a.fgBatch.holdStatus} - re-allocated`;
        await tx.orderAllocation.update({ where: { id: a.id }, data: { releasedAt: new Date(), releasedReason: reason } });
        released.push({ fgBatchNumber: a.fgBatch.fgBatchNumber, quantity: a.quantity, reason });
        perLine.set(a.orderItemId, (perLine.get(a.orderItemId) ?? 0) + a.quantity);
      }

      const items = await tx.orderItem.findMany({ where: { id: { in: [...perLine.keys()] } } });

      // Same race the fresh allocation guards against - see allocateCore.
      await lockStockRows(tx, order.warehouseId, items.map((i) => i.productId));

      const created: Array<{ orderItemId: string; fgBatchNumber: string; quantity: number }> = [];
      const shortfalls: Array<{ orderItemId: string; productId: string; short: number }> = [];

      for (const item of items) {
        const needed = perLine.get(item.id) ?? 0;
        const stock = await tx.finishedGoodsStock.findMany({
          where: {
            warehouseId: order.warehouseId,
            fgBatch: { productId: item.productId, qaReleased: true, holdStatus: 'ACTIVE' },
          },
          include: { fgBatch: { select: { id: true, fgBatchNumber: true, expiryDate: true } } },
        });
        const eligible = stock
          .filter((r) => r.quantity - r.reservedQuantity > 0)
          .filter((r) => !r.fgBatch.expiryDate || r.fgBatch.expiryDate >= today)
          .sort(byFirstExpiryFirstOut);

        let outstanding = needed;
        for (const row of eligible) {
          if (outstanding === 0) break;
          const take = Math.min(outstanding, row.quantity - row.reservedQuantity);
          if (take <= 0) continue;
          await tx.orderAllocation.create({
            data: {
              orderId: order.id,
              orderItemId: item.id,
              fgBatchId: row.fgBatchId,
              warehouseId: row.warehouseId,
              quantity: take,
              allocatedById,
            },
          });
          await tx.finishedGoodsStock.update({ where: { id: row.id }, data: { reservedQuantity: { increment: take } } });
          created.push({ orderItemId: item.id, fgBatchNumber: row.fgBatch.fgBatchNumber, quantity: take });
          outstanding -= take;
        }
        if (outstanding > 0) shortfalls.push({ orderItemId: item.id, productId: item.productId, short: outstanding });
      }

      return { orderNumber: order.orderNumber, released, allocations: created, shortfalls, complete: shortfalls.length === 0 };
    });
  }

  /**
   * A delivered item coming back / being refunded. Records the return and, in
   * the SAME transaction, takes back the loyalty points those items earned - so
   * a return and its reversal are all-or-nothing, and neither can be missed.
   *
   * Only DELIVERED orders can have returns (nothing has reached the customer
   * before that), and cumulative returned quantity can never exceed what was
   * ordered.
   */
  async recordReturn(id: string, dto: RecordReturnDto, recordedById: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: { include: { returns: { select: { quantity: true } } } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException(
        `Only a delivered order can have returns (this one is ${order.status}). Cancel it instead.`,
      );
    }

    const wanted = new Map<string, number>();
    for (const line of dto.items) wanted.set(line.orderItemId, (wanted.get(line.orderItemId) ?? 0) + line.quantity);

    for (const [orderItemId, quantity] of wanted) {
      const item = order.items.find((i) => i.id === orderItemId);
      if (!item) throw new BadRequestException(`Item ${orderItemId} is not on order ${order.orderNumber}`);
      const alreadyReturned = item.returns.reduce((n, r) => n + r.quantity, 0);
      if (alreadyReturned + quantity > item.quantity) {
        throw new BadRequestException(
          `Cannot return ${quantity} more: ${alreadyReturned} of ${item.quantity} already returned`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const rows: Prisma.OrderReturnGetPayload<object>[] = [];
      for (const [orderItemId, quantity] of wanted) {
        rows.push(
          await tx.orderReturn.create({
            data: {
              orderId: order.id,
              orderItemId,
              quantity,
              reason: dto.reason,
              // A refund amount is for the whole return; recorded once, on the first line.
              refundAmount: rows.length === 0 ? dto.refundAmount : undefined,
              recordedById,
            },
          }),
        );
      }
      const { pointsReversed } = await this.loyalty.reverseForReturn(tx, order.id, [...wanted.keys()]);
      return { orderNumber: order.orderNumber, returns: rows, loyaltyPointsReversed: pointsReversed };
    });
  }

  /** Cancelling releases every reservation the order was holding. */
  async cancel(id: string, dto: CancelOrderDto) {
    const result = await this.cancelCore(id, dto);
    await this.record(id, 'CANCELLED', undefined, dto.reason);
    return result;
  }

  private async cancelCore(id: string, dto: CancelOrderDto) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      // Live allocations only - a previously released one has already had its
      // reservation returned, and releasing it twice would decrement stock
      // that was never held.
      include: { allocations: { where: { releasedAt: null } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    this.assertTransition(order.status, OrderStatus.CANCELLED);

    return this.prisma.$transaction(async (tx) => {
      for (const allocation of order.allocations) {
        const row = await tx.finishedGoodsStock.findUnique({
          where: {
            warehouseId_fgBatchId: {
              warehouseId: allocation.warehouseId,
              fgBatchId: allocation.fgBatchId,
            },
          },
        });
        if (row) {
          await tx.finishedGoodsStock.update({
            where: { id: row.id },
            data: {
              reservedQuantity: {
                decrement: Math.min(allocation.quantity, row.reservedQuantity),
              },
            },
          });
        }
      }

      /**
       * Released, not deleted (A-13). The reservation is given back above;
       * the row stays so the order can still answer which batches it was
       * promised. Every read of live allocations filters `releasedAt: null`.
       */
      await tx.orderAllocation.updateMany({
        where: { orderId: id, releasedAt: null },
        data: { releasedAt: new Date(), releasedReason: dto.reason ?? 'Order cancelled' },
      });

      // Storefront orders: give back everything the customer put up. All in this
      // transaction, so a half-cancelled order cannot exist.
      await tx.stockReservation.updateMany({ where: { orderId: id, status: 'COMMITTED' }, data: { status: 'RELEASED' } });
      await this.loyalty.refundRedemptionForOrder(tx, id);
      await refundCouponForOrder(tx, id);

      return tx.order.update({
        where: { id },
        data: {
          status: OrderStatus.CANCELLED,
          cancelledReason: dto.reason,
          cancelledAt: new Date(),
        },
      });
    });
  }

  async setPaymentStatus(id: string, dto: UpdatePaymentStatusDto) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');

    return this.prisma.order.update({
      where: { id },
      data: { paymentStatus: dto.paymentStatus },
    });
  }

  /**
   * The farm-to-fork chain for a whole order (FRD 25 + 35).
   *
   * This is the sales-side equivalent of the QR scan on a single pack: for every
   * line, which batches were shipped, and behind each batch, the production run,
   * the raw material batches consumed and the farmers who grew them. It is what
   * lets the client answer a customer complaint with the actual farm rather than
   * a shrug.
   */
  async traceability(orderNumber: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: {
        customer: { select: { customerCode: true, name: true, channel: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        allocations: {
          include: {
            fgBatch: {
              include: {
                productionBatch: {
                  include: {
                    recipe: { select: { recipeCode: true, version: true, name: true } },
                    consumptions: {
                      include: {
                        rawMaterialBatch: {
                          include: {
                            farmer: {
                              select: {
                                id: true,
                                farmerCode: true,
                                fullName: true,
                                village: true,
                                district: true,
                                state: true,
                                gpsLocation: true,
                              },
                            },
                            supplier: {
                              select: {
                                id: true,
                                supplierCode: true,
                                fullName: true,
                                city: true,
                                district: true,
                                state: true,
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!order) throw new NotFoundException(`No order ${orderNumber}`);

    const lines = order.items.map((item) => {
      const allocations = order.allocations.filter((a) => a.orderItemId === item.id);

      return {
        product: item.product,
        quantityOrdered: item.quantity,
        batches: allocations.map((a) => ({
          fgBatchNumber: a.fgBatch.fgBatchNumber,
          quantity: a.quantity,
          manufacturingDate: a.fgBatch.manufacturingDate,
          expiryDate: a.fgBatch.expiryDate,
          productionBatchNumber: a.fgBatch.productionBatch.productionBatchNumber,
          recipe: a.fgBatch.productionBatch.recipe,
          farmers: a.fgBatch.productionBatch.consumptions.map((c) => ({
            farmerCode: c.rawMaterialBatch.farmer?.farmerCode || c.rawMaterialBatch.supplier?.supplierCode || '',
            farmerName: c.rawMaterialBatch.farmer?.fullName || c.rawMaterialBatch.supplier?.fullName || '',
            village: c.rawMaterialBatch.farmer?.village || c.rawMaterialBatch.supplier?.city || '',
            district: c.rawMaterialBatch.farmer?.district || c.rawMaterialBatch.supplier?.district || '',
            state: c.rawMaterialBatch.farmer?.state || c.rawMaterialBatch.supplier?.state || '',
            gpsLocation: c.rawMaterialBatch.farmer?.gpsLocation || '',
            crop: c.rawMaterialBatch.cropName,
            rawBatchNumber: c.rawMaterialBatch.batchNumber,
          })),
        })),
      };
    });

    const farmerCodes = new Set(
      lines.flatMap((l) => l.batches.flatMap((b) => b.farmers.map((f) => f.farmerCode))),
    );

    return {
      order: {
        orderNumber: order.orderNumber,
        channel: order.channel,
        status: order.status,
        orderDate: order.orderDate,
      },
      customer: order.customer,
      lines,
      summary: {
        distinctBatches: new Set(order.allocations.map((a) => a.fgBatchId)).size,
        distinctFarmers: farmerCodes.size,
        fullyTraceable: order.allocations.length > 0 && farmerCodes.size > 0,
      },
    };
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** First expiry, first out. Batches with no expiry sort last. */
function byFirstExpiryFirstOut(
  a: { fgBatch: { expiryDate: Date | null; fgBatchNumber: string } },
  b: { fgBatch: { expiryDate: Date | null; fgBatchNumber: string } },
): number {
  const ax = a.fgBatch.expiryDate;
  const bx = b.fgBatch.expiryDate;
  if (ax && bx) {
    const diff = ax.getTime() - bx.getTime();
    if (diff !== 0) return diff;
  } else if (ax && !bx) {
    return -1;
  } else if (!ax && bx) {
    return 1;
  }
  return a.fgBatch.fgBatchNumber.localeCompare(b.fgBatch.fgBatchNumber);
}
