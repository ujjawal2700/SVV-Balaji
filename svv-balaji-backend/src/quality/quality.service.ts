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
  async releaseBatch(fgBatchId: string) {
    const batch = await this.prisma.finishedGoodsBatch.findUnique({
      where: { id: fgBatchId },
      include: {
        qualityInspections: {
          where: { stage: InspectionStage.FINISHED_GOODS },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!batch) throw new NotFoundException('Finished goods batch not found');

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

    return this.prisma.finishedGoodsBatch.update({
      where: { id: fgBatchId },
      data: { qaReleased: true },
    });
  }
}
