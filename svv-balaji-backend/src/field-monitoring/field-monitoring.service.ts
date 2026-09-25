import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { scopedBranchId } from '../common/branch-scope';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { CreateFieldVisitDto } from './dto/create-field-visit.dto';
import { AddFieldVisitDocumentDto } from './dto/add-field-visit-document.dto';
import { buildFieldReport } from './field-report';

@Injectable()
export class FieldMonitoringService {
  constructor(private readonly prisma: PrismaService) {}

  async createVisit(dto: CreateFieldVisitDto, expertId: string) {
    // Offline re-send: the visit (and any plan it completed) is already recorded.
    if (dto.id) {
      const existing = await this.prisma.fieldVisit.findUnique({ where: { id: dto.id } });
      if (existing) return existing;
    }
    const data = {
      id: dto.id,
      farmerId: dto.farmerId,
      branchId: dto.branchId,
      expertId,
      visitDate: new Date(dto.visitDate),
      cropName: dto.cropName,
      cropGrowthStage: dto.cropGrowthStage,
      cropHealth: dto.cropHealth,
      pestStatus: dto.pestStatus,
      diseaseObservation: dto.diseaseObservation,
      fertilizerAdvice: dto.fertilizerAdvice,
      irrigationAdvice: dto.irrigationAdvice,
      pestControlSuggestions: dto.pestControlSuggestions,
      harvestPreparation: dto.harvestPreparation,
      yieldPredictionQty: dto.yieldPredictionQty,
    };

    // No plan: exactly the original single insert.
    if (!dto.planId) return this.prisma.fieldVisit.create({ data });

    // FRD 12.1 - recording the visit completes the plan it was scheduled under.
    const plan = await this.prisma.fieldVisitPlan.findUnique({ where: { id: dto.planId } });
    if (!plan) throw new NotFoundException('Planned visit not found');
    if (plan.status !== 'PLANNED') {
      throw new BadRequestException(`That planned visit is already ${plan.status.toLowerCase()}.`);
    }
    if (plan.farmerId !== dto.farmerId) {
      throw new BadRequestException('That planned visit is for a different farmer.');
    }

    return this.prisma.$transaction(async (tx) => {
      const visit = await tx.fieldVisit.create({ data });
      // Conditional on still being PLANNED, so two phones completing the same
      // plan at once cannot both succeed.
      const completed = await tx.fieldVisitPlan.updateMany({
        where: { id: plan.id, status: 'PLANNED' },
        data: { status: 'COMPLETED', completedVisitId: visit.id, completedAt: new Date() },
      });
      if (completed.count !== 1) {
        throw new BadRequestException('That planned visit was just completed by someone else.');
      }
      return visit;
    });
  }

  /**
   * FRD 12.7 - the field report for one visit. See field-report.ts for what is
   * on it and why it is derived on read rather than stored.
   */
  async report(id: string) {
    const visit = await this.prisma.fieldVisit.findUnique({
      where: { id },
      include: {
        expert: { select: { id: true, fullName: true } },
        branch: { select: { id: true, name: true } },
        documents: { orderBy: { createdAt: 'asc' } },
        plan: { select: { id: true, plannedDate: true, purpose: true } },
        farmer: {
          select: {
            id: true, fullName: true, farmerCode: true, mobile: true, village: true, district: true,
            state: true, gpsLocation: true, farmSizeAcres: true, landType: true, irrigationType: true,
            qualityRating: true, status: true,
          },
        },
      },
    });
    if (!visit) throw new NotFoundException('Field visit not found');

    const [plots, agreements, previousVisit, visitCount, inspections] = await this.prisma.$transaction([
      this.prisma.farmPlot.findMany({
        where: { farmerId: visit.farmerId, isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, surveyNumber: true, areaAcres: true, currentCrop: true, expectedHarvest: true, gpsLocation: true },
      }),
      this.prisma.agreement.findMany({
        where: { farmerId: visit.farmerId },
        orderBy: [{ harvestDate: 'desc' }, { createdAt: 'desc' }],
        select: { id: true, cropName: true, variety: true, expectedQuantity: true, purchaseRate: true, harvestDate: true, status: true },
      }),
      this.prisma.fieldVisit.findFirst({
        where: {
          farmerId: visit.farmerId,
          id: { not: visit.id },
          OR: [
            { visitDate: { lt: visit.visitDate } },
            { visitDate: visit.visitDate, createdAt: { lt: visit.createdAt } },
          ],
        },
        orderBy: [{ visitDate: 'desc' }, { createdAt: 'desc' }],
        select: { id: true, visitDate: true, cropHealth: true, cropGrowthStage: true, pestStatus: true, yieldPredictionQty: true },
      }),
      this.prisma.fieldVisit.count({ where: { farmerId: visit.farmerId, visitDate: { lte: visit.visitDate } } }),
      this.prisma.harvestInspection.count({
        where: {
          farmerId: visit.farmerId,
          inspectionDate: { gte: visit.visitDate },
          ...(visit.cropName ? { cropName: { equals: visit.cropName, mode: 'insensitive' as const } } : {}),
        },
      }),
    ]);

    return buildFieldReport({
      now: new Date(),
      visit,
      farmer: visit.farmer,
      plots,
      agreements,
      previousVisit,
      plan: visit.plan,
      visitCount,
      hasHarvestInspection: inspections > 0,
    });
  }

