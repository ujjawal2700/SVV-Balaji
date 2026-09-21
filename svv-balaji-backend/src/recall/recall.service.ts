import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BatchHoldStatus, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { fifoViolations } from './fifo';

const SHIPPED: OrderStatus[] = [OrderStatus.DISPATCHED, OrderStatus.DELIVERED];

interface Shipment {
  orderNumber: string;
  shipped: boolean;
  quantity: number;
  customer: { customerCode: string };
}

/**
 * Forward/backward traceability and recall control (Super Admin & QA audit).
 * Forward: batch or raw lot -> every order that received it.
 * Backward: pack -> machine, milling loss, raw lots, weighing slip, payout.
 */
@Injectable()
export class RecallService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- forward

  async forward(rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    const isRaw = code.startsWith('RM-');
    if (!isRaw && !code.startsWith('FG-')) {
      throw new BadRequestException('Enter a finished goods batch (FG-…) or raw material lot (RM-…)');
    }

    const where: Prisma.FinishedGoodsBatchWhereInput = isRaw
      ? { productionBatch: { consumptions: { some: { rawMaterialBatch: { batchNumber: code } } } } }
      : { fgBatchNumber: code };

    const batches = await this.prisma.finishedGoodsBatch.findMany({
      where,
      orderBy: { manufacturingDate: 'asc' },
      include: {
        product: { select: { name: true, sku: true } },
        stock: { include: { warehouse: { select: { name: true } } } },
        // Live allocations only: a cancelled order gave its reservation back.
        allocations: {
          where: { releasedAt: null },
          orderBy: { createdAt: 'asc' },
          include: {
            warehouse: { select: { name: true } },
            order: {
              select: {
                id: true,
                orderNumber: true,
                status: true,
                channel: true,
                orderDate: true,
                dispatchedAt: true,
                customer: { select: { customerCode: true, name: true, phone: true } },
              },
            },
          },
        },
      },
    });

    if (batches.length === 0) {
      if (!isRaw) throw new NotFoundException(`No finished goods batch ${code}`);
      const lot = await this.prisma.rawMaterialBatch.findUnique({ where: { batchNumber: code } });
      if (!lot) throw new NotFoundException(`No raw material lot ${code}`);
    }

    const result = batches.map((b) => ({
      fgBatchNumber: b.fgBatchNumber,
      product: b.product,
      holdStatus: b.holdStatus,
      holdReason: b.holdReason,
      qaReleased: b.qaReleased,
      manufacturingDate: b.manufacturingDate,
      expiryDate: b.expiryDate,
      packCount: b.packCount,
      stock: b.stock.map((s) => ({
        warehouse: s.warehouse.name,
        quantity: s.quantity,
        reserved: s.reservedQuantity,
      })),
      shipments: b.allocations.map((a) => ({
        orderId: a.order.id,
        orderNumber: a.order.orderNumber,
        orderStatus: a.order.status,
        channel: a.order.channel,
        orderDate: a.order.orderDate,
        dispatchedAt: a.order.dispatchedAt,
        shipped: SHIPPED.includes(a.order.status),
        quantity: a.quantity,
        warehouse: a.warehouse.name,
        customer: a.order.customer,
      })),
    }));

    return {
      query: code,
      kind: isRaw ? ('RAW' as const) : ('FG' as const),
      batches: result,
      totals: this.totals(result),
    };
  }

  private totals(batches: Array<{ stock: Array<{ quantity: number }>; shipments: Shipment[] }>) {
    const shipments = batches.flatMap((b) => b.shipments);
    return {
      batches: batches.length,
      orders: new Set(shipments.map((s) => s.orderNumber)).size,
      customers: new Set(shipments.map((s) => s.customer.customerCode)).size,
      packsShipped: shipments.filter((s) => s.shipped).reduce((n, s) => n + s.quantity, 0),
      packsAllocatedNotShipped: shipments.filter((s) => !s.shipped).reduce((n, s) => n + s.quantity, 0),
      packsInStock: batches.flatMap((b) => b.stock).reduce((n, s) => n + s.quantity, 0),
    };
  }

  // --------------------------------------------------------------- backward

  async backward(rawCode: string) {
    const fgBatchNumber = rawCode.trim().toUpperCase();
    const batch = await this.prisma.finishedGoodsBatch.findUnique({
      where: { fgBatchNumber },
      include: {
        product: { select: { name: true, sku: true } },
        packedBy: { select: { fullName: true } },
        productionBatch: {
          include: {
            branch: { select: { name: true } },
            createdBy: { select: { fullName: true } },
            consumptions: {
              include: {
                rawMaterialBatch: {
                  include: {
                    farmer: { select: { farmerCode: true, fullName: true, village: true, district: true } },
                    supplier: { select: { supplierCode: true, fullName: true, city: true, district: true } },
                    collection: {
                      select: {
                        receiptNumber: true,
                        collectionDate: true,
                        grossWeight: true,
                        netWeight: true,
                        totalAmount: true,
                        paymentStatus: true,
                      },
                    },
                    supplierTransport: {
                      select: { receiptNumber: true, totalAmount: true, paymentStatus: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!batch) throw new NotFoundException(`No finished goods batch ${fgBatchNumber}`);

    const pb = batch.productionBatch;
    const planned = Number(pb.plannedQuantity);
    const lossPercent =
      pb.productionLoss !== null && planned > 0
        ? Math.round((Number(pb.productionLoss) / planned) * 10000) / 100
        : null;

    return {
      fgBatchNumber: batch.fgBatchNumber,
      product: batch.product,
      holdStatus: batch.holdStatus,
      holdReason: batch.holdReason,
      packing: {
        packedOn: batch.packagingDate,
        packedBy: batch.packedBy.fullName,
        packagingType: batch.packagingType,
      },
      production: {
        productionBatchNumber: pb.productionBatchNumber,
        productionDate: pb.productionDate,
        branch: pb.branch.name,
        machine: [pb.machineName, pb.machineNumber].filter(Boolean).join(' ') || null,
        productionLine: pb.productionLine,
        operator: pb.operatorName,
        supervisor: pb.createdBy.fullName,
        plannedQuantity: planned,
        actualQuantity: pb.actualQuantity === null ? null : Number(pb.actualQuantity),
        lossQuantity: pb.productionLoss === null ? null : Number(pb.productionLoss),
        lossPercent,
      },
      rawLots: pb.consumptions.map((c) => {
        const r = c.rawMaterialBatch;
        const slip = r.collection ?? r.supplierTransport;
        return {
          batchNumber: r.batchNumber,
          crop: r.cropName,
          quantityUsed: Number(c.quantityUsed),
          source: r.farmer
            ? {
                type: 'FARMER' as const,
                code: r.farmer.farmerCode,
                name: r.farmer.fullName,
                place: `${r.farmer.village}, ${r.farmer.district}`,
              }
            : r.supplier
              ? {
                  type: 'SUPPLIER' as const,
                  code: r.supplier.supplierCode,
                  name: r.supplier.fullName,
                  place: [r.supplier.city, r.supplier.district].filter(Boolean).join(', '),
                }
              : null,
          weighingSlip: r.collection
            ? {
                receiptNumber: r.collection.receiptNumber,
                date: r.collection.collectionDate,
                grossWeight: Number(r.collection.grossWeight),
                netWeight: Number(r.collection.netWeight),
              }
            : null,
          payout: slip
            ? {
                receiptNumber: slip.receiptNumber,
                totalAmount: slip.totalAmount === null ? null : Number(slip.totalAmount),
                paymentStatus: slip.paymentStatus,
              }
            : null,
        };
      }),
      fifo: await this.fifo(batch),
      holdHistory: await this.prisma.batchHoldEvent.findMany({
        where: { fgBatchId: batch.id },
        orderBy: { createdAt: 'desc' },
        select: {
          fromStatus: true,
          toStatus: true,
          reason: true,
          createdAt: true,
          performedBy: { select: { fullName: true } },
        },
      }),
    };
  }

  /**
   * Was first-expiry-first-out respected for this batch?
   *
   * Approximate by construction: it compares against stock on the shelf NOW,
   * not a replay of the shelf on the dispatch day. A "violation" is an older,
   * still-sellable batch that is still there while this one left the same
   * warehouse. `checked: false` = nothing has shipped yet, nothing to verify.
   */
  private async fifo(batch: {
    id: string;
    productId: string;
    fgBatchNumber: string;
    manufacturingDate: Date;
    expiryDate: Date | null;
  }) {
    const allocations = await this.prisma.orderAllocation.findMany({
      where: { fgBatchId: batch.id, releasedAt: null, order: { status: { in: SHIPPED } } },
      select: { warehouseId: true },
    });
    if (allocations.length === 0) {
      return { checked: false, compliant: null as boolean | null, violations: [] as FifoViolation[] };
    }

    const stock = await this.prisma.finishedGoodsStock.findMany({
      where: {
        warehouseId: { in: [...new Set(allocations.map((a) => a.warehouseId))] },
        quantity: { gt: 0 },
        fgBatch: {
          productId: batch.productId,
          qaReleased: true,
          holdStatus: BatchHoldStatus.ACTIVE,
          OR: [{ expiryDate: null }, { expiryDate: { gt: new Date() } }],
        },
      },
      include: {
        fgBatch: { select: { fgBatchNumber: true, manufacturingDate: true, expiryDate: true } },
        warehouse: { select: { name: true } },
      },
    });

    const violations: FifoViolation[] = stock
      .filter((s) => fifoViolations(batch, [s.fgBatch]).length > 0)
      .map((s) => ({
        warehouse: s.warehouse.name,
        olderBatch: s.fgBatch.fgBatchNumber,
        expiryDate: s.fgBatch.expiryDate,
        quantityRemaining: s.quantity,
      }));
    return { checked: true, compliant: violations.length === 0, violations };
  }

  // ------------------------------------------------------------- hold/recall

  /**
   * Freeze, recall or release. RECALLED is terminal (a recalled batch that can
   * be quietly re-released is not a recall); a batch already in the requested
   * status is skipped, not re-logged. One transaction, so a 40-batch recall
   * cannot half-apply.
   */
  async setHold(fgBatchNumbers: string[], status: BatchHoldStatus, reason: string, performedById: string) {
    const numbers = [...new Set(fgBatchNumbers.map((n) => n.trim().toUpperCase()))];
    return this.prisma.$transaction(async (tx) => {
      const batches = await tx.finishedGoodsBatch.findMany({ where: { fgBatchNumber: { in: numbers } } });
      const missing = numbers.filter((n) => !batches.some((b) => b.fgBatchNumber === n));
      if (missing.length) throw new NotFoundException(`No finished goods batch: ${missing.join(', ')}`);

      const locked = batches.filter(
        (b) => b.holdStatus === BatchHoldStatus.RECALLED && status !== BatchHoldStatus.RECALLED,
      );
      if (locked.length) {
        throw new BadRequestException(
          `Recalled batches cannot be released or held again: ${locked.map((b) => b.fgBatchNumber).join(', ')}`,
        );
      }

      const changing = batches.filter((b) => b.holdStatus !== status);
      for (const b of changing) {
        await tx.finishedGoodsBatch.update({
          where: { id: b.id },
          data: {
            holdStatus: status,
            holdReason: status === BatchHoldStatus.ACTIVE ? null : reason,
            holdChangedAt: new Date(),
          },
        });
        await tx.batchHoldEvent.create({
          data: { fgBatchId: b.id, fromStatus: b.holdStatus, toStatus: status, reason, performedById },
        });
      }
      return {
        status,
        changed: changing.map((b) => b.fgBatchNumber),
        unchanged: batches.filter((b) => b.holdStatus === status).map((b) => b.fgBatchNumber),
      };
    });
  }
}

export interface FifoViolation {
  warehouse: string;
  olderBatch: string;
  expiryDate: Date | null;
  quantityRemaining: number;
}
