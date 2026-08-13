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
 * How far a blend may drift from its recipe before production is refused,
 * in percentage points of the total input.
 *
 * 0.5 pp is tight enough that a 60/40 blend cannot quietly become 65/35 - which
 * is the whole point of holding a formula of record - and loose enough to
 * absorb the rounding that comes of drawing whole-ish quantities from stock. On
 * a 1,000 kg mix it allows 5 kg of slack per grain.
 *
 * `BLEND_TOLERANCE_POINTS` in the panel's ProductionBatchFormModal mirrors this
 * so the form can show the operator where they stand before they submit. If it
 * changes here, change it there.
 */
const BLEND_TOLERANCE_POINTS = 0.5;

/**
 * Crop names are free text on both the recipe and the batch - they are typed by
 * different people, months apart, in the field and in the office. Matching them
 * case- and whitespace-insensitively is the difference between "Wheat" and
 * "wheat " blocking a legitimate production run.
 */
const normaliseCrop = (crop: string) => crop.trim().toLowerCase();

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

      const available = Number(stockRow.quantity) - Number(stockRow.reservedQuantity);
      if (consumption.quantityUsed > available) {
        throw new BadRequestException(
          `Insufficient stock of batch ${batch.batchNumber}: need ${consumption.quantityUsed}, available ${available}`,
        );
      }

      // The crop must actually appear in the recipe, else the formula is a fiction.
      const inRecipe = recipe.ingredients.some(
        (i) => normaliseCrop(i.cropName) === normaliseCrop(batch.cropName),
      );
      if (!inRecipe) {
        throw new BadRequestException(
          `Batch ${batch.batchNumber} is ${batch.cropName}, which is not an ingredient of recipe ${recipe.recipeCode}`,
        );
      }
    }

    if (recipe.productionType === ProductionType.MULTI_GRAIN) {
      this.assertBlendMatchesRecipe(recipe, rmBatches, dto.consumptions);
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

  /**
   * The blend ratio gate (FRD 19.3 / 20.2) - what the MULTIGRAIN_ENABLED flag
   * was standing in for until the client confirmed scope on 14 Aug 2026.
   *
   * Approving a recipe fixes a ratio; without this check, nothing made that
   * ratio true at production time. A 60/40 wheat-bajra blend could be produced
   * from 90% wheat and 10% bajra, be labelled and sold as the approved blend,
   * and nothing in the system would ever say otherwise. That is a
   * mislabelled-food problem, not a data-quality one - which is why this is
   * enforced here rather than left as a warning in the UI.
   *
   * Ratios are measured against the TOTAL INPUT rather than the planned output.
   * The recipe describes the mix going in; process loss applies to the mix as a
   * whole and is only known at completion. So a run that inputs 1,020 kg for a
   * 1,000 kg plan still passes, as long as the proportions hold.
   */
  private assertBlendMatchesRecipe(
    recipe: { recipeCode: string; ingredients: Array<{ cropName: string; percentage: unknown }> },
    rmBatches: Array<{ id: string; cropName: string }>,
    consumptions: Array<{ rawMaterialBatchId: string; quantityUsed: number }>,
  ) {
    const usedByCrop = new Map<string, number>();
    let totalInput = 0;

    for (const consumption of consumptions) {
      const batch = rmBatches.find((b) => b.id === consumption.rawMaterialBatchId)!;
      const key = normaliseCrop(batch.cropName);
      usedByCrop.set(key, (usedByCrop.get(key) ?? 0) + consumption.quantityUsed);
      totalInput += consumption.quantityUsed;
    }

    if (totalInput <= 0) {
      throw new BadRequestException('A production run must consume some raw material');
    }

    // Every grain in the formula has to be present. A three-grain blend made
    // from two grains is a different product, not a rounding error.
    const missing = recipe.ingredients
      .filter((i) => !usedByCrop.has(normaliseCrop(i.cropName)))
      .map((i) => i.cropName);

    if (missing.length > 0) {
      throw new BadRequestException(
        `Recipe ${recipe.recipeCode} calls for ${missing.join(' and ')}, but no ` +
          `${missing.length === 1 ? 'batch of it was' : 'batches of them were'} supplied. ` +
          `Every grain in the formula has to be in the mix.`,
      );
    }

    const drifted = recipe.ingredients
      .map((ingredient) => {
        const required = Number(ingredient.percentage);
        const actual = ((usedByCrop.get(normaliseCrop(ingredient.cropName)) ?? 0) / totalInput) * 100;
        return { cropName: ingredient.cropName, required, actual };
      })
      .filter((i) => Math.abs(i.actual - i.required) > BLEND_TOLERANCE_POINTS);

    if (drifted.length > 0) {
      const detail = drifted
        .map(
          (i) =>
            `${i.cropName} is ${i.actual.toFixed(2)}% of the mix but the recipe says ` +
            `${i.required.toFixed(2)}% (needs ${((i.required / 100) * totalInput).toFixed(2)} ` +
            `of the ${totalInput.toFixed(2)} total)`,
        )
        .join('; ');

      throw new BadRequestException(
        `The mix does not match recipe ${recipe.recipeCode}: ${detail}. ` +
          `Blends may drift by at most ${BLEND_TOLERANCE_POINTS} percentage points.`,
      );
    }
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
}
