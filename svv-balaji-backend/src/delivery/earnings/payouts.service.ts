import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Prisma, RiderPayoutMethod, RiderPayoutStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { SequenceService } from '../../common/sequence.service';
import { DispatchService } from '../dispatch/dispatch.service';

export class RecordRiderPayoutDto {
  @ApiProperty({ example: '2026-10-04', description: 'Pay every unpaid line earned up to the end of this IST day' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'upTo must be YYYY-MM-DD' }) upTo!: string;

  @ApiProperty({ enum: RiderPayoutMethod }) @IsEnum(RiderPayoutMethod) method!: RiderPayoutMethod;

  @ApiPropertyOptional({ description: 'UTR / UPI reference. Required for bank transfer and UPI.' })
  @IsOptional() @IsString() @MaxLength(80) reference?: string;

  @ApiPropertyOptional({ description: 'COD cash the rider holds, kept by them instead of being handed in. At most what they hold and what is owed.' })
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) cashOffset?: number;

  @ApiPropertyOptional({ description: 'When the money was paid (default now)' }) @IsOptional() @IsDateString() paidAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class VoidRiderPayoutDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(300) reason!: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const paise = (n: number | Prisma.Decimal | null | undefined) => Math.round(Number(n ?? 0) * 100);

/** First instant after the IST calendar day `day` (YYYY-MM-DD). */
export function endOfIstDay(day: string): Date {
  const start = Date.parse(`${day}T00:00:00+05:30`);
  if (Number.isNaN(start)) throw new BadRequestException('upTo must be a real date');
  return new Date(start + 24 * 3600_000);
}

/**
 * The money side of a payout, checked: gross is what the lines add up to,
 * the cash offset can be neither more than the rider holds nor more than is
 * owed, and something must actually be owed.
 */
export function settle(grossP: number, cashHeldP: number, offsetP: number) {
  if (grossP <= 0) throw new BadRequestException('Nothing is owed to this rider up to that date (clawbacks can cancel out earnings)');
  if (offsetP < 0) throw new BadRequestException('The cash set-off cannot be negative');
  if (offsetP > Math.max(0, cashHeldP)) throw new BadRequestException(`The rider holds only ₹${(Math.max(0, cashHeldP) / 100).toFixed(2)} in COD cash`);
  if (offsetP > grossP) throw new BadRequestException(`The cash set-off cannot exceed what is owed (₹${(grossP / 100).toFixed(2)})`);
  return { grossP, offsetP, netP: grossP - offsetP };
}

/**
 * Rider pay settlement. Earnings accrue per delivery (EarningsService); this
 * records them being paid. Nothing here moves money - staff pay by bank / UPI /
 * cash and record it with the reference, like affiliate payouts.
 */
@Injectable()
export class RiderPayoutsService {
  private readonly logger = new Logger(RiderPayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly dispatch: DispatchService,
  ) {}

  private async cashHeld(riderIds: string[]) {
    const g = await this.prisma.riderCashEntry.groupBy({ by: ['riderId'], where: { riderId: { in: riderIds } }, _sum: { amount: true } });
    return new Map(g.map((x) => [x.riderId, Number(x._sum.amount ?? 0)]));
  }

  /** Every rider with unpaid pay up to `upTo` (default today), with the cash they hold. */
  async due(upTo?: string, warehouseId?: string) {
    const day = upTo ?? new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    const cutoff = endOfIstDay(day);
    const owed = await this.prisma.riderEarning.groupBy({
      by: ['riderId'],
      where: { payoutId: null, earnedAt: { lt: cutoff }, ...(warehouseId ? { rider: { warehouseId } } : {}) },
      _sum: { amount: true },
      _count: { _all: true },
      _min: { earnedAt: true },
    });
    const ids = owed.map((o) => o.riderId);
    const [riders, cash, last] = await Promise.all([
      this.prisma.rider.findMany({
        where: { id: { in: ids } },
        select: { id: true, code: true, fullName: true, phone: true, status: true, warehouse: { select: { id: true, name: true } } },
      }),
      this.cashHeld(ids),
      this.prisma.riderPayout.groupBy({ by: ['riderId'], where: { riderId: { in: ids }, status: RiderPayoutStatus.PAID }, _max: { paidAt: true } }),
    ]);
    const lastBy = new Map(last.map((l) => [l.riderId, l._max.paidAt]));
    const byId = new Map(riders.map((r) => [r.id, r]));
    const rows = owed
      .map((o) => ({
        rider: byId.get(o.riderId)!,
        owed: round2(Number(o._sum.amount ?? 0)),
        lines: o._count._all,
        oldestUnpaid: o._min.earnedAt,
        cashHeld: round2(cash.get(o.riderId) ?? 0),
        lastPaidAt: lastBy.get(o.riderId) ?? null,
      }))
      .filter((r) => r.rider)
      .sort((a, b) => b.owed - a.owed);
    return {
      upTo: day,
      totals: { owed: round2(rows.reduce((s, r) => s + Math.max(0, r.owed), 0)), riders: rows.filter((r) => r.owed > 0).length },
      rows,
    };
  }

