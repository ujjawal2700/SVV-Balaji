import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
}
