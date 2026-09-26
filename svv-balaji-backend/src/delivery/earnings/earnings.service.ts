import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryTask, EarningRuleKind, Prisma, RiderEarningType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsNumber, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { localParts, targetBonuses, taskEarnings, validateConfig, weekKey, type Outcome, type Rule } from './earning.logic';

export class EarningRuleDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @ApiProperty({ enum: EarningRuleKind }) @IsEnum(EarningRuleKind) kind!: EarningRuleKind;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ description: 'Null = every zone' }) @IsOptional() @IsString() zoneId?: string | null;
  @ApiProperty({ description: 'Shape depends on kind - see earning.logic.ts validateConfig' }) @IsObject() config!: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsDateString() validFrom?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString() validTo?: string | null;
}

export class EarningAdjustmentDto {
  @ApiProperty({ description: 'Signed: + to pay more, - to claw back' }) @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) amount!: number;
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(300) note!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() taskId?: string;
}

const TIMEZONE = 'Asia/Kolkata';

/**
 * Credits rider pay from Super Admin rules when a task ends, and reports it.
 * Crediting is idempotent (unique dedupeKey per task/rule and per bonus
 * period/target), so a retry or a duplicate event can never pay twice.
 */
@Injectable()
export class EarningsService {
  private readonly logger = new Logger(EarningsService.name);
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- rules

  listRules() {
    return this.prisma.riderEarningRule.findMany({
      include: { zone: { select: { id: true, name: true, code: true } } },
      orderBy: [{ isActive: 'desc' }, { kind: 'asc' }, { name: 'asc' }],
    });
  }

  private async check(dto: Partial<EarningRuleDto>, current?: { kind: EarningRuleKind; zoneId: string | null; config: unknown }) {
    const kind = dto.kind ?? current!.kind;
    const zoneId = dto.zoneId !== undefined ? dto.zoneId : current?.zoneId ?? null;
    const config = (dto.config ?? current?.config) as Record<string, unknown>;
    const err = validateConfig(kind, config, zoneId ?? null);
    if (err) throw new BadRequestException(`Rule config: ${err}`);
    if (zoneId && !(await this.prisma.deliveryZone.findUnique({ where: { id: zoneId } }))) throw new BadRequestException('Zone not found');
    if (dto.validFrom && dto.validTo && new Date(dto.validFrom) > new Date(dto.validTo)) throw new BadRequestException('validFrom is after validTo');
  }

  async createRule(dto: EarningRuleDto, userId: string) {
    await this.check(dto);
    return this.prisma.riderEarningRule.create({
      data: {
        name: dto.name, kind: dto.kind, isActive: dto.isActive ?? true, zoneId: dto.zoneId ?? null,
        config: dto.config as Prisma.InputJsonValue,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : null, validTo: dto.validTo ? new Date(dto.validTo) : null,
        createdById: userId,
      },
    });
  }