  /** What a payout up to `upTo` would settle, line by line. */
  async preview(riderId: string, upTo: string) {
    const rider = await this.prisma.rider.findUnique({ where: { id: riderId }, select: { id: true, code: true, fullName: true, phone: true } });
    if (!rider) throw new NotFoundException('Rider not found');
    const cutoff = endOfIstDay(upTo);
    const [lines, cash] = await Promise.all([
      this.prisma.riderEarning.findMany({
        where: { riderId, payoutId: null, earnedAt: { lt: cutoff } },
        orderBy: { earnedAt: 'asc' },
        include: { task: { select: { taskNumber: true, order: { select: { orderNumber: true } } } } },
      }),
      this.cashHeld([riderId]),
    ]);
    const gross = round2(lines.reduce((s, l) => s + Number(l.amount), 0));
    return {
      rider,
      upTo,
      gross,
      cashHeld: round2(cash.get(riderId) ?? 0),
      maxCashOffset: round2(Math.max(0, Math.min(gross, cash.get(riderId) ?? 0))),
      lines: lines.map((l) => ({
        id: l.id, type: l.type, amount: Number(l.amount), earnedAt: l.earnedAt, note: l.note,
        taskNumber: l.task?.taskNumber ?? null, orderNumber: l.task?.order?.orderNumber ?? null,
      })),
    };
  }

  async record(riderId: string, dto: RecordRiderPayoutDto, userId: string) {
    if (dto.method !== RiderPayoutMethod.CASH && !dto.reference?.trim()) {
      throw new BadRequestException('Record the bank / UPI reference (UTR) for this payment');
    }
    const cutoff = endOfIstDay(dto.upTo);
    if (cutoff.getTime() > Date.now() + 24 * 3600_000) throw new BadRequestException('upTo cannot be in the future');
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();

    const payout = await this.prisma.$transaction(async (tx) => {
      // The same lock as cash deposits: a deposit and a cash set-off cannot both spend the same rupees.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM riders WHERE id = ${riderId} FOR UPDATE`;
      if (!locked.length) throw new NotFoundException('Rider not found');

      const lines = await tx.riderEarning.findMany({ where: { riderId, payoutId: null, earnedAt: { lt: cutoff } }, select: { id: true, amount: true } });
      const grossP = lines.reduce((s, l) => s + paise(l.amount), 0);
      const cashP = paise((await tx.riderCashEntry.aggregate({ where: { riderId }, _sum: { amount: true } }))._sum.amount);
      const m = settle(grossP, cashP, paise(dto.cashOffset ?? 0));

      const payoutNumber = await this.sequence.next(tx, 'RPO', paidAt);
      const created = await tx.riderPayout.create({
        data: {
          payoutNumber, riderId, upTo: cutoff, grossAmount: m.grossP / 100, cashOffset: m.offsetP / 100, netPaid: m.netP / 100,
          lineCount: lines.length, method: dto.method, reference: dto.reference?.trim() || null, note: dto.note?.trim() || null,
          paidAt, recordedById: userId,
        },
      });
      // Claim exactly the lines summed above; a concurrent payout would find them taken.
      const claimed = await tx.riderEarning.updateMany({ where: { id: { in: lines.map((l) => l.id) }, payoutId: null }, data: { payoutId: created.id } });
      if (claimed.count !== lines.length) throw new ConflictException('These earnings were just paid by someone else - refresh and try again');
      if (m.offsetP > 0) {
        await tx.riderCashEntry.create({
          data: {
            riderId, type: 'ADJUSTMENT', amount: -(m.offsetP / 100), reference: payoutNumber,
            note: `COD cash kept by the rider against pay (${payoutNumber})`, recordedById: userId,
          },
        });
      }
      return created;
    });

    const net = Number(payout.netPaid);
    await this.dispatch
      .notify(
        riderId,
        'PAYOUT',
        'Pay settled',
        `₹${net.toFixed(2)} paid${Number(payout.cashOffset) > 0 ? ` (+ ₹${Number(payout.cashOffset).toFixed(2)} of COD cash kept)` : ''} for earnings up to ${dto.upTo}.`,
      )
      .catch((err) => this.logger.warn(`Payout notification failed: ${String(err)}`));
    return this.get(payout.id);
  }

