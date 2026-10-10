import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { IsBoolean, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/sequence.service';
import { scopedBranchId } from '../common/branch-scope';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { istRange } from '../pos/pos.logic';
import { utilisation } from './production-cost.logic';

export class CreateMachineDto {
  @ApiProperty({ example: 'Flour mill 1' })
  @IsString() @MinLength(2) @MaxLength(80)
  name: string;

  @ApiPropertyOptional({ description: 'Plate / asset number on the machine' })
  @IsOptional() @IsString() @MaxLength(40)
  machineNumber?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(60)
  productionLine?: string;

  @ApiProperty()
  @IsString()
  branchId: string;

  @ApiPropertyOptional({ description: 'Rated output per hour, in the product unit' })
  @IsOptional() @IsNumber() @Min(0)
  capacityPerHour?: number;

  @ApiPropertyOptional({ default: 8, description: 'Hours a day it is meant to run - the base for utilisation %' })
  @IsOptional() @IsNumber() @Min(0.5) @Max(24)
  hoursPerDay?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(300)
  notes?: string;
}

export class UpdateMachineDto extends PartialType(CreateMachineDto) {
  @ApiPropertyOptional({ description: 'Inactive machines cannot be booked on new runs' })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

const view = <T extends { capacityPerHour: Prisma.Decimal | null; hoursPerDay: Prisma.Decimal }>(m: T) => ({
  ...m,
  capacityPerHour: m.capacityPerHour === null ? null : Number(m.capacityPerHour),
  hoursPerDay: Number(m.hoursPerDay),
});

@Injectable()
export class MachinesService {
  constructor(private readonly prisma: PrismaService, private readonly sequence: SequenceService) {}

  async list(user: JwtPayload, q: { branchId?: string; activeOnly?: boolean }) {
    const rows = await this.prisma.machine.findMany({
      where: { branchId: scopedBranchId(user, q.branchId), ...(q.activeOnly ? { isActive: true } : {}) },
      orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
      include: { branch: { select: { id: true, name: true } }, _count: { select: { productionBatches: true } } },
    });
    return rows.map(view);
  }

  async create(dto: CreateMachineDto) {
    await this.assertBranch(dto.branchId);
    await this.assertNumberFree(dto.machineNumber);
    return this.prisma.$transaction(async (tx) => {
      const code = await this.sequence.nextInSeries(tx, 'MCH', 3);
      return view(await tx.machine.create({ data: { ...dto, name: dto.name.trim(), code } }));
    });
  }

  async update(id: string, dto: UpdateMachineDto) {
    const m = await this.prisma.machine.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Machine not found');
    if (dto.branchId && dto.branchId !== m.branchId) await this.assertBranch(dto.branchId);
    if (dto.machineNumber && dto.machineNumber !== m.machineNumber) await this.assertNumberFree(dto.machineNumber, id);
    return view(await this.prisma.machine.update({ where: { id }, data: { ...dto, name: dto.name?.trim() } }));
  }

  /** Only a machine no run was ever booked on can go; otherwise deactivate it. */
  async remove(id: string) {
    const m = await this.prisma.machine.findUnique({ where: { id }, include: { _count: { select: { productionBatches: true } } } });
    if (!m) throw new NotFoundException('Machine not found');
    if (m._count.productionBatches > 0) {
      throw new ConflictException(`${m.code} has ${m._count.productionBatches} production run(s) booked on it - deactivate it instead`);
    }
    await this.prisma.machine.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Runs, run hours, output and utilisation % per machine over an IST date
   * range. Runs booked before the machine list existed (free-text machine
   * names) are not attributed to any machine.
   */
  async utilisation(user: JwtPayload, q: { from?: string; to?: string; branchId?: string }) {
    let range: ReturnType<typeof istRange>;
    try {
      range = istRange(q.from, q.to);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const machines = await this.prisma.machine.findMany({
      where: { branchId: scopedBranchId(user, q.branchId) },
      orderBy: { code: 'asc' },
      include: { branch: { select: { id: true, name: true } } },
    });
    const runs = await this.prisma.productionBatch.findMany({
      where: {
        machineId: { in: machines.map((m) => m.id) },
        // In range by run time, or (no run time recorded) by production date.
        OR: [
          { startedAt: { lt: range.end }, OR: [{ completedAt: null }, { completedAt: { gte: range.start } }] },
          { startedAt: null, productionDate: { gte: range.start, lt: range.end } },
        ],
      },
      select: {
        id: true, productionBatchNumber: true, machineId: true, status: true, startedAt: true, completedAt: true,
        actualQuantity: true, plannedQuantity: true, unit: true, productionDate: true, product: { select: { name: true } },
      },
      orderBy: { productionDate: 'desc' },
    });
    const now = new Date();
    const rows = machines.map((m) => {
      const mine = runs.filter((r) => r.machineId === m.id);
      return {
        machine: view(m),
        ...utilisation(
          mine.map((r) => ({ status: r.status, startedAt: r.startedAt, completedAt: r.completedAt, actualQuantity: r.actualQuantity === null ? null : Number(r.actualQuantity) })),
          range, Number(m.hoursPerDay), now,
        ),
        recentRuns: mine.slice(0, 10).map((r) => ({
          id: r.id, productionBatchNumber: r.productionBatchNumber, product: r.product.name, status: r.status,
          startedAt: r.startedAt, completedAt: r.completedAt, productionDate: r.productionDate,
          actualQuantity: r.actualQuantity === null ? null : Number(r.actualQuantity), unit: r.unit,
          hours: r.startedAt && r.completedAt ? Math.round(((r.completedAt.getTime() - r.startedAt.getTime()) / 3_600_000) * 100) / 100 : null,
        })),
      };
    });
    const unassigned = await this.prisma.productionBatch.count({
      where: { machineId: null, branchId: scopedBranchId(user, q.branchId), productionDate: { gte: range.start, lt: range.end }, status: { not: 'CANCELLED' } },
    });
    return { from: range.from, to: range.to, machines: rows, runsWithoutMachine: unassigned };
  }

  private async assertBranch(branchId: string) {
    const b = await this.prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } });
    if (!b) throw new BadRequestException('Branch not found');
  }

  private async assertNumberFree(machineNumber?: string, exceptId?: string) {
    if (!machineNumber?.trim()) return;
    const clash = await this.prisma.machine.findFirst({ where: { machineNumber: machineNumber.trim(), ...(exceptId ? { id: { not: exceptId } } : {}) } });
    if (clash) throw new ConflictException(`Machine number ${machineNumber} is already ${clash.code} (${clash.name})`);
  }
}