  async updateRule(id: string, dto: Partial<EarningRuleDto>) {
    const current = await this.prisma.riderEarningRule.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Rule not found');
    if (dto.kind && dto.kind !== current.kind) throw new BadRequestException('The kind of a rule cannot change; create a new rule');
    await this.check(dto, current);
    return this.prisma.riderEarningRule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.zoneId !== undefined ? { zoneId: dto.zoneId } : {}),
        ...(dto.config !== undefined ? { config: dto.config as Prisma.InputJsonValue } : {}),
        ...(dto.validFrom !== undefined ? { validFrom: dto.validFrom ? new Date(dto.validFrom) : null } : {}),
        ...(dto.validTo !== undefined ? { validTo: dto.validTo ? new Date(dto.validTo) : null } : {}),
      },
    });
  }

  /** Rules that already paid something are switched off, never deleted (lines keep their rule). */
  async removeRule(id: string) {
    const used = await this.prisma.riderEarning.count({ where: { ruleId: id } });
    if (used) {
      await this.prisma.riderEarningRule.update({ where: { id }, data: { isActive: false } });
      return { deleted: false, deactivated: true };
    }
    await this.prisma.riderEarningRule.delete({ where: { id } });
    return { deleted: true, deactivated: false };
  }

  private async activeRules(): Promise<Rule[]> {
    const rows = await this.prisma.riderEarningRule.findMany({ where: { isActive: true } });
    return rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, zoneId: r.zoneId, validFrom: r.validFrom, validTo: r.validTo, config: (r.config ?? {}) as Record<string, unknown> }));
  }

  // ---------------------------------------------------------------- crediting

  private static minutesBetween(a: Date | null, b: Date | null, verified: boolean): number | null {
    if (!verified || !a || !b) return null;
    return Math.max((b.getTime() - a.getTime()) / 60000, 0);
  }

  /**
   * Credit whatever the rules say for a task that has ended. `result` is
   * 'DELIVERED' or the outcome of a failed/cancelled task. Best-effort by
   * design: a pay bug must never block a delivery, so callers catch.
   */
  async creditTask(task: DeliveryTask, result: 'DELIVERED' | Outcome) {
    if (!task.riderId) return [];
    const at = task.deliveredAt ?? task.failedAt ?? task.cancelledAt ?? new Date();
    const rules = await this.activeRules();
    const lines = taskEarnings(rules, {
      taskId: task.id,
      riderId: task.riderId,
      zoneId: task.zoneId,
      result,
      distanceKm: task.distanceKm === null ? null : Number(task.distanceKm),
      at,
      timeZone: TIMEZONE,
      waitPickupMinutes: EarningsService.minutesBetween(task.arrivedPickupAt, task.pickedUpAt, task.arrivedPickupVerified),
      waitDropMinutes: EarningsService.minutesBetween(task.arrivedDropAt, task.deliveredAt ?? task.failedAt, task.arrivedDropVerified),
    });

    if (result === 'DELIVERED') {
      const day = localParts(at, TIMEZONE).date;
      const week = weekKey(at, TIMEZONE);
      const [dayCount, weekCount] = await Promise.all([
        this.countDelivered(task.riderId, new Date(`${day}T00:00:00+05:30`), 1),
        this.countDelivered(task.riderId, new Date(`${week}T00:00:00+05:30`), 7),
      ]);
      lines.push(...targetBonuses(rules, { riderId: task.riderId, zoneId: task.zoneId, at, timeZone: TIMEZONE, dayCount, weekCount }));
    }

    const created: Array<Awaited<ReturnType<typeof this.prisma.riderEarning.create>>> = [];
    for (const l of lines) {
      try {
        created.push(
          await this.prisma.riderEarning.create({
            data: {
              riderId: task.riderId, type: l.type as RiderEarningType, amount: l.amount, ruleId: l.ruleId, dedupeKey: l.dedupeKey,
              detail: l.detail as Prisma.InputJsonValue, earnedAt: at,
              // Bonuses belong to the period, not to the task that tipped them over.
              taskId: l.type === 'DAILY_BONUS' || l.type === 'WEEKLY_BONUS' ? null : task.id,
            },
          }),
        );
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue; // already credited
        throw e;
      }
    }
    return created;
  }

  private countDelivered(riderId: string, from: Date, days: number) {
    return this.prisma.deliveryTask.count({
      where: { riderId, status: 'DELIVERED', deliveredAt: { gte: from, lt: new Date(from.getTime() + days * 864e5) } },
    });
  }

  async adjust(riderId: string, dto: EarningAdjustmentDto, userId: string) {
    if (!(await this.prisma.rider.findUnique({ where: { id: riderId } }))) throw new NotFoundException('Rider not found');
    if (dto.amount === 0) throw new BadRequestException('An adjustment of 0 changes nothing');
    return this.prisma.riderEarning.create({
      data: { riderId, type: 'ADJUSTMENT', amount: dto.amount, note: dto.note.trim(), taskId: dto.taskId ?? null, recordedById: userId },
    });
  }

  // ---------------------------------------------------------------- reporting

  /** A from/to query as IST calendar days (to inclusive); defaults to this week so far. */
  private range(range: { from?: string; to?: string }) {
    const now = new Date();
    const week = new Date(`${weekKey(now, TIMEZONE)}T00:00:00+05:30`);
    const from = range.from ? new Date(`${range.from.slice(0, 10)}T00:00:00+05:30`) : week;
    const to = range.to ? new Date(new Date(`${range.to.slice(0, 10)}T00:00:00+05:30`).getTime() + 864e5) : new Date(now.getTime() + 60_000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || !(from < to)) throw new BadRequestException('Give a valid date range, "from" before "to"');
    return { from, to };
  }

  /**
   * Every rider's pay for a period, for the staff Rider Earnings screen: one row
   * per rider who is active or earned anything in the period, with deliveries,
   * failures and the split by earning type. Defaults to this week.
   */
  async report(range: { from?: string; to?: string } = {}, warehouseId?: string) {
    const { from, to } = this.range(range);
    const riderWhere = warehouseId ? { warehouseId } : {};
    const [earned, delivered, failed] = await Promise.all([
      this.prisma.riderEarning.groupBy({ by: ['riderId', 'type'], where: { earnedAt: { gte: from, lt: to }, rider: riderWhere }, _sum: { amount: true } }),
      this.prisma.deliveryTask.groupBy({ by: ['riderId'], where: { status: 'DELIVERED', deliveredAt: { gte: from, lt: to }, riderId: { not: null }, rider: riderWhere }, _count: { _all: true } }),
      this.prisma.deliveryTask.groupBy({ by: ['riderId'], where: { failedAt: { gte: from, lt: to }, riderId: { not: null }, rider: riderWhere }, _count: { _all: true } }),
    ]);
    const ids = new Set<string>([...earned.map((e) => e.riderId), ...delivered.flatMap((d) => (d.riderId ? [d.riderId] : []))]);
    const riders = await this.prisma.rider.findMany({
      where: { ...riderWhere, OR: [{ status: 'ACTIVE' }, { id: { in: [...ids] } }] },
      select: { id: true, code: true, fullName: true, phone: true, status: true, availability: true, photoUrl: true, warehouse: { select: { id: true, name: true } } },
    });
    const count = (g: Array<{ riderId: string | null; _count: { _all: number } }>) => new Map(g.map((x) => [x.riderId, x._count._all]));
    const deliveredBy = count(delivered);
    const failedBy = count(failed);
    const round = (n: number) => Math.round(n * 100) / 100;
    const byType: Record<string, number> = {};
    const rows = riders.map((r) => {
      const types: Record<string, number> = {};
      for (const e of earned.filter((x) => x.riderId === r.id)) {
        const amt = Number(e._sum.amount ?? 0);
        types[e.type] = amt;
        byType[e.type] = round((byType[e.type] ?? 0) + amt);
      }
      const total = round(Object.values(types).reduce((a, b) => a + b, 0));
      return { rider: r, deliveries: deliveredBy.get(r.id) ?? 0, failed: failedBy.get(r.id) ?? 0, total, byType: types };
    });
    rows.sort((a, b) => b.total - a.total || b.deliveries - a.deliveries || a.rider.fullName.localeCompare(b.rider.fullName));
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      totals: {
        earned: round(rows.reduce((a, r) => a + r.total, 0)),
        deliveries: rows.reduce((a, r) => a + r.deliveries, 0),
        failed: rows.reduce((a, r) => a + r.failed, 0),
        riders: rows.filter((r) => r.total !== 0 || r.deliveries > 0).length,
      },
      byType,
      rows,
    };
  }

  /** Totals for today / this week / range, and the lines, newest first. */
  async summary(riderId: string, range: { from?: string; to?: string } = {}) {
    const now = new Date();
    const today = new Date(`${localParts(now, TIMEZONE).date}T00:00:00+05:30`);
    const week = new Date(`${weekKey(now, TIMEZONE)}T00:00:00+05:30`);
    const { from, to } = this.range(range);

    const sum = async (gte: Date, lt: Date) =>
      Number((await this.prisma.riderEarning.aggregate({ where: { riderId, earnedAt: { gte, lt } }, _sum: { amount: true } }))._sum.amount ?? 0);
    const [todayTotal, weekTotal, rangeTotal, lines, delivered, byType] = await Promise.all([
      sum(today, new Date(now.getTime() + 60_000)),
      sum(week, new Date(now.getTime() + 60_000)),
      sum(from, to),
      this.prisma.riderEarning.findMany({
        where: { riderId, earnedAt: { gte: from, lt: to } },
        orderBy: { earnedAt: 'desc' },
        take: 300,
        include: { task: { select: { taskNumber: true, order: { select: { orderNumber: true } } } } },
      }),
      this.prisma.deliveryTask.count({ where: { riderId, status: 'DELIVERED', deliveredAt: { gte: from, lt: to } } }),
      this.prisma.riderEarning.groupBy({ by: ['type'], where: { riderId, earnedAt: { gte: from, lt: to } }, _sum: { amount: true } }),
    ]);
    return {
      today: todayTotal,
      thisWeek: weekTotal,
      range: { from: from.toISOString(), to: to.toISOString(), total: rangeTotal, deliveries: delivered },
      byType: Object.fromEntries(byType.map((b) => [b.type, Number(b._sum.amount ?? 0)])),
      lines: lines.map((l) => ({
        id: l.id, type: l.type, amount: Number(l.amount), earnedAt: l.earnedAt, note: l.note,
        detail: l.detail, taskNumber: l.task?.taskNumber ?? null, orderNumber: l.task?.order?.orderNumber ?? null,
      })),
    };
  }
}
