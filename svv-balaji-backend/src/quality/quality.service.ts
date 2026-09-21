import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InspectionStage, QualityResult } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQualityInspectionDto } from './dto/quality.dto';

@Injectable()
export class QualityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records an inspection at one of the three lifecycle points (FRD 21).
   *
   * A FAIL at raw-material stage marks the batch REJECTED so it can no longer
   * enter production; a FAIL at finished-goods stage withdraws QA release so
   * the batch cannot be stocked or dispatched (FRD 21.5). Quality decisions
   * have to actually gate the flow, otherwise they are just annotations.
   */
  async create(dto: CreateQualityInspectionDto, inspectedById: string) {
    await this.assertTargetMatchesStage(dto);

    return this.prisma.$transaction(async (tx) => {
      const inspection = await tx.qualityInspection.create({
        data: { ...dto, inspectedById },
      });

      if (dto.result === QualityResult.FAIL) {
        if (dto.stage === InspectionStage.RAW_MATERIAL && dto.rawMaterialBatchId) {
          await tx.rawMaterialBatch.update({
            where: { id: dto.rawMaterialBatchId },
            data: { status: 'REJECTED' },
          });
        }

        if (dto.stage === InspectionStage.FINISHED_GOODS && dto.finishedGoodsBatchId) {
          await tx.finishedGoodsBatch.update({
            where: { id: dto.finishedGoodsBatchId },
            data: { qaReleased: false },
          });
        }
      }

      return inspection;
    });
  }

  /** Each stage points at exactly one kind of target - enforce it. */
  private async assertTargetMatchesStage(dto: CreateQualityInspectionDto) {
    const targets = {
      [InspectionStage.RAW_MATERIAL]: dto.rawMaterialBatchId,
      [InspectionStage.IN_PROCESS]: dto.productionBatchId,
      [InspectionStage.FINISHED_GOODS]: dto.finishedGoodsBatchId,
    };

    const required = targets[dto.stage];
    if (!required) {
      const expected = {
        [InspectionStage.RAW_MATERIAL]: 'rawMaterialBatchId',
        [InspectionStage.IN_PROCESS]: 'productionBatchId',
        [InspectionStage.FINISHED_GOODS]: 'finishedGoodsBatchId',
      }[dto.stage];
      throw new BadRequestException(`Stage ${dto.stage} requires ${expected}`);
    }

    const supplied = [dto.rawMaterialBatchId, dto.productionBatchId, dto.finishedGoodsBatchId]
      .filter(Boolean).length;
    if (supplied > 1) {
      throw new BadRequestException('Supply exactly one target id for the given stage');
    }

    if (dto.stage === InspectionStage.RAW_MATERIAL) {
      const b = await this.prisma.rawMaterialBatch.findUnique({
        where: { id: dto.rawMaterialBatchId },
      });
      if (!b) throw new NotFoundException('Raw material batch not found');
    } else if (dto.stage === InspectionStage.IN_PROCESS) {
      const b = await this.prisma.productionBatch.findUnique({
        where: { id: dto.productionBatchId },
      });
      if (!b) throw new NotFoundException('Production batch not found');
    } else {
      const b = await this.prisma.finishedGoodsBatch.findUnique({
        where: { id: dto.finishedGoodsBatchId },
      });
      if (!b) throw new NotFoundException('Finished goods batch not found');
    }
  }

  findAll(filters: { stage?: InspectionStage; result?: QualityResult }) {
    return this.prisma.qualityInspection.findMany({
      where: filters,
      orderBy: { createdAt: 'desc' },
      include: {
        inspectedBy: { select: { id: true, fullName: true } },
        rawMaterialBatch: { select: { id: true, batchNumber: true } },
        productionBatch: { select: { id: true, productionBatchNumber: true } },
        finishedGoodsBatch: { select: { id: true, fgBatchNumber: true } },
      },
    });
  }

  async findOne(id: string) {
    const inspection = await this.prisma.qualityInspection.findUnique({
      where: { id },
      include: {
        inspectedBy: { select: { id: true, fullName: true } },
        rawMaterialBatch: true,
        productionBatch: true,
        finishedGoodsBatch: true,
      },
    });
    if (!inspection) throw new NotFoundException('Quality inspection not found');
    return inspection;
  }

  /**
   * FRD 21.5 - releases a finished goods batch for stocking and dispatch.
   * Refuses if the most recent finished-goods inspection was not a PASS.
   */
  async releaseBatch(fgBatchId: string, performedById: string, requestedWarehouseId?: string) {
    const batch = await this.prisma.finishedGoodsBatch.findUnique({
      where: { id: fgBatchId },
      include: {
        productionBatch: { select: { warehouseId: true, branchId: true } },
        qualityInspections: {
          where: { stage: InspectionStage.FINISHED_GOODS },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!batch) throw new NotFoundException('Finished goods batch not found');

    if (batch.holdStatus === 'RECALLED') {
      throw new BadRequestException('Batch was recalled - it cannot be released');
    }

    const latest = batch.qualityInspections[0];
    if (!latest) {
      throw new BadRequestException(
        'Batch has no finished-goods inspection - it cannot be released',
      );
    }
    if (latest.result !== QualityResult.PASS) {
      throw new BadRequestException(
        `Latest finished-goods inspection was ${latest.result} - only a PASS can be released`,
      );
    }

    const warehouseId = await this.resolveInwardWarehouse(batch, requestedWarehouseId);

    /**
     * Release and stock-in are one atomic step: a released batch with no stock (or stock
     * for a batch that was never released) cannot exist. The ledger row is the idempotency
     * key - releasing again after a withdrawn release, or twice, never inwards the packs twice.
     */
    return this.prisma.$transaction(async (tx) => {
      const released = await tx.finishedGoodsBatch.update({
        where: { id: fgBatchId },
        data: { qaReleased: true },
      });

      const alreadyInwarded = await tx.stockMovement.findFirst({
        where: { fgBatchId, movementType: 'PRODUCTION_INWARD' },
        select: { id: true },
      });
      if (alreadyInwarded) return released;

      await tx.finishedGoodsStock.upsert({
        where: { warehouseId_fgBatchId: { warehouseId, fgBatchId } },
        update: { quantity: { increment: batch.packCount } },
        create: { warehouseId, fgBatchId, quantity: batch.packCount },
      });

      await tx.stockMovement.create({
        data: {
          fgBatchId,
          toWarehouseId: warehouseId,
          movementType: 'PRODUCTION_INWARD',
          quantity: batch.packCount,
          unit: 'PACK',
          reference: 'QA_RELEASE_AUTO',
          reason: `Auto-inwarded on QA release of ${batch.fgBatchNumber}`,
          performedById,
        },
      });

      return released;
    });
  }

  /**
   * Which node receives the packs: an explicit choice, else the warehouse the production run
   * used, else the branch's central depot. Never a guess between several - if none applies the
   * release is refused rather than stocking the wrong place.
   */
  private async resolveInwardWarehouse(
    batch: { productionBatch: { warehouseId: string | null; branchId: string } },
    requested?: string,
  ): Promise<string> {
    const candidate = requested ?? batch.productionBatch.warehouseId;
    if (candidate) {
      const w = await this.prisma.warehouse.findUnique({ where: { id: candidate } });
      if (!w || !w.isActive) throw new BadRequestException('Target warehouse not found or inactive');
      return w.id;
    }
    const central = await this.prisma.warehouse.findMany({
      where: { kind: 'CENTRAL', isActive: true, branchId: batch.productionBatch.branchId },
      orderBy: { createdAt: 'asc' },
      take: 2,
    });
    if (central.length === 1) return central[0].id;
    throw new BadRequestException(
      'No target warehouse: the production run has none and the branch has ' +
        (central.length ? 'more than one central depot' : 'no central depot') +
        ' - pass warehouseId to choose where the packs are inwarded',
    );
  }
}
