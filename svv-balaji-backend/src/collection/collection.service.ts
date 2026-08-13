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

  async updateCollection(id: string, dto: UpdateCollectionDto) {
    const collection = await this.prisma.rawMaterialCollection.findUnique({ 
      where: { id }, 
      include: { batch: true } 
    });
    if (!collection) throw new NotFoundException('Collection not found');

    const data: any = { ...dto };
    if (dto.collectionDate) data.collectionDate = new Date(dto.collectionDate);

    if (dto.netWeight !== undefined || dto.purchaseRate !== undefined) {
      const netWeight = Number(dto.netWeight ?? collection.netWeight);
      const purchaseRate = Number(dto.purchaseRate ?? collection.purchaseRate);
      data.totalAmount = Number((netWeight * purchaseRate).toFixed(2));
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.rawMaterialCollection.update({ where: { id }, data });
      if (dto.netWeight !== undefined && collection.batch) {
        await tx.rawMaterialBatch.update({ 
          where: { id: collection.batch.id }, 
          data: { quantity: dto.netWeight } 
        });
      }
      return updated;
    });
  }

  async deleteCollection(id: string) {
    const collection = await this.prisma.rawMaterialCollection.findUnique({
      where: { id },
      include: { batch: { include: { stockMovements: true } } }
    });
    if (!collection) throw new NotFoundException('Collection not found');

    if (collection.batch?.stockMovements && collection.batch.stockMovements.length > 1) {
       throw new BadRequestException('Cannot delete collection: batch has subsequent stock movements');
    }

    return this.prisma.$transaction(async (tx) => {
       if (collection.batch) {
         await tx.stockMovement.deleteMany({ where: { batchId: collection.batch.id } });
         await tx.warehouseStock.deleteMany({ where: { batchId: collection.batch.id } });
         await tx.rawMaterialBatch.delete({ where: { id: collection.batch.id } });
       }
       return tx.rawMaterialCollection.delete({ where: { id } });
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
}
