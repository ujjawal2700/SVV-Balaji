import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductionStatus, ProductionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { scopedBranchId } from '../common/branch-scope';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
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
      include: { stock: true },
    });
    if (!batch) throw new NotFoundException('Raw material batch not found');

    const wastage = Number(dto.wastageQuantity ?? 0);

    /**
     * FRD 18.1 - removed wastage has to leave the inventory.
     *
     * Stones, dust and foreign matter picked out of a batch are gone. Recording
     * the figure and leaving the stock untouched meant the warehouse balance
     * counted material that is physically in a bin, and production could be
     * authorised to consume grain that no longer existed. The write-off is a
     * real stock movement with its own ledger row, like every other quantity
     * change in the system.
     */
    if (wastage > 0) {
      const stockRow = batch.stock[0];
      if (!stockRow) {
        throw new BadRequestException(
          `Batch ${batch.batchNumber} has no stock row, so ${wastage} of wastage cannot be ` +
            `written off. Book the batch into a warehouse first.`,
        );
      }

      const available = Number(stockRow.quantity) - Number(stockRow.reservedQuantity);
      if (wastage > available) {
        throw new BadRequestException(
          `Wastage of ${wastage} exceeds the ${available} available of batch ` +
            `${batch.batchNumber}. Check the figure - cleaning cannot remove more than is there.`,
        );
      }

      return this.prisma.$transaction(async (tx) => {
        const record = await tx.cleaningGradingRecord.create({
          data: { ...dto, operatorId },
        });

        await tx.warehouseStock.update({
          where: { id: stockRow.id },
          data: { quantity: { decrement: wastage } },
        });

        await tx.stockMovement.create({
          data: {
            batchId: batch.id,
            fromWarehouseId: stockRow.warehouseId,
            movementType: 'ADJUSTMENT',
            quantity: wastage,
            unit: stockRow.unit,
            reason:
              `Cleaning wastage removed from batch ${batch.batchNumber}` +
              (dto.remarks ? `: ${dto.remarks}` : ''),
            performedById: operatorId,
          },
        });

        return record;
      });
    }

    return this.prisma.cleaningGradingRecord.create({
      data: { ...dto, operatorId },
    });
  }

  /**
   * FRD 18.3 - QA verifies cleaned material before it is manufactured.
   *
   * A separate act by a separate person, deliberately. `qaVerified` used to be
   * a field on the form the cleaning operator submitted, which made it a
   * self-certification and meant the QA gate the FRD describes did not exist.
   * It is now settable only here, behind `quality.create`, and production
   * refuses a batch whose cleaning record has not been through it.
   */
  async verifyCleaningRecord(id: string, verifiedById: string) {
    const record = await this.prisma.cleaningGradingRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Cleaning and grading record not found');

    if (record.operatorId === verifiedById) {
      throw new BadRequestException(
        'The operator who recorded the cleaning cannot verify it. QA sign-off is a second pair ' +
          'of eyes - that is the whole point of the check.',
      );
    }

    if (record.qaVerified) {
      return record;
    }

    return this.prisma.cleaningGradingRecord.update({
      where: { id },
      data: { qaVerified: true, qaVerifiedById: verifiedById, qaVerifiedAt: new Date() },
      include: {
        qaVerifiedBy: { select: { id: true, fullName: true } },
        rawMaterialBatch: { select: { batchNumber: true } },
      },
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
       * Available is on-hand minus what other runs have already reserved. A
       * PLANNED run holds a reservation without consuming; an IN_PROGRESS run
       * has consumed. Both are subtracted here, so two runs planned against the
       * same batch can no longer both see the full quantity - which is exactly
       * the failure 17.2 exists to prevent.
       */
      const available = Number(stockRow.quantity) - Number(stockRow.reservedQuantity);
      if (consumption.quantityUsed > available) {
        throw new BadRequestException(
          `Insufficient stock of batch ${batch.batchNumber}: need ${consumption.quantityUsed}, available ${available}`,
        );
      }

      /**
       * FRD 18.3 - QA approves cleaned material before it is manufactured.
       *
       * The rule is deliberately "if it was cleaned, it must have been passed",
       * not "everything must be cleaned": not every crop needs a cleaning pass,
       * and inventing that requirement would block legitimate runs. But a batch
       * that went through cleaning and was never signed off is material someone
       * started checking and did not finish, which is worse than unchecked.
       */
      const cleaning = await this.prisma.cleaningGradingRecord.findFirst({
        where: { rawMaterialBatchId: batch.id },
        orderBy: { createdAt: 'desc' },
        select: { qaVerified: true, createdAt: true },
      });
      if (cleaning && !cleaning.qaVerified) {
        throw new BadRequestException(
          `Batch ${batch.batchNumber} was cleaned and graded but QA has not verified the result. ` +
            `A Quality Manager must verify the cleaning record before this batch can be used.`,
        );
      }

      /**
       * FRD 21.4/21.5 - a raw-material quality decision has to mean something.
       *
       * FAIL already rejects the batch outright elsewhere. REWORK_REQUIRED did
       * nothing at all: the batch stayed STORED and was freely consumable,
       * which made the third quality outcome decorative. Blocked here until a
       * later inspection passes.
       */
      const latestQa = await this.prisma.qualityInspection.findFirst({
        where: { rawMaterialBatchId: batch.id, stage: 'RAW_MATERIAL' },
        orderBy: { createdAt: 'desc' },
        select: { result: true },
      });
      if (latestQa && latestQa.result !== 'PASS') {
        throw new BadRequestException(
          `The most recent quality inspection on batch ${batch.batchNumber} was ` +
            `${latestQa.result.replace('_', ' ').toLowerCase()}. Re-inspect it with a PASS ` +
            `before using it in production.`,
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

      /**
       * FRD 20.1 / 17.2 - plan, or start immediately.
       *
       * `PLANNED` reserves the raw material without consuming it. That is what
       * makes 17.2 real: the quantity stays on the shelf and stays visible in
       * stock reports, but no other run can commit it. `IN_PROGRESS` is the
       * old behaviour and remains the default, so nothing that exists today
       * changes shape.
       *
       * PLANNED was previously unreachable - `createProductionBatch` hardcoded
       * IN_PROGRESS - which is why FRD 20.1 production planning did not exist
       * in practice despite the status being in the enum.
       */
      const planOnly = dto.status === ProductionStatus.PLANNED;

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
          status: planOnly ? ProductionStatus.PLANNED : ProductionStatus.IN_PROGRESS,
          machineName: dto.machineName,
          machineNumber: dto.machineNumber,
          operatorName: dto.operatorName,
          productionLine: dto.productionLine,
          branchId: dto.branchId,
          warehouseId: dto.warehouseId,
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

        if (planOnly) {
          // Reserve: the stock stays where it is and stays counted, but is no
          // longer available to anyone else. No ledger row, because nothing
          // physically moved - a reservation is an intention, not a movement.
          await tx.warehouseStock.update({
            where: {
              warehouseId_batchId: {
                warehouseId: dto.warehouseId,
                batchId: consumption.rawMaterialBatchId,
              },
            },
            data: { reservedQuantity: { increment: consumption.quantityUsed } },
          });
        } else {
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

    /**
     * FRD 20.5 - production loss is input minus output.
     *
     * This used to compute `planned - actual`, which is plan variance, not
     * loss. A run consuming 1,000 kg, planned at 900 and yielding 950 recorded
     * a loss of -50 kg when the material actually lost was 50 kg. The old
     * figure could go negative, which is not a thing loss can do, and it made
     * yield reconciliation wrong by exactly the planning error.
     *
     * Loss now reads off what was actually consumed. Plan variance is still
     * derivable by anyone who wants it - planned and actual are both stored -
     * but it is a different number and does not belong in this field.
     */
    const consumed = await this.prisma.productionConsumption.aggregate({
      where: { productionBatchId: id },
      _sum: { quantityUsed: true },
    });
    const totalInput = Number(consumed._sum.quantityUsed ?? 0);
    const productionLoss = Number((totalInput - dto.actualQuantity).toFixed(2));

    if (productionLoss < 0) {
      throw new BadRequestException(
        `Output (${dto.actualQuantity}) exceeds the ${totalInput} consumed by this run. ` +
          `A run cannot yield more than it was fed - check the actual quantity, or record the ` +
          `missing raw material consumption first.`,
      );
    }

    /**
     * FRD 21.4 - an in-process FAIL has to stop the run.
     *
     * Previously only raw-material and finished-goods FAILs did anything, so a
     * run that failed its in-process inspection could be completed, packed and
     * sold. Checked at completion because that is the point the run becomes
     * eligible to be packed.
     */
    const inProcess = await this.prisma.qualityInspection.findFirst({
      where: { productionBatchId: id, stage: 'IN_PROCESS' },
      orderBy: { createdAt: 'desc' },
      select: { result: true },
    });
    if (inProcess && inProcess.result !== 'PASS') {
      throw new BadRequestException(
        `The most recent in-process inspection on this run was ` +
          `${inProcess.result.replace('_', ' ').toLowerCase()}. Re-inspect with a PASS before ` +
          `completing it - a failed run must not reach packaging.`,
      );
    }

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

  /**
   * FRD 20.1 - a planned run starts: the reservation becomes consumption.
   *
   * This is the moment the raw material actually leaves the shelf. The
   * reservation is released and the same quantity decremented in one
   * transaction, so there is no instant where the stock is neither reserved
   * nor consumed and another run could take it.
   */
  async startProduction(id: string, performedById: string) {
    const production = await this.prisma.productionBatch.findUnique({
      where: { id },
      include: { consumptions: true },
    });
    if (!production) throw new NotFoundException('Production batch not found');

    if (production.status !== ProductionStatus.PLANNED) {
      throw new BadRequestException(
        `Only a PLANNED run can be started (this one is ${production.status}).`,
      );
    }
    if (!production.warehouseId) {
      throw new BadRequestException(
        'This run has no warehouse recorded, so its reservation cannot be located. It predates ' +
          'reservation support and has to be recreated.',
      );
    }

    const warehouseId = production.warehouseId;

    return this.prisma.$transaction(async (tx) => {
      for (const consumption of production.consumptions) {
        /**
         * Prisma addresses a compound unique by its generated name, so the
         * `where` is `{ warehouseId_batchId: { … } }` — the wrapper is the key,
         * not decoration. Written inline rather than hoisted into a variable
         * because hoisting it is what makes it easy to pass the inner object by
         * mistake, which type-checks as an object and fails as a query.
         */
        const where = {
          warehouseId_batchId: { warehouseId, batchId: consumption.rawMaterialBatchId },
        };

        const stockRow = await tx.warehouseStock.findUnique({ where });
        if (!stockRow) {
          throw new BadRequestException(
            'The reserved stock row has gone missing - investigate before starting this run.',
          );
        }

        // Release and consume together. Order matters only to the check
        // constraint (reserved <= quantity), which both orders satisfy.
        await tx.warehouseStock.update({
          where,
          data: {
            reservedQuantity: { decrement: consumption.quantityUsed },
            quantity: { decrement: consumption.quantityUsed },
          },
        });

        await tx.stockMovement.create({
          data: {
            batchId: consumption.rawMaterialBatchId,
            fromWarehouseId: warehouseId,
            movementType: 'STOCK_OUT',
            quantity: consumption.quantityUsed,
            reason: `Consumed by production batch ${production.productionBatchNumber}`,
            performedById,
          },
        });

        await tx.rawMaterialBatch.update({
          where: { id: consumption.rawMaterialBatchId },
          data: { status: 'UNDER_PRODUCTION' },
        });
      }

      return tx.productionBatch.update({
        where: { id },
        data: { status: ProductionStatus.IN_PROGRESS },
        include: { consumptions: true },
      });
    });
  }

  /**
   * Give a planned run's reservation back.
   *
   * Called when a PLANNED run is cancelled. Never touches `quantity` - a
   * reservation never moved any stock, so releasing it must not move any
   * either. Getting this wrong in the other direction is how reserved stock
   * becomes stock that looks used and is not.
   */
  private async releaseReservation(
    tx: Prisma.TransactionClient,
    production: { id: string; warehouseId: string | null; consumptions: Array<{ rawMaterialBatchId: string; quantityUsed: Prisma.Decimal }> },
  ) {
    if (!production.warehouseId) return;

    for (const consumption of production.consumptions) {
      await tx.warehouseStock.updateMany({
        where: {
          warehouseId: production.warehouseId,
          batchId: consumption.rawMaterialBatchId,
        },
        data: { reservedQuantity: { decrement: consumption.quantityUsed } },
      });
    }
  }

  async setStatus(id: string, status: ProductionStatus) {
    const production = await this.prisma.productionBatch.findUnique({
      where: { id },
      include: { consumptions: true },
    });
    if (!production) throw new NotFoundException('Production batch not found');
    if (status === ProductionStatus.COMPLETED) {
      throw new BadRequestException('Use the /complete endpoint, which records actual output');
    }

    /**
     * Starting is not a status change - it moves stock. Sending it here would
     * flip the flag and leave the reservation standing, which is the single
     * worst outcome for FRD 17.2: material reserved forever against a run that
     * has already consumed it.
     */
    if (status === ProductionStatus.IN_PROGRESS && production.status === ProductionStatus.PLANNED) {
      throw new BadRequestException(
        'Use the /start endpoint to begin a planned run. It converts the raw material ' +
          'reservation into actual consumption; setting the status directly would leave the ' +
          'reservation standing against stock that has been used.',
      );
    }

    /**
     * Cancelling a planned run gives its reservation back. Only a PLANNED run
     * holds one - once started, the material is consumed and a cancellation
     * cannot un-grind it.
     */
    const releasing =
      status === ProductionStatus.CANCELLED && production.status === ProductionStatus.PLANNED;

    if (!releasing) {
      return this.prisma.productionBatch.update({ where: { id }, data: { status } });
    }

    return this.prisma.$transaction(async (tx) => {
      await this.releaseReservation(tx, production);
      return tx.productionBatch.update({ where: { id }, data: { status } });
    });
  }

  findAll(
    user: JwtPayload,
    filters: { status?: ProductionStatus; branchId?: string; productId?: string },
  ) {
    return this.prisma.productionBatch.findMany({
      // FRD 5.2 - the caller's branch wins over whatever was asked for.
      where: { ...filters, branchId: scopedBranchId(user, filters.branchId) },
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