  /** Undo a payout recorded in error: lines are owed again and any cash set-off goes back to cash held. */
  async void(payoutId: string, dto: VoidRiderPayoutDto, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      const p = await tx.riderPayout.findUnique({ where: { id: payoutId } });
      if (!p) throw new NotFoundException('Payout not found');
      await tx.$queryRaw`SELECT id FROM riders WHERE id = ${p.riderId} FOR UPDATE`;
      const fresh = await tx.riderPayout.findUniqueOrThrow({ where: { id: payoutId } });
      if (fresh.status === RiderPayoutStatus.VOIDED) throw new ConflictException('This payout is already voided');
      await tx.riderEarning.updateMany({ where: { payoutId }, data: { payoutId: null } });
      if (Number(fresh.cashOffset) > 0) {
        await tx.riderCashEntry.create({
          data: {
            riderId: fresh.riderId, type: 'ADJUSTMENT', amount: Number(fresh.cashOffset), reference: fresh.payoutNumber,
            note: `Payout ${fresh.payoutNumber} voided - cash set-off returned to cash held`, recordedById: userId,
          },
        });
      }
      await tx.riderPayout.update({
        where: { id: payoutId },
        data: { status: RiderPayoutStatus.VOIDED, voidedAt: new Date(), voidReason: dto.reason.trim(), voidedById: userId },
      });
    });
    return this.get(payoutId);
  }

  async list(q: { riderId?: string; status?: RiderPayoutStatus; from?: string; to?: string; page?: number; limit?: number }) {
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.min(100, Math.max(1, q.limit ?? 20));
    if (q.status && !(Object.values(RiderPayoutStatus) as string[]).includes(q.status)) throw new BadRequestException('Unknown status');
    const where: Prisma.RiderPayoutWhereInput = {
      ...(q.riderId ? { riderId: q.riderId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.from || q.to
        ? {
            paidAt: {
              ...(q.from ? { gte: new Date(`${q.from.slice(0, 10)}T00:00:00+05:30`) } : {}),
              ...(q.to ? { lt: endOfIstDay(q.to.slice(0, 10)) } : {}),
            },
          }
        : {}),
    };
    const [rows, total, sums] = await Promise.all([
      this.prisma.riderPayout.findMany({
        where,
        orderBy: { paidAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { rider: { select: { id: true, code: true, fullName: true, phone: true } }, recordedBy: { select: { fullName: true } } },
      }),
      this.prisma.riderPayout.count({ where }),
      this.prisma.riderPayout.aggregate({ where: { ...where, status: RiderPayoutStatus.PAID }, _sum: { netPaid: true, cashOffset: true, grossAmount: true } }),
    ]);
    return {
      data: rows.map((r) => this.money(r)),
      meta: { page, limit, total },
      summary: {
        gross: Number(sums._sum.grossAmount ?? 0),
        cashOffset: Number(sums._sum.cashOffset ?? 0),
        netPaid: Number(sums._sum.netPaid ?? 0),
      },
    };
  }

  async get(id: string) {
    const p = await this.prisma.riderPayout.findUnique({
      where: { id },
      include: {
        rider: { select: { id: true, code: true, fullName: true, phone: true } },
        recordedBy: { select: { fullName: true } },
        voidedBy: { select: { fullName: true } },
        earnings: {
          orderBy: { earnedAt: 'asc' },
          include: { task: { select: { taskNumber: true, order: { select: { orderNumber: true } } } } },
        },
      },
    });
    if (!p) throw new NotFoundException('Payout not found');
    return {
      ...this.money(p),
      earnings: p.earnings.map((l) => ({
        id: l.id, type: l.type, amount: Number(l.amount), earnedAt: l.earnedAt, note: l.note,
        taskNumber: l.task?.taskNumber ?? null, orderNumber: l.task?.order?.orderNumber ?? null,
      })),
    };
  }

  /** The rider app's view: their payouts and what is still unpaid. */
  async forRider(riderId: string) {
    const [payouts, unpaid] = await Promise.all([
      this.prisma.riderPayout.findMany({
        where: { riderId, status: RiderPayoutStatus.PAID },
        orderBy: { paidAt: 'desc' },
        take: 50,
        select: { id: true, payoutNumber: true, paidAt: true, upTo: true, grossAmount: true, cashOffset: true, netPaid: true, method: true, reference: true, lineCount: true },
      }),
      this.prisma.riderEarning.aggregate({ where: { riderId, payoutId: null }, _sum: { amount: true } }),
    ]);
    return {
      unpaid: round2(Number(unpaid._sum.amount ?? 0)),
      payouts: payouts.map((p) => ({ ...p, grossAmount: Number(p.grossAmount), cashOffset: Number(p.cashOffset), netPaid: Number(p.netPaid) })),
    };
  }

  private money<T extends { grossAmount: Prisma.Decimal; cashOffset: Prisma.Decimal; netPaid: Prisma.Decimal }>(p: T) {
    return { ...p, grossAmount: Number(p.grossAmount), cashOffset: Number(p.cashOffset), netPaid: Number(p.netPaid) };
  }
}