  /**
   * `expertId` exists so the field app can ask for "my visits" server-side.
   *
   * It used to filter in the browser, which is correct only while every row
   * fits in one response. The moment this endpoint is paginated (A-12), a
   * client-side filter would narrow ONE page and report three visits where the
   * executive logged nine - wrong, and wrong quietly.
   */
  findAll(user: JwtPayload, farmerId?: string, expertId?: string) {
    return this.prisma.fieldVisit.findMany({
      // FieldVisit carries its own branch, so scope on the column directly.
      where: { farmerId, expertId, branchId: scopedBranchId(user) },
      orderBy: { visitDate: 'desc' },
      include: {
        farmer: { select: { id: true, fullName: true, farmerCode: true } },
        expert: { select: { id: true, fullName: true } },
        branch: { select: { id: true, name: true } },
      },
    });
  }

  async findOne(id: string) {
    const visit = await this.prisma.fieldVisit.findUnique({
      where: { id },
      include: {
        farmer: { select: { id: true, fullName: true, farmerCode: true } },
        expert: { select: { id: true, fullName: true } },
        branch: { select: { id: true, name: true } },
        documents: true,
      },
    });
    if (!visit) throw new NotFoundException('Field visit not found');
    return visit;
  }

  async addDocument(fieldVisitId: string, dto: AddFieldVisitDocumentDto) {
    const visit = await this.prisma.fieldVisit.findUnique({ where: { id: fieldVisitId } });
    if (!visit) throw new NotFoundException('Field visit not found');

    if (dto.id) {
      const existing = await this.prisma.fieldVisitDocument.findUnique({ where: { id: dto.id } });
      if (existing) return existing;
    }
    return this.prisma.fieldVisitDocument.create({
      data: { id: dto.id, fieldVisitId, fileUrl: dto.fileUrl, fileType: dto.fileType },
    });
  }

  async removeDocument(fieldVisitId: string, documentId: string) {
    const doc = await this.prisma.fieldVisitDocument.findFirst({
      where: { id: documentId, fieldVisitId },
    });
    if (!doc) throw new NotFoundException('Document not found for this field visit');

    return this.prisma.fieldVisitDocument.delete({
      where: { id: documentId },
    });
  }

  async updateVisit(id: string, dto: import('./dto/update-field-visit.dto').UpdateFieldVisitDto) {
    const visit = await this.prisma.fieldVisit.findUnique({ where: { id } });
    if (!visit) throw new NotFoundException('Field visit not found');

    return this.prisma.fieldVisit.update({
      where: { id },
      data: {
        ...dto,
        visitDate: dto.visitDate ? new Date(dto.visitDate) : undefined,
      },
    });
  }

  async removeVisit(id: string) {
    const visit = await this.prisma.fieldVisit.findUnique({ where: { id } });
    if (!visit) throw new NotFoundException('Field visit not found');

    // A visit recorded against a plan hands the plan back: the visit it was
    // completed by no longer exists, so the visit is still owed.
    const [, deleted] = await this.prisma.$transaction([
      this.prisma.fieldVisitPlan.updateMany({
        where: { completedVisitId: id },
        data: { status: 'PLANNED', completedVisitId: null, completedAt: null },
      }),
      this.prisma.fieldVisit.delete({ where: { id } }),
    ]);
    return deleted;
  }
}

