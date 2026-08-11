import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CustomerStatus,
  OrderStatus,
  PaymentStatus,
  PaymentTerms,
  Prisma,
  SalesChannel,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/sequence.service';
import { PricingService } from '../pricing/pricing.service';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly pricing: PricingService,
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

    if (paymentTerms !== PaymentTerms.PREPAID) {
      await this.assertWithinCreditLimit(customer.id, total);
    }

    return this.prisma.$transaction(async (tx) => {
      const orderNumber = await this.sequence.next(tx, 'SO', orderDate);

      return tx.order.create({
        data: {
          orderNumber,
          channel: customer.channel,
          customerId: customer.id,
          status: OrderStatus.PLACED,
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
  private async assertWithinCreditLimit(customerId: string, orderTotal: number) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');

    if (customer.creditLimit === null || customer.creditLimit === undefined) {
      throw new BadRequestException(
        `${customer.customerCode} is on ${customer.paymentTerms} terms but has no credit limit ` +
          'recorded. Set a limit before taking an order on credit.',
      );
    }

    const openOrders = await this.prisma.order.findMany({
      where: {
        customerId,
        status: { not: OrderStatus.CANCELLED },
        paymentStatus: { not: PaymentStatus.PAID },
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

  async findAll(filters: {
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
    };
    if (filters.from || filters.to) {
      where.orderDate = { gte: filters.from, lte: filters.to };
    }

    return this.prisma.order.findMany({
      where,
      orderBy: { orderDate: 'desc' },
      include: {
        customer: { select: { customerCode: true, name: true, channel: true } },
        items: { select: { productId: true, quantity: true, lineTotal: true } },
      },
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        warehouse: { select: { id: true, name: true, location: true } },
        placedBy: { select: { id: true, fullName: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, unit: true } },
            priceList: { select: { id: true, effectiveFrom: true, minQuantity: true } },
          },
        },
        allocations: {
          include: {
            fgBatch: {
              select: { id: true, fgBatchNumber: true, expiryDate: true, qaReleased: true },
            },
          },
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

  async confirm(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    this.assertTransition(order.status, OrderStatus.CONFIRMED);

    return this.prisma.order.update({
      where: { id },
      data: { status: OrderStatus.CONFIRMED },
    });
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
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true, allocations: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    this.assertTransition(order.status, OrderStatus.ALLOCATED);

    if (order.allocations.length > 0) {
      throw new BadRequestException(
        'This order already has allocations - cancel it and re-place rather than double-allocating',
      );
    }

    const today = startOfDay(new Date());

    return this.prisma.$transaction(async (tx) => {
      const created: Array<{
        orderItemId: string;
        fgBatchNumber: string;
        quantity: number;
        expiryDate: Date | null;
      }> = [];

      for (const item of order.items) {
        const stock = await tx.finishedGoodsStock.findMany({
          where: {
            warehouseId: order.warehouseId,
            fgBatch: { productId: item.productId, qaReleased: true },
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

        const availableTotal = eligible.reduce(
          (sum, s) => sum + (s.quantity - s.reservedQuantity),
          0,
        );

        if (availableTotal < item.quantity) {
          const product = await tx.product.findUnique({
            where: { id: item.productId },
            select: { name: true, sku: true },
          });
          throw new BadRequestException(
            `Not enough QA-released stock for ${product?.name ?? item.productId}` +
              `${product ? ` (${product.sku})` : ''}: ${item.quantity} packs needed, ` +
              `${availableTotal} available in this warehouse`,
          );
        }

        let outstanding = item.quantity;
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

      const updated = await tx.order.update({
        where: { id },
        data: { status: OrderStatus.ALLOCATED },
      });

      return { order: updated, allocations: created };
    });
  }

  /**
   * Move the order along the fulfilment chain.
   *
   * Dispatch is the point at which reserved stock actually leaves: both the
   * held quantity and the on-hand quantity come down together, so a warehouse
   * count and the system agree the moment the vehicle goes.
   */
  async advance(id: string, to: OrderStatus) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { allocations: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    this.assertTransition(order.status, to);

    if (to !== OrderStatus.DISPATCHED) {
      return this.prisma.order.update({ where: { id }, data: { status: to } });
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
      }

      return tx.order.update({ where: { id }, data: { status: OrderStatus.DISPATCHED } });
    });
  }

  /** Cancelling releases every reservation the order was holding. */
  async cancel(id: string, dto: CancelOrderDto) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { allocations: true },
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

      await tx.orderAllocation.deleteMany({ where: { orderId: id } });

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
                                farmerCode: true,
                                fullName: true,
                                village: true,
                                district: true,
                                state: true,
                                gpsLocation: true,
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
            farmerCode: c.rawMaterialBatch.farmer.farmerCode,
            farmerName: c.rawMaterialBatch.farmer.fullName,
            village: c.rawMaterialBatch.farmer.village,
            district: c.rawMaterialBatch.farmer.district,
            state: c.rawMaterialBatch.farmer.state,
            gpsLocation: c.rawMaterialBatch.farmer.gpsLocation,
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
