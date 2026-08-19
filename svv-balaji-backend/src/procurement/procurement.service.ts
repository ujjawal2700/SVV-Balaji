import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InspectionResult, ProcurementPlanStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProcurementPlanDto } from './dto/create-procurement-plan.dto';
import { CreateHarvestInspectionDto } from './dto/create-harvest-inspection.dto';
import {
  UpdateHarvestInspectionDto,
  UpdateProcurementPlanDto,
} from './dto/update-procurement.dto';
import { assertDeletable } from '../common/dependants';

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

  async findPlan(id: string) {
    const plan = await this.prisma.procurementPlan.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
        _count: { select: { inspections: true } },
      },
    });
    if (!plan) throw new NotFoundException('Procurement plan not found');
    return plan;
  }

  async updatePlanStatus(id: string, status: ProcurementPlanStatus) {
    const plan = await this.prisma.procurementPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Procurement plan not found');
    return this.prisma.procurementPlan.update({ where: { id }, data: { status } });
  }

  /**
   * Correcting a plan.
   *
   * A plan is a forecast, so it stays editable while it is still a forecast -
   * DRAFT or SCHEDULED. Once it moves to IN_PROGRESS inspections are being
   * raised against it and the planned quantity is the number actual procurement
   * is measured against; editing it then would quietly rewrite the variance
   * rather than record it. COMPLETED and CANCELLED are history.
   */
  async updatePlan(id: string, dto: UpdateProcurementPlanDto) {
    const plan = await this.prisma.procurementPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Procurement plan not found');

    const EDITABLE: ProcurementPlanStatus[] = [
      ProcurementPlanStatus.DRAFT,
      ProcurementPlanStatus.SCHEDULED,
    ];
    if (!EDITABLE.includes(plan.status)) {
      throw new BadRequestException(
        `This plan is ${plan.status}, so its targets are fixed - the planned quantity is what ` +
          `actual procurement is being measured against. Only DRAFT and SCHEDULED plans can be ` +
          `edited.`,
      );
    }

    const from = dto.scheduledFrom ? new Date(dto.scheduledFrom) : plan.scheduledFrom;
    const to = dto.scheduledTo ? new Date(dto.scheduledTo) : plan.scheduledTo;
    if (to < from) {
      throw new BadRequestException('scheduledTo cannot be earlier than scheduledFrom');
    }

    return this.prisma.procurementPlan.update({
      where: { id },
      data: {
        cropName: dto.cropName,
        plannedQuantity: dto.plannedQuantity,
        unit: dto.unit,
        scheduledFrom: dto.scheduledFrom ? from : undefined,
        scheduledTo: dto.scheduledTo ? to : undefined,
        branchId: dto.branchId,
        notes: dto.notes,
      },
      include: {
        branch: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
        _count: { select: { inspections: true } },
      },
    });
  }

  async removePlan(id: string) {
    const plan = await this.prisma.procurementPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Procurement plan not found');

    const inspections = await this.prisma.harvestInspection.count({
      where: { procurementPlanId: id },
    });
    assertDeletable('Procurement plan', `${plan.cropName} plan`, { inspections });

    await this.prisma.procurementPlan.delete({ where: { id } });
    return { id, deleted: true };
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

    await this.assertPlotBelongsToFarmer(dto.plotId, dto.farmerId);

    return this.prisma.harvestInspection.create({
      data: {
        farmerId: dto.farmerId,
        agreementId: dto.agreementId,
        procurementPlanId: dto.procurementPlanId,
        plotId: dto.plotId,
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
        plot: { select: { id: true, name: true, surveyNumber: true, gpsLocation: true } },
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
        plot: { select: { id: true, name: true, surveyNumber: true, gpsLocation: true } },
        inspectedBy: { select: { id: true, fullName: true } },
        agreement: true,
        documents: true,
        collection: true,
      },
    });
    if (!inspection) throw new NotFoundException('Harvest inspection not found');
    return inspection;
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

  /**
   * Correcting an inspection.
   *
   * Locked once a collection has been recorded against it. The inspection's
   * `result` is the gate that allowed that collection to happen at all, and its
   * `cropName` is copied onto the collection and its batch - so an edit here
   * would either retroactively justify a collection that should not have been
   * allowed, or leave a batch labelled with a crop its inspection no longer
   * mentions. Neither is discoverable afterwards.
   *
   * Before collection, everything is fair game: a moisture reading typed into
   * the wrong field is exactly what this is for.
   */
  async updateInspection(id: string, dto: UpdateHarvestInspectionDto) {
    const inspection = await this.prisma.harvestInspection.findUnique({
      where: { id },
      include: { collection: { select: { receiptNumber: true } } },
    });
    if (!inspection) throw new NotFoundException('Harvest inspection not found');

    if (inspection.collection) {
      throw new BadRequestException(
        `This harvest was already collected on receipt ${inspection.collection.receiptNumber}. ` +
          `The inspection result is what allowed that collection, and the crop name is carried ` +
          `onto the batch, so neither can be changed now. Record a new inspection if the crop ` +
          `was re-examined.`,
      );
    }

    if (dto.agreementId) {
      const agreement = await this.prisma.agreement.findUnique({ where: { id: dto.agreementId } });
      if (!agreement) throw new NotFoundException('Agreement not found');
      if (agreement.farmerId !== inspection.farmerId) {
        throw new BadRequestException('Agreement does not belong to this farmer');
      }
    }

    await this.assertPlotBelongsToFarmer(dto.plotId, inspection.farmerId);

    return this.prisma.harvestInspection.update({
      where: { id },
      data: {
        agreementId: dto.agreementId,
        procurementPlanId: dto.procurementPlanId,
        plotId: dto.plotId,
        cropName: dto.cropName,
        inspectionDate: dto.inspectionDate ? new Date(dto.inspectionDate) : undefined,
        moistureLevel: dto.moistureLevel,
        foreignMatter: dto.foreignMatter,
        grainSize: dto.grainSize,
        grainColor: dto.grainColor,
        smell: dto.smell,
        physicalDamage: dto.physicalDamage,
        result: dto.result,
        remarks: dto.remarks,
      },
      include: {
        farmer: { select: { id: true, fullName: true, farmerCode: true } },
        plot: { select: { id: true, name: true, surveyNumber: true, gpsLocation: true } },
        inspectedBy: { select: { id: true, fullName: true } },
        collection: { select: { id: true, receiptNumber: true } },
      },
    });
  }

  async removeInspection(id: string) {
    const inspection = await this.prisma.harvestInspection.findUnique({
      where: { id },
      include: { collection: { select: { receiptNumber: true } } },
    });
    if (!inspection) throw new NotFoundException('Harvest inspection not found');

    if (inspection.collection) {
      throw new BadRequestException(
        `This harvest was already collected on receipt ${inspection.collection.receiptNumber}, ` +
          `and that collection's batch traces back through this inspection. Delete the ` +
          `collection first if the whole thing was recorded in error.`,
      );
    }

    // Photographs and quality certificates are attachments to the inspection,
    // meaningless once it is gone.
    await this.prisma.$transaction([
      this.prisma.harvestInspectionDocument.deleteMany({ where: { inspectionId: id } }),
      this.prisma.harvestInspection.delete({ where: { id } }),
    ]);

    return { id, deleted: true };
  }

  async removeInspectionDocument(inspectionId: string, documentId: string) {
    const document = await this.prisma.harvestInspectionDocument.findUnique({
      where: { id: documentId },
    });
    if (!document || document.inspectionId !== inspectionId) {
      throw new NotFoundException('Document not found on this inspection');
    }

    await this.prisma.harvestInspectionDocument.delete({ where: { id: documentId } });
    return this.findInspection(inspectionId);
  }

  /**
   * A plot must belong to the farmer being inspected.
   *
   * Without this the plot picker is only as trustworthy as the client that
   * populated it, and a mis-sent id would attribute one farmer's harvest to
   * another's field - which is precisely the claim the trace page makes to a
   * consumer. Cheap check, and it is the whole value of the feature.
   */
  private async assertPlotBelongsToFarmer(plotId: string | undefined, farmerId: string) {
    if (!plotId) return;

    const plot = await this.prisma.farmPlot.findUnique({
      where: { id: plotId },
      select: { farmerId: true, name: true },
    });

    if (!plot) throw new NotFoundException('Plot not found');
    if (plot.farmerId !== farmerId) {
      throw new BadRequestException(
        `Plot "${plot.name}" belongs to a different farmer. A harvest can only come from a plot ` +
          'this farmer works.',
      );
    }
  }
}
