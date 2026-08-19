import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';

@Injectable()
export class CollectionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records collection of an approved harvest and mints its raw material batch
   * (FRD 14 + 15). This is the single point where the traceability chain
   * extends Farmer -> Collection -> RawMaterialBatch, so everything happens in
   * one transaction: partial state here would orphan stock from its farmer.
   */
  async create(dto: CreateCollectionDto, collectedById: string) {
    if (dto.netWeight > dto.grossWeight) {
      throw new BadRequestException('netWeight cannot exceed grossWeight');
    }

    const inspection = await this.prisma.harvestInspection.findUnique({
      where: { id: dto.inspectionId },
      include: { collection: true, agreement: true, farmer: true },
    });

    if (!inspection) throw new NotFoundException('Harvest inspection not found');

    // FRD 13.5 - only approved harvests may proceed to collection.
    if (inspection.result !== 'APPROVED') {
      throw new BadRequestException(
        `Only APPROVED inspections can be collected (this one is ${inspection.result})`,
      );
    }

    if (inspection.collection) {
      throw new BadRequestException(
        `This harvest was already collected (receipt ${inspection.collection.receiptNumber})`,
      );
    }

    // Rate precedence: explicit override, else the pre-season agreed rate.
    const purchaseRate = dto.purchaseRate ?? Number(inspection.agreement?.purchaseRate);
    if (purchaseRate === undefined || Number.isNaN(purchaseRate)) {
      throw new BadRequestException(
        'No purchaseRate supplied and no agreement rate available to fall back on',
      );
    }

    const collectionDate = new Date(dto.collectionDate);
    const totalAmount = Number((dto.netWeight * purchaseRate).toFixed(2));

    if (dto.warehouseId) {
      const warehouse = await this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } });
      if (!warehouse) throw new NotFoundException('Warehouse not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const receiptNumber = await this.generateReceiptNumber(tx, collectionDate);
      const batchNumber = await this.generateBatchNumber(tx, collectionDate);

      const collection = await tx.rawMaterialCollection.create({
        data: {
          inspectionId: inspection.id,
          farmerId: inspection.farmerId,
          branchId: dto.branchId,
          cropName: inspection.cropName,
          /**
           * Carried forward from the inspection rather than accepted as input.
           * Which field a harvest came from was decided in the field, by the
           * person standing in it - the weighbridge operator is in no position
           * to know, and letting them override it would put a second, worse
           * answer into the traceability chain.
           *
           * `dto.plotId` deliberately does not exist for this reason.
           */
          plotId: inspection.plotId,
          collectionDate,
          collectionLocation: dto.collectionLocation,
          grossWeight: dto.grossWeight,
          netWeight: dto.netWeight,
          unit: dto.unit ?? 'KG',
          purchaseRate,
          totalAmount,
          receiptNumber,
          collectedById,
        },
      });

      const batch = await tx.rawMaterialBatch.create({
        data: {
          batchNumber,
          collectionId: collection.id,
          farmerId: inspection.farmerId,
          branchId: dto.branchId,
          cropName: inspection.cropName,
          quantity: dto.netWeight,
          unit: dto.unit ?? 'KG',
          status: dto.warehouseId ? 'STORED' : 'COLLECTED',
          warehouseId: dto.warehouseId,
        },
      });

      // If a warehouse was named, book the stock in and log the movement now,
      // so the ledger and the on-hand balance are consistent from the start.
      if (dto.warehouseId) {
        await tx.warehouseStock.create({
          data: {
            warehouseId: dto.warehouseId,
            batchId: batch.id,
            quantity: dto.netWeight,
            unit: dto.unit ?? 'KG',
          },
        });

        await tx.stockMovement.create({
          data: {
            batchId: batch.id,
            toWarehouseId: dto.warehouseId,
            movementType: 'STOCK_IN',
            quantity: dto.netWeight,
            unit: dto.unit ?? 'KG',
            reason: `Initial receipt from collection ${receiptNumber}`,
            performedById: collectedById,
          },
        });
      }

      return { ...collection, batch };
    });
  }

  /**
   * FRD 15.1 format: RM-YYYYMMDD-NNN, sequential per day.
   * Atomic increment on a per-day counter row - same pattern as the farmer
   * code, so two collections on the same day can never share a batch number.
   */
  private async generateBatchNumber(
    tx: Prisma.TransactionClient,
    date: Date,
  ): Promise<string> {
    const dateKey = this.toDateKey(date);

    const existing = await tx.batchNumberCounter.findUnique({ where: { dateKey } });
    if (!existing) {
      await tx.batchNumberCounter.create({ data: { dateKey, lastNumber: 0 } });
    }

    const updated = await tx.batchNumberCounter.update({
      where: { dateKey },
      data: { lastNumber: { increment: 1 } },
    });

    return `RM-${dateKey}-${String(updated.lastNumber).padStart(3, '0')}`;
  }

  /** Receipt numbers share the daily sequence space but carry an RC- prefix. */
  private async generateReceiptNumber(
    tx: Prisma.TransactionClient,
    date: Date,
  ): Promise<string> {
    const dateKey = this.toDateKey(date);
    const count = await tx.rawMaterialCollection.count({
      where: { receiptNumber: { startsWith: `RC-${dateKey}-` } },
    });
    return `RC-${dateKey}-${String(count + 1).padStart(3, '0')}`;
  }

  /** Date -> YYYYMMDD integer, using local date parts (not UTC). */
  private toDateKey(date: Date): number {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return Number(`${y}${m}${d}`);
  }

  findAll(farmerId?: string, branchId?: string) {
    return this.prisma.rawMaterialCollection.findMany({
      where: { farmerId, branchId },
      orderBy: { collectionDate: 'desc' },
      include: {
        farmer: { select: { id: true, fullName: true, farmerCode: true } },
        batch: { select: { id: true, batchNumber: true, status: true } },
        collectedBy: { select: { id: true, fullName: true } },
      },
    });
  }

  async findOne(id: string) {
    const collection = await this.prisma.rawMaterialCollection.findUnique({
      where: { id },
      include: {
        farmer: { select: { id: true, fullName: true, farmerCode: true, village: true } },
        branch: { select: { id: true, name: true } },
        inspection: true,
        batch: true,
        collectedBy: { select: { id: true, fullName: true } },
      },
    });
    if (!collection) throw new NotFoundException('Collection not found');
    return collection;
  }

  async updatePaymentStatus(id: string, paymentStatus: 'PENDING' | 'PARTIAL' | 'PAID') {
    const collection = await this.prisma.rawMaterialCollection.findUnique({ where: { id } });
    if (!collection) throw new NotFoundException('Collection not found');
    return this.prisma.rawMaterialCollection.update({
      where: { id },
      data: { paymentStatus },
    });
  }

  // --- Batch queries (FRD 15.2 / 15.3) -------------------------------------

  findBatches(filters: { farmerId?: string; status?: any; warehouseId?: string }) {
    return this.prisma.rawMaterialBatch.findMany({
      where: filters,
      orderBy: { createdAt: 'desc' },
      include: {
        farmer: { select: { id: true, fullName: true, farmerCode: true } },
        warehouse: { select: { id: true, name: true } },
        // The batches screen offers Correct and Delete, and both act on the
        // collection rather than the batch - a batch has no figures of its own,
        // it inherits them. Including the collection here means that screen can
        // open the correction form without a second round trip per row.
        collection: {
          select: {
            id: true,
            receiptNumber: true,
            collectionDate: true,
            collectionLocation: true,
            grossWeight: true,
            netWeight: true,
            unit: true,
            purchaseRate: true,
            totalAmount: true,
            paymentStatus: true,
          },
        },
      },
    });
  }

  /**
   * Full upstream trace for a batch (FRD 15.3). Answers "which farmer, which
   * field visit, which inspection produced this?" - the question the QR code
   * on a finished pack ultimately resolves to.
   */
  async traceBatch(batchNumber: string) {
    const batch = await this.prisma.rawMaterialBatch.findUnique({
      where: { batchNumber },
      include: {
        farmer: {
          select: {
            id: true,
            fullName: true,
            farmerCode: true,
            village: true,
            district: true,
            state: true,
            gpsLocation: true,
          },
        },
        branch: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true } },
        collection: { include: { inspection: { include: { documents: true } } } },
        stockMovements: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!batch) throw new NotFoundException(`No batch found with number ${batchNumber}`);
    return batch;
  }

  // --- Correcting and reversing a collection -------------------------------

  /**
   * A collection is only correctable while its batch is untouched.
   *
   * "Untouched" means: the batch has not been cleaned, graded, quality
   * inspected or consumed by production, and its only stock movement is the
   * initial receipt. Once any of those exist, the batch quantity is a number
   * other records have already been derived from - a cleaning yield, a
   * production consumption - and changing it would silently invalidate them.
   *
   * Within that window the net weight is genuinely correctable, and correcting
   * it has to reach further than the collection row: the batch quantity, the
   * warehouse stock line and the ledger all carry the same figure. Doing that
   * in one transaction, with an ADJUSTMENT movement recording the difference,
   * is what keeps the running balance and the audit trail from drifting apart -
   * the invariant this whole module is built around.
   */
  async update(id: string, dto: UpdateCollectionDto, performedById: string) {
    const collection = await this.prisma.rawMaterialCollection.findUnique({
      where: { id },
      include: { batch: true },
    });
    if (!collection) throw new NotFoundException('Collection not found');

    const batch = collection.batch;
    if (batch) await this.assertBatchUntouched(batch.id, batch.batchNumber);

    const grossWeight = dto.grossWeight ?? Number(collection.grossWeight);
    const netWeight = dto.netWeight ?? Number(collection.netWeight);
    const purchaseRate = dto.purchaseRate ?? Number(collection.purchaseRate);
    const unit = dto.unit ?? collection.unit;

    if (netWeight > grossWeight) {
      throw new BadRequestException('netWeight cannot exceed grossWeight');
    }

    const totalAmount = Number((netWeight * purchaseRate).toFixed(2));
    const previousNet = Number(collection.netWeight);
    const delta = Number((netWeight - previousNet).toFixed(2));

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.rawMaterialCollection.update({
        where: { id },
        data: {
          grossWeight,
          netWeight,
          purchaseRate,
          unit,
          totalAmount,
          collectionLocation: dto.collectionLocation,
        },
      });

      if (batch && (delta !== 0 || unit !== batch.unit)) {
        await tx.rawMaterialBatch.update({
          where: { id: batch.id },
          data: { quantity: netWeight, unit },
        });

        // Only warehoused batches have a stock line to keep in step. A batch
        // still sitting at COLLECTED has none, and creating one here would
        // invent stock in a warehouse nobody nominated.
        if (batch.warehouseId && delta !== 0) {
          const stock = await tx.warehouseStock.findFirst({
            where: { warehouseId: batch.warehouseId, batchId: batch.id },
          });

          if (stock) {
            await tx.warehouseStock.update({
              where: { id: stock.id },
              data: { quantity: netWeight, unit },
            });

            await tx.stockMovement.create({
              data: {
                batchId: batch.id,
                toWarehouseId: delta > 0 ? batch.warehouseId : undefined,
                fromWarehouseId: delta < 0 ? batch.warehouseId : undefined,
                movementType: 'ADJUSTMENT',
                quantity: Math.abs(delta),
                unit,
                reason:
                  `Collection ${collection.receiptNumber} corrected: net weight ` +
                  `${previousNet} -> ${netWeight} ${unit}` +
                  (dto.correctionReason ? `. ${dto.correctionReason}` : ''),
                performedById,
              },
            });
          }
        }
      }

      return tx.rawMaterialCollection.findUnique({
        where: { id: updated.id },
        include: {
          farmer: { select: { id: true, fullName: true, farmerCode: true } },
          batch: { select: { id: true, batchNumber: true, status: true } },
          collectedBy: { select: { id: true, fullName: true } },
        },
      });
    });
  }

  /**
   * Reversing a collection recorded in error.
   *
   * Takes the batch, its stock line and its receipt movement with it, in one
   * transaction - a batch without its collection has no farmer path and would
   * sit in the warehouse untraceable, which is worse than either record.
   *
   * The receipt number is NOT reused. `generateReceiptNumber` counts existing
   * receipts for the day, so deleting one makes the next collection reuse its
   * number - two different farmers, two different payments, one receipt
   * number, and no way to tell them apart afterwards. That is a real bug in
   * the counter rather than in this method (`SequenceService` beside it does
   * this correctly), so the deletion is refused when a later receipt exists
   * for the same day until it is fixed.
   */
  async remove(id: string) {
    const collection = await this.prisma.rawMaterialCollection.findUnique({
      where: { id },
      include: { batch: true },
    });
    if (!collection) throw new NotFoundException('Collection not found');

    if (collection.paymentStatus !== 'PENDING') {
      throw new BadRequestException(
        `This collection is marked ${collection.paymentStatus}. The farmer has been paid ` +
          `against receipt ${collection.receiptNumber}, so deleting it would leave a payment ` +
          `with nothing to reconcile against.`,
      );
    }

    if (collection.batch) {
      await this.assertBatchUntouched(collection.batch.id, collection.batch.batchNumber);
    }

    const datePart = collection.receiptNumber.split('-')[1];
    const laterSameDay = await this.prisma.rawMaterialCollection.count({
      where: {
        receiptNumber: { startsWith: `RC-${datePart}-`, gt: collection.receiptNumber },
      },
    });
    if (laterSameDay > 0) {
      throw new BadRequestException(
        `${laterSameDay} later collection${laterSameDay === 1 ? ' was' : 's were'} recorded on ` +
          `the same day. Receipt numbers are issued by counting the day's receipts, so removing ` +
          `${collection.receiptNumber} would make the next one reuse it. Cancel this collection ` +
          `by other means, or ask for the receipt counter to be fixed first.`,
      );
    }

    const batchId = collection.batch?.id;

    await this.prisma.$transaction(async (tx) => {
      if (batchId) {
        await tx.stockMovement.deleteMany({ where: { batchId } });
        await tx.warehouseStock.deleteMany({ where: { batchId } });
        await tx.rawMaterialBatch.delete({ where: { id: batchId } });
      }
      await tx.rawMaterialCollection.delete({ where: { id } });
    });

    return { id, deleted: true, batchDeleted: collection.batch?.batchNumber ?? null };
  }

  /**
   * The shared "nothing downstream has used this yet" check.
   *
   * A single stock movement beyond the initial receipt counts as touched: it
   * means the batch has been issued, transferred or counted, and the quantity
   * on the collection is no longer the only record of it.
   */
  private async assertBatchUntouched(batchId: string, batchNumber: string) {
    const [cleaning, consumption, inspections, movements] = await this.prisma.$transaction([
      this.prisma.cleaningGradingRecord.count({ where: { rawMaterialBatchId: batchId } }),
      this.prisma.productionConsumption.count({ where: { rawMaterialBatchId: batchId } }),
      this.prisma.qualityInspection.count({ where: { rawMaterialBatchId: batchId } }),
      this.prisma.stockMovement.count({ where: { batchId } }),
    ]);

    const blockers: string[] = [];
    if (cleaning > 0) blockers.push(`${cleaning} cleaning/grading record${cleaning === 1 ? '' : 's'}`);
    if (consumption > 0) blockers.push(`${consumption} production consumption${consumption === 1 ? '' : 's'}`);
    if (inspections > 0) blockers.push(`${inspections} quality inspection${inspections === 1 ? '' : 's'}`);
    if (movements > 1) blockers.push(`${movements - 1} stock movement${movements - 1 === 1 ? '' : 's'} since receipt`);

    if (blockers.length > 0) {
      throw new BadRequestException(
        `Batch ${batchNumber} has already been used - ${blockers.join(', ')}. Its quantity is ` +
          `now the basis of records downstream, so the collection figures are fixed. Use a stock ` +
          `adjustment on the warehouse screen if the physical count differs.`,
      );
    }
  }
}
