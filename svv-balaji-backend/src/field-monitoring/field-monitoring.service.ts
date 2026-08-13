import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFieldVisitDto } from './dto/create-field-visit.dto';
import { AddFieldVisitDocumentDto } from './dto/add-field-visit-document.dto';
import { UpdateFieldVisitDto } from './dto/update-field-visit.dto';

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

  findAll(farmerId?: string) {
    return this.prisma.fieldVisit.findMany({
      where: farmerId ? { farmerId } : undefined,
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

  async updateVisit(id: string, dto: UpdateFieldVisitDto) {
    await this.findOne(id);

    return this.prisma.fieldVisit.update({
      where: { id },
      data: {
        farmerId: dto.farmerId,
        branchId: dto.branchId,
        visitDate: dto.visitDate ? new Date(dto.visitDate) : undefined,
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
      include: {
        farmer: { select: { id: true, fullName: true, farmerCode: true } },
        expert: { select: { id: true, fullName: true } },
        branch: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Nothing references a field visit, so it deletes cleanly. Its attached
   * photos and reports go with it - they are attachments to the observation,
   * meaningless once the observation is gone.
   */
  async removeVisit(id: string) {
    await this.findOne(id);

    await this.prisma.$transaction([
      this.prisma.fieldVisitDocument.deleteMany({ where: { fieldVisitId: id } }),
      this.prisma.fieldVisit.delete({ where: { id } }),
    ]);

    return { id, deleted: true };
  }

  async removeDocument(fieldVisitId: string, documentId: string) {
    const document = await this.prisma.fieldVisitDocument.findUnique({
      where: { id: documentId },
    });
    if (!document || document.fieldVisitId !== fieldVisitId) {
      throw new NotFoundException('Document not found on this visit');
    }

    await this.prisma.fieldVisitDocument.delete({ where: { id: documentId } });
    return this.findOne(fieldVisitId);
  }
}
