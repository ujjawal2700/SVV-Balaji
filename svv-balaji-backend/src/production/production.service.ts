import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ProductionStatus, ProductionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/sequence.service';
import {
  CompleteProductionDto,
  CreateCleaningGradingDto,
  CreateProductionBatchDto,
} from './dto/production.dto';

/**
 * Set MULTIGRAIN_ENABLED=true once the client confirms the multigrain
 * ratio/blending engine is in contracted scope. The data model supports it
 * fully; only execution is gated, so enabling it is a config change rather
 * than a migration.
 */
const multigrainEnabled = () => process.env.MULTIGRAIN_ENABLED === 'true';

@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
  ) {}

  // --- Cleaning & Grading (FRD Section 18) ---------------------------------

  async recordCleaningGrading(dto: CreateCleaningGradingDto, operatorId: string) {
    const batch = await this.prisma.rawMaterialBatch.findUnique({
      where: { id: dto.rawMaterialBatchId },
    });
    if (!batch) throw new NotFoundException('Raw material batch not found');

    return this.prisma.cleaningGradingRecord.create({
      data: { ...dto, operatorId },
    });
  }

  findCleaningRecords(rawMaterialBatchId?: string) {
    return this.prisma.cleaningGradingRecord.findMany({
      where: { rawMaterialBatchId },
      orderBy: { createdAt: 'desc' },
      include: {
        rawMaterialBatch: { select: { id: true, batchNumber: true, cropName: true } },
        operator: { select: { id: true, fullName: true } },
      },
    });
  }

  // --- Production (FRD Section 20) -----------------------------------------

  /**
   * Creates a production batch and consumes the named raw material batches.
   *
   * All of it happens in one transaction: the batch number, the consumption
   * rows, and the stock decrements. A partial write here would break the
   * traceability chain - a finished product that can't name the raw batches
   * (and therefore the farmers) it came from is the one thing this system
   * exists to prevent.
   */
  async createProductionBatch(dto: CreateProductionBatchDto, createdById: string) {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id: dto.recipeId },
      include: { ingredients: true },
    });
    if (!recipe) throw new NotFoundException('Recipe not found');

    // FRD 19.4 - only approved recipes may be used in production.
    if (recipe.status !== 'APPROVED') {
      throw new BadRequestException(
        `Recipe must be APPROVED before use in production (currently ${recipe.status})`,
      );
    }

    if (recipe.productionType === ProductionType.MULTI_GRAIN && !multigrainEnabled()) {
      throw new BadRequestException(
        'Multigrain production is not enabled. The recipe/BOM ratio engine is pending client ' +
          'scope confirmation - set MULTIGRAIN_ENABLED=true once it is contracted.',
      );
    }

    // Validate every consumed batch before touching anything.
    const rmBatches = await this.prisma.rawMaterialBatch.findMany({
      where: { id: { in: dto.consumptions.map((c) => c.rawMaterialBatchId) } },
      include: { stock: { where: { warehouseId: dto.warehouseId } } },
    });

    if (rmBatches.length !== dto.consumptions.length) {
      throw new BadRequestException('One or more raw material batches were not found');
    }

    for (const consumption of dto.consumptions) {
      const batch = rmBatches.find((b) => b.id === consumption.rawMaterialBatchId)!;

      if (batch.status === 'REJECTED') {
        throw new BadRequestException(
          `Batch ${batch.batchNumber} was rejected by QA and cannot enter production`,
        );
      }

      const stockRow = batch.stock[0];
      if (!stockRow) {
        throw new BadRequestException(
          `Batch ${batch.batchNumber} has no stock in the nominated warehouse`,
        );
      }

      /**
       * FRD 17.2 - reserved stock.
       *
       * ---------------------------------------------------------------------
       * Production consumes from AVAILABLE stock directly. It does not reserve
       * raw material ahead of a run. Decided 16 Aug 2026.
       *
       * `reservedQuantity` is subtracted here and is respected - but the only
       * thing that writes it is sales allocation, reserving finished goods
       * against an order. Nothing reserves raw material for a planned
       * production batch, which is what 17.2 describes.
       *
       * That is a workflow question, not a technical gap: pre-reservation only
       * earns its complexity if runs are planned before the material exists,
       * and nobody has said they are. Raise it with the client before building
       * it - a reservation nobody releases becomes stock that looks used and
       * is not.
       * ---------------------------------------------------------------------
       */
      const available = Number(stockRow.quantity) - Number(stockRow.reservedQuantity);
      if (consumption.quantityUsed > available) {
        throw new BadRequestException(
          `Insufficient stock of batch ${batch.batchNumber}: need ${consumption.quantityUsed}, available ${available}`,
        );
      }

      // The crop must actually appear in the recipe, else the formula is a fiction.
      const inRecipe = recipe.ingredients.some(
        (i) => i.cropName.trim().toLowerCase() === batch.cropName.trim().toLowerCase(),
      );
      if (!inRecipe) {
        throw new BadRequestException(
          `Batch ${batch.batchNumber} is ${batch.cropName}, which is not an ingredient of recipe ${recipe.recipeCode}`,
        );
      }
    }

    const productionDate = new Date(dto.productionDate);

    return this.prisma.$transaction(async (tx) => {
      const productionBatchNumber = await this.sequence.next(tx, 'PB', productionDate);

      const production = await tx.productionBatch.create({
        data: {
          productionBatchNumber,
          productId: recipe.productId,
          recipeId: recipe.id,
          recipeVersion: recipe.version,
          productionType: recipe.productionType,
          plannedQuantity: dto.plannedQuantity,
          unit: recipe.unit,
          productionDate,
          status: ProductionStatus.IN_PROGRESS,
          machineName: dto.machineName,
          machineNumber: dto.machineNumber,
          operatorName: dto.operatorName,
          productionLine: dto.productionLine,
          branchId: dto.branchId,
          createdById,
        },
      });

      for (const consumption of dto.consumptions) {
        await tx.productionConsumption.create({
          data: {
            productionBatchId: production.id,
            rawMaterialBatchId: consumption.rawMaterialBatchId,
            quantityUsed: consumption.quantityUsed,
          },
        });

        await tx.warehouseStock.update({
          where: {
            warehouseId_batchId: {
              warehouseId: dto.warehouseId,
              batchId: consumption.rawMaterialBatchId,
            },
          },
          data: { quantity: { decrement: consumption.quantityUsed } },
        });

        await tx.stockMovement.create({
          data: {
            batchId: consumption.rawMaterialBatchId,
            fromWarehouseId: dto.warehouseId,
            movementType: 'STOCK_OUT',
            quantity: consumption.quantityUsed,
            reason: `Consumed by production batch ${productionBatchNumber}`,
            performedById: createdById,
          },
        });

        await tx.rawMaterialBatch.update({
          where: { id: consumption.rawMaterialBatchId },
          data: { status: 'UNDER_PRODUCTION' },
        });
      }

      return tx.productionBatch.findUnique({
        where: { id: production.id },
        include: {
          consumptions: {
            include: { rawMaterialBatch: { select: { batchNumber: true, cropName: true } } },
          },
          recipe: { select: { recipeCode: true, version: true, name: true } },
        },
      });
    });
  }

  /** FRD 20.5 - records actual output and derives process loss. */
  async completeProduction(id: string, dto: CompleteProductionDto) {
    const production = await this.prisma.productionBatch.findUnique({ where: { id } });
    if (!production) throw new NotFoundException('Production batch not found');

    if (production.status === ProductionStatus.COMPLETED) {
      throw new BadRequestException('Production batch is already completed');
    }
    if (production.status === ProductionStatus.CANCELLED) {
      throw new BadRequestException('A cancelled production batch cannot be completed');
    }

    const planned = Number(production.plannedQuantity);
    const productionLoss = Number((planned - dto.actualQuantity).toFixed(2));

    return this.prisma.productionBatch.update({
      where: { id },
      data: {
        actualQuantity: dto.actualQuantity,
        productionLoss,
        status: ProductionStatus.COMPLETED,
      },
      include: { consumptions: true },
    });
  }

  async setStatus(id: string, status: ProductionStatus) {
    const production = await this.prisma.productionBatch.findUnique({ where: { id } });
    if (!production) throw new NotFoundException('Production batch not found');
    if (status === ProductionStatus.COMPLETED) {
      throw new BadRequestException('Use the /complete endpoint, which records actual output');
    }
    return this.prisma.productionBatch.update({ where: { id }, data: { status } });
  }

  findAll(filters: { status?: ProductionStatus; branchId?: string; productId?: string }) {
    return this.prisma.productionBatch.findMany({
      where: filters,
      orderBy: { productionDate: 'desc' },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        recipe: { select: { recipeCode: true, version: true } },
        _count: { select: { consumptions: true, finishedGoodsBatches: true } },
      },
    });
  }

  async findOne(id: string) {
    const production = await this.prisma.productionBatch.findUnique({
      where: { id },
      include: {
        product: true,
        recipe: { include: { ingredients: true } },
        branch: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
        consumptions: {
          include: {
            rawMaterialBatch: {
              select: {
                id: true,
                batchNumber: true,
                cropName: true,
                farmer: { select: { id: true, fullName: true, farmerCode: true } },
              },
            },
          },
        },
        qualityInspections: true,
        finishedGoodsBatches: { select: { id: true, fgBatchNumber: true, qaReleased: true } },
      },
    });
    if (!production) throw new NotFoundException('Production batch not found');
    return production;
  }

  async updateProductionBatch(
    id: string,
    dto: import('./dto/update-production-batch.dto').UpdateProductionBatchDto,
  ) {
    const production = await this.prisma.productionBatch.findUnique({ where: { id } });
    if (!production) throw new NotFoundException('Production batch not found');

    if (
      production.status === ProductionStatus.COMPLETED ||
      production.status === ProductionStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot update production batch in ${production.status} status`,
      );
    }

    return this.prisma.productionBatch.update({
      where: { id },
      data: {
        machineName: dto.machineName,
        machineNumber: dto.machineNumber,
        operatorName: dto.operatorName,
        productionLine: dto.productionLine,
        plannedQuantity: dto.plannedQuantity,
        productionDate: dto.productionDate ? new Date(dto.productionDate) : undefined,
      },
    });
  }

  async deleteProductionBatch(id: string) {
    const production = await this.prisma.productionBatch.findUnique({
      where: { id },
      include: { consumptions: true, finishedGoodsBatches: true },
    });
    if (!production) throw new NotFoundException('Production batch not found');

    if (production.finishedGoodsBatches.length > 0) {
      throw new BadRequestException(
        'Cannot delete production batch with associated finished goods batches',
      );
    }

    if (production.status === ProductionStatus.COMPLETED) {
      throw new BadRequestException('Cannot delete completed production batch');
    }

    return this.prisma.$transaction(async (tx) => {
      // Revert raw material status if needed
      for (const consumption of production.consumptions) {
        await tx.rawMaterialBatch.update({
          where: { id: consumption.rawMaterialBatchId },
          data: { status: 'STORED' },
        });
      }

      await tx.productionConsumption.deleteMany({
        where: { productionBatchId: id },
      });

      return tx.productionBatch.delete({
        where: { id },
      });
    });
  }
}

