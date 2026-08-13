import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InspectionResult, ProcurementPlanStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProcurementPlanDto } from './dto/create-procurement-plan.dto';
import { UpdateProcurementPlanDto } from './dto/update-procurement-plan.dto';
import { CreateHarvestInspectionDto } from './dto/create-harvest-inspection.dto';
import { UpdateHarvestInspectionDto } from './dto/update-harvest-inspection.dto';

@Injectable()
export class ProcurementService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Procurement Planning (FRD 13.1) -------------------------------------

  createPlan(dto: CreateProcurementPlanDto, createdById: string) {
    const from = new Date(dto.scheduledFrom);
    const to = new Date(dto.scheduledTo);
    if (to < from) {
      throw new BadRequestException('scheduledTo cannot be earlier than scheduledFrom');
    }

    return this.prisma.procurementPlan.create({
      data: {
        cropName: dto.cropName,
        plannedQuantity: dto.plannedQuantity,
        unit: dto.unit ?? 'KG',
        scheduledFrom: from,
        scheduledTo: to,
        branchId: dto.branchId,
        notes: dto.notes,
        createdById,
      },
    });
  }

  findPlans(branchId?: string, status?: ProcurementPlanStatus) {
    return this.prisma.procurementPlan.findMany({
      where: { branchId, status },
      orderBy: { scheduledFrom: 'desc' },
      include: {
        branch: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
        _count: { select: { inspections: true } },
      },
    });
  }

  async updatePlanStatus(id: string, status: ProcurementPlanStatus) {
    const plan = await this.prisma.procurementPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Procurement plan not found');
    return this.prisma.procurementPlan.update({ where: { id }, data: { status } });
  }

  async updatePlan(id: string, dto: UpdateProcurementPlanDto) {
    const plan = await this.prisma.procurementPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Procurement plan not found');

    const data: any = { ...dto };
    if (dto.scheduledFrom) data.scheduledFrom = new Date(dto.scheduledFrom);
    if (dto.scheduledTo) data.scheduledTo = new Date(dto.scheduledTo);

    if (data.scheduledTo && data.scheduledFrom && data.scheduledTo < data.scheduledFrom) {
      throw new BadRequestException('scheduledTo cannot be earlier than scheduledFrom');
    }

    return this.prisma.procurementPlan.update({ where: { id }, data });
  }

  async deletePlan(id: string) {
    const plan = await this.prisma.procurementPlan.findUnique({ 
      where: { id },
      include: { _count: { select: { inspections: true } } }
    });
    if (!plan) throw new NotFoundException('Procurement plan not found');

    if (plan._count.inspections > 0) {
      throw new BadRequestException('Cannot delete a plan that has associated harvest inspections');
    }

    return this.prisma.procurementPlan.delete({ where: { id } });
  }

  // --- Harvest Inspection (FRD 13.2 - 13.5) --------------------------------

  /**
   * Records a pre-harvest quality inspection. Only farmers who have completed
   * verification may be inspected - an unapproved farmer has no traceability
   * code, so anything collected from them could not be traced downstream.
   */
  async createInspection(dto: CreateHarvestInspectionDto, inspectedById: string) {
    const farmer = await this.prisma.farmer.findUnique({ where: { id: dto.farmerId } });
    if (!farmer) throw new NotFoundException('Farmer not found');

    if (farmer.status !== 'ACTIVE' || !farmer.farmerCode) {
      throw new BadRequestException(
        'Farmer must be approved and hold a traceability code before harvest inspection',
      );
    }

    if (dto.agreementId) {
      const agreement = await this.prisma.agreement.findUnique({ where: { id: dto.agreementId } });
      if (!agreement) throw new NotFoundException('Agreement not found');
      if (agreement.farmerId !== dto.farmerId) {
        throw new BadRequestException('Agreement does not belong to this farmer');
      }
    }

    return this.prisma.harvestInspection.create({
      data: {
        farmerId: dto.farmerId,
        agreementId: dto.agreementId,
        procurementPlanId: dto.procurementPlanId,
        cropName: dto.cropName,
        inspectionDate: new Date(dto.inspectionDate),
        moistureLevel: dto.moistureLevel,
        foreignMatter: dto.foreignMatter,
        grainSize: dto.grainSize,
        grainColor: dto.grainColor,
        smell: dto.smell,
        physicalDamage: dto.physicalDamage,
        result: dto.result,
        remarks: dto.remarks,
        inspectedById,
      },
    });
  }

  findInspections(farmerId?: string, result?: InspectionResult) {
    return this.prisma.harvestInspection.findMany({
      where: { farmerId, result },
      orderBy: { inspectionDate: 'desc' },
      include: {
        farmer: { select: { id: true, fullName: true, farmerCode: true } },
        inspectedBy: { select: { id: true, fullName: true } },
        collection: { select: { id: true, receiptNumber: true } },
      },
    });
  }

  async findInspection(id: string) {
    const inspection = await this.prisma.harvestInspection.findUnique({
      where: { id },
      include: {
        farmer: { select: { id: true, fullName: true, farmerCode: true } },
        inspectedBy: { select: { id: true, fullName: true } },
        agreement: true,
        documents: true,
        collection: true,
      },
    });
    if (!inspection) throw new NotFoundException('Harvest inspection not found');
    return inspection;
  }

  async updateInspection(id: string, dto: UpdateHarvestInspectionDto) {
    const inspection = await this.prisma.harvestInspection.findUnique({ where: { id } });
    if (!inspection) throw new NotFoundException('Harvest inspection not found');

    if (dto.farmerId && dto.farmerId !== inspection.farmerId) {
      const farmer = await this.prisma.farmer.findUnique({ where: { id: dto.farmerId } });
      if (!farmer || farmer.status !== 'ACTIVE' || !farmer.farmerCode) {
        throw new BadRequestException('Farmer must be approved and hold a traceability code');
      }
    }

    const data: any = { ...dto };
    if (dto.inspectionDate) {
      data.inspectionDate = new Date(dto.inspectionDate);
    }

    return this.prisma.harvestInspection.update({
      where: { id },
      data,
    });
  }

  async deleteInspection(id: string) {
    const inspection = await this.prisma.harvestInspection.findUnique({ 
      where: { id },
      include: { collection: true }
    });
    if (!inspection) throw new NotFoundException('Harvest inspection not found');

    if (inspection.collection) {
      throw new BadRequestException('Cannot delete an inspection that has already been collected');
    }

    return this.prisma.harvestInspection.delete({ where: { id } });
  }

  async addInspectionDocument(inspectionId: string, fileUrl: string, fileType: string) {
    const inspection = await this.prisma.harvestInspection.findUnique({
      where: { id: inspectionId },
    });
    if (!inspection) throw new NotFoundException('Harvest inspection not found');

    return this.prisma.harvestInspectionDocument.create({
      data: { inspectionId, fileUrl, fileType },
    });
  }
}
