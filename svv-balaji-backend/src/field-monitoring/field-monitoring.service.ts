import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { scopedBranchId } from '../common/branch-scope';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { CreateFieldVisitDto } from './dto/create-field-visit.dto';
import { AddFieldVisitDocumentDto } from './dto/add-field-visit-document.dto';

@Injectable()
export class FieldMonitoringService {
  constructor(private readonly prisma: PrismaService) {}

  createVisit(dto: CreateFieldVisitDto, expertId: string) {
    return this.prisma.fieldVisit.create({
      data: {
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
      },
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

    return this.prisma.fieldVisitDocument.create({
      data: { fieldVisitId, fileUrl: dto.fileUrl, fileType: dto.fileType },
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

    return this.prisma.fieldVisit.delete({
      where: { id },
    });
  }
}

