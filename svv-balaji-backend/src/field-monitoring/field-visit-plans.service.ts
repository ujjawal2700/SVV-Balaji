import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { branchScopeFor, scopedBranchId } from '../common/branch-scope';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import {
  CancelFieldVisitPlanDto,
  CreateFieldVisitPlanDto,
  QueryFieldVisitPlanDto,
  UpdateFieldVisitPlanDto,
} from './dto/field-visit-plan.dto';

const PLAN_INCLUDE = {
  farmer: {
    select: { id: true, fullName: true, farmerCode: true, village: true, district: true, mobile: true },
  },
  expert: { select: { id: true, fullName: true } },
  createdBy: { select: { id: true, fullName: true } },
  branch: { select: { id: true, name: true } },
  completedVisit: { select: { id: true, visitDate: true } },
} satisfies Prisma.FieldVisitPlanInclude;

/** A date-only string ("2026-09-25") for today in UTC, the same basis `new Date('YYYY-MM-DD')` uses. */
function isoDay(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/**
 * FRD 12.1 - planned field visits.
 *
 * A plan moves PLANNED -> COMPLETED (a visit was recorded against it, see
 * FieldMonitoringService.createVisit) or PLANNED -> CANCELLED. Only a PLANNED
 * plan can be edited; a completed one is history tied to an observation record,
 * and a cancelled one records a decision.
 */
@Injectable()
export class FieldVisitPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateFieldVisitPlanDto, user: JwtPayload) {
    const farmer = await this.prisma.farmer.findUnique({
      where: { id: dto.farmerId },
      select: { id: true, fullName: true, branchId: true, status: true },
    });
    if (!farmer) throw new NotFoundException('Farmer not found');

    // FRD 5.2 - a branch user can only plan within their own branch.
    const scope = branchScopeFor(user);
    if (scope && farmer.branchId !== scope) {
      throw new BadRequestException(`${farmer.fullName} belongs to another branch.`);
    }
    if (farmer.status === 'BLACKLISTED' || farmer.status === 'INACTIVE') {
      throw new BadRequestException(
        `${farmer.fullName} is ${farmer.status.toLowerCase()} - a visit cannot be planned.`,
      );
    }

    this.assertNotInPast(dto.plannedDate);
    const expertId = dto.expertId ?? user.sub;
    if (dto.expertId) await this.assertActiveUser(dto.expertId);

    return this.prisma.fieldVisitPlan.create({
      data: {
        farmerId: farmer.id,
        branchId: scope ?? dto.branchId ?? farmer.branchId,
        expertId,
        createdById: user.sub,
        plannedDate: new Date(dto.plannedDate),
        purpose: dto.purpose,
        cropName: dto.cropName,
        notes: dto.notes,
      },
      include: PLAN_INCLUDE,
    });
  }

  findAll(user: JwtPayload, query: QueryFieldVisitPlanDto) {
    const plannedDate: Prisma.DateTimeFilter = {};
    if (query.from) plannedDate.gte = new Date(query.from);
    if (query.to) {
      // Inclusive of the whole "to" day.
      const end = new Date(query.to);
      end.setUTCDate(end.getUTCDate() + 1);
      plannedDate.lt = end;
    }

    return this.prisma.fieldVisitPlan.findMany({
      where: {
        farmerId: query.farmerId,
        expertId: query.expertId,
        status: query.status,
        branchId: scopedBranchId(user),
        plannedDate: query.from || query.to ? plannedDate : undefined,
      },
      orderBy: [{ plannedDate: 'asc' }, { createdAt: 'asc' }],
      include: PLAN_INCLUDE,
    });
  }

  async findOne(id: string) {
    const plan = await this.prisma.fieldVisitPlan.findUnique({ where: { id }, include: PLAN_INCLUDE });
    if (!plan) throw new NotFoundException('Planned visit not found');
    return plan;
  }

  async update(id: string, dto: UpdateFieldVisitPlanDto) {
    const plan = await this.findOne(id);
    this.assertStillPlanned(plan.status, 'edited');
    if (dto.plannedDate) this.assertNotInPast(dto.plannedDate);
    if (dto.expertId) await this.assertActiveUser(dto.expertId);

    return this.prisma.fieldVisitPlan.update({
      where: { id },
      data: {
        plannedDate: dto.plannedDate ? new Date(dto.plannedDate) : undefined,
        branchId: dto.branchId,
        expertId: dto.expertId,
        purpose: dto.purpose,
        cropName: dto.cropName,
        notes: dto.notes,
      },
      include: PLAN_INCLUDE,
    });
  }

  async cancel(id: string, dto: CancelFieldVisitPlanDto) {
    const plan = await this.findOne(id);
    this.assertStillPlanned(plan.status, 'cancelled');

    return this.prisma.fieldVisitPlan.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: dto.reason },
      include: PLAN_INCLUDE,
    });
  }

  /**
   * A completed plan is linked to the visit that fulfilled it and stays as
   * history. Anything else was only ever an intention and can go.
   */
  async remove(id: string) {
    const plan = await this.findOne(id);
    if (plan.status === 'COMPLETED') {
      throw new BadRequestException(
        'This planned visit has been completed and is linked to the recorded visit. It cannot be deleted.',
      );
    }
    await this.prisma.fieldVisitPlan.delete({ where: { id } });
    return { id, deleted: true };
  }

  private assertStillPlanned(status: string, verb: string) {
    if (status !== 'PLANNED') {
      throw new BadRequestException(
        `This visit is already ${status.toLowerCase()} and can no longer be ${verb}.`,
      );
    }
  }

  /** One day of slack so a phone a timezone behind UTC can still plan "today". */
  private assertNotInPast(plannedDate: string) {
    if (plannedDate.slice(0, 10) < isoDay(-1)) {
      throw new BadRequestException(
        'A planned visit cannot be dated in the past. Record the visit itself instead.',
      );
    }
  }

  private async assertActiveUser(userId: string) {
    const expert = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });
    if (!expert) throw new BadRequestException('The assigned executive does not exist');
    if (expert.status !== 'ACTIVE') {
      throw new BadRequestException('The assigned executive is not active');
    }
  }
}
