import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdjustStockDto,
  CreateWarehouseDto,
  StockInDto,
  StockOutDto,
  TransferStockDto,
} from './dto/warehouse.dto';

/**
 * Warehouse + inventory ledger (FRD Sections 16-17).
 *
 * Invariant held throughout: WarehouseStock.quantity is only ever mutated
 * inside a transaction that also writes a StockMovement row. That keeps the
 * running balance and the audit trail from drifting apart - the thing that
 * makes inventory discrepancies impossible to investigate after the fact.
 */
@Injectable()
export class WarehouseService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Warehouse master ----------------------------------------------------

  create(dto: CreateWarehouseDto) {
    return this.prisma.warehouse.create({ data: dto });
  }

  findAll(branchId?: string) {
    return this.prisma.warehouse.findMany({
      where: { branchId, isActive: true },
      orderBy: { name: 'asc' },
      include: { branch: { select: { id: true, name: true } } },
    });
  }

  /** FRD 16.6 - live occupancy against capacity. */
  async status(warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      include: { stock: true },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    const occupied = warehouse.stock.reduce((sum, s) => sum + Number(s.quantity), 0);
    const capacity = warehouse.capacity ? Number(warehouse.capacity) : null;

    return {
      warehouseId: warehouse.id,
      name: warehouse.name,
      capacity,
      occupied,
      available: capacity !== null ? Number((capacity - occupied).toFixed(2)) : null,
      utilisationPercent:
        capacity && capacity > 0 ? Number(((occupied / capacity) * 100).toFixed(2)) : null,
      distinctBatches: warehouse.stock.length,
    };
  }

  // --- Stock queries (FRD 16.7 / 17.1) -------------------------------------

  findStock(warehouseId?: string, batchId?: string) {
    return this.prisma.warehouseStock.findMany({
      where: { warehouseId, batchId },
      orderBy: { updatedAt: 'desc' },
      include: {
        warehouse: { select: { id: true, name: true } },
        batch: {
          select: {
            id: true,
            batchNumber: true,
            cropName: true,
            status: true,
            farmer: { select: { id: true, fullName: true, farmerCode: true } },
          },
        },
      },
    });
  }

  /** FRD 17.4 - batches at or below the given threshold. */
  async lowStock(threshold: number, warehouseId?: string) {
    const rows = await this.prisma.warehouseStock.findMany({
      where: { warehouseId, quantity: { lte: threshold } },
      include: {
        warehouse: { select: { id: true, name: true } },
        batch: { select: { id: true, batchNumber: true, cropName: true } },
      },
      orderBy: { quantity: 'asc' },
    });
    return { threshold, count: rows.length, items: rows };
  }

  findMovements(batchId?: string, warehouseId?: string) {
    const where: Prisma.StockMovementWhereInput = { batchId };
    if (warehouseId) {
      where.OR = [{ fromWarehouseId: warehouseId }, { toWarehouseId: warehouseId }];
    }
    return this.prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        batch: { select: { id: true, batchNumber: true } },
        performedBy: { select: { id: true, fullName: true } },
      },
    });
  }

  // --- Stock mutations -----------------------------------------------------

  /** FRD 16.1 - book stock into a warehouse. */
  async stockIn(warehouseId: string, dto: StockInDto, performedById: string) {
    await this.assertWarehouse(warehouseId);
    await this.assertBatch(dto.batchId);

    return this.prisma.$transaction(async (tx) => {
      const stock = await tx.warehouseStock.upsert({
        where: { warehouseId_batchId: { warehouseId, batchId: dto.batchId } },
        update: {
          quantity: { increment: dto.quantity },
          storageLocation: dto.storageLocation,
        },
        create: {
          warehouseId,
          batchId: dto.batchId,
          quantity: dto.quantity,
          storageLocation: dto.storageLocation,
        },
      });

      await tx.stockMovement.create({
        data: {
          batchId: dto.batchId,
          toWarehouseId: warehouseId,
          movementType: 'STOCK_IN',
          quantity: dto.quantity,
          reason: dto.reason,
          performedById,
        },
      });

      await tx.rawMaterialBatch.update({
        where: { id: dto.batchId },
        data: { status: 'STORED', warehouseId },
      });

      return stock;
    });
  }

  /** FRD 17.3 - remove stock (consumption, wastage, dispatch). */
  async stockOut(warehouseId: string, dto: StockOutDto, performedById: string) {
    const stock = await this.prisma.warehouseStock.findUnique({
      where: { warehouseId_batchId: { warehouseId, batchId: dto.batchId } },
    });
    if (!stock) throw new NotFoundException('No stock for that batch in this warehouse');

    const available = Number(stock.quantity) - Number(stock.reservedQuantity);
    if (dto.quantity > available) {
      throw new BadRequestException(
        `Insufficient unreserved stock: requested ${dto.quantity}, available ${available}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.warehouseStock.update({
        where: { warehouseId_batchId: { warehouseId, batchId: dto.batchId } },
        data: { quantity: { decrement: dto.quantity } },
      });

      await tx.stockMovement.create({
        data: {
          batchId: dto.batchId,
          fromWarehouseId: warehouseId,
          movementType: 'STOCK_OUT',
          quantity: dto.quantity,
          reason: dto.reason,
          performedById,
        },
      });

      return updated;
    });
  }

  /** FRD 16.4 - move stock between warehouses, preserving batch identity. */
  async transfer(dto: TransferStockDto, performedById: string) {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException('Source and destination warehouses must differ');
    }
    await this.assertWarehouse(dto.fromWarehouseId);
    await this.assertWarehouse(dto.toWarehouseId);

    const source = await this.prisma.warehouseStock.findUnique({
      where: {
        warehouseId_batchId: { warehouseId: dto.fromWarehouseId, batchId: dto.batchId },
      },
    });
    if (!source) throw new NotFoundException('No stock for that batch in the source warehouse');

    const available = Number(source.quantity) - Number(source.reservedQuantity);
    if (dto.quantity > available) {
      throw new BadRequestException(
        `Insufficient unreserved stock to transfer: requested ${dto.quantity}, available ${available}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.warehouseStock.update({
        where: {
          warehouseId_batchId: { warehouseId: dto.fromWarehouseId, batchId: dto.batchId },
        },
        data: { quantity: { decrement: dto.quantity } },
      });

      await tx.warehouseStock.upsert({
        where: {
          warehouseId_batchId: { warehouseId: dto.toWarehouseId, batchId: dto.batchId },
        },
        update: { quantity: { increment: dto.quantity } },
        create: {
          warehouseId: dto.toWarehouseId,
          batchId: dto.batchId,
          quantity: dto.quantity,
        },
      });

      const movement = await tx.stockMovement.create({
        data: {
          batchId: dto.batchId,
          fromWarehouseId: dto.fromWarehouseId,
          toWarehouseId: dto.toWarehouseId,
          movementType: 'TRANSFER',
          quantity: dto.quantity,
          reason: dto.reason,
          performedById,
        },
      });

      await tx.rawMaterialBatch.update({
        where: { id: dto.batchId },
        data: { warehouseId: dto.toWarehouseId },
      });

      return movement;
    });
  }

  /**
   * FRD 17.3 - reconcile the system to a physical count. Always logs the
   * delta with a mandatory reason, since adjustments are the movement type
   * most likely to hide a process problem.
   */
  async adjust(warehouseId: string, dto: AdjustStockDto, performedById: string) {
    const stock = await this.prisma.warehouseStock.findUnique({
      where: { warehouseId_batchId: { warehouseId, batchId: dto.batchId } },
    });
    if (!stock) throw new NotFoundException('No stock for that batch in this warehouse');

    const delta = Number((dto.newQuantity - Number(stock.quantity)).toFixed(2));
    if (delta === 0) {
      throw new BadRequestException('newQuantity matches current stock - nothing to adjust');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.warehouseStock.update({
        where: { warehouseId_batchId: { warehouseId, batchId: dto.batchId } },
        data: { quantity: dto.newQuantity },
      });

      await tx.stockMovement.create({
        data: {
          batchId: dto.batchId,
          fromWarehouseId: delta < 0 ? warehouseId : null,
          toWarehouseId: delta > 0 ? warehouseId : null,
          movementType: 'ADJUSTMENT',
          quantity: Math.abs(delta),
          reason: dto.reason,
          performedById,
        },
      });

      return updated;
    });
  }

  // --- helpers -------------------------------------------------------------

  private async assertWarehouse(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!warehouse) throw new NotFoundException(`Warehouse ${id} not found`);
  }

  private async assertBatch(id: string) {
    const batch = await this.prisma.rawMaterialBatch.findUnique({ where: { id } });
    if (!batch) throw new NotFoundException(`Batch ${id} not found`);
  }
}
