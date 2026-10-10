import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Prisma, ProductionStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { scopedBranchId } from '../common/branch-scope';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { istRange } from '../pos/pos.logic';
import { costTotals, parseOtherCosts, rawMaterialCost, validateOtherCosts } from './production-cost.logic';

export class OtherCostDto {
  @ApiPropertyOptional({ example: 'Packaging material' })
  @IsString() @MaxLength(80)
  label: string;

  @ApiPropertyOptional({ example: 250 })
  @IsNumber() @Min(0)
  amount: number;
}

export class RecordProductionCostDto {
  @ApiPropertyOptional({ description: 'Leave out to use the automatic figure (consumed quantity x purchase rate). Send null to go back to it.', nullable: true })
  @IsOptional() @IsNumber() @Min(0)
  rawMaterialCost?: number | null;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0)
  labourCost?: number;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0)
  machineCost?: number;

  @ApiPropertyOptional({ description: 'Losses to charge to this run. Material lost in process is already in the raw material cost.' })
  @IsOptional() @IsNumber() @Min(0)
  lossCost?: number;

  @ApiPropertyOptional({ type: [OtherCostDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OtherCostDto)
  otherCosts?: OtherCostDto[];
}

const n = (d: Prisma.Decimal | null) => (d === null ? null : Number(d));

@Injectable()
export class ProductionCostService {
  constructor(private readonly prisma: PrismaService) {}

  /** What the raw material of a run cost, batch by batch, from the rate paid for it. */
  private async autoRaw(productionBatchId: string) {
    const cons = await this.prisma.productionConsumption.findMany({
      where: { productionBatchId },
      select: {
        quantityUsed: true,
        rawMaterialBatch: {
          select: {
            batchNumber: true, cropName: true,
            collection: { select: { purchaseRate: true } },
            supplierTransport: { select: { purchaseRate: true } },
          },
        },
      },
    });
    return rawMaterialCost(
      cons.map((c) => {
        const rate = c.rawMaterialBatch.collection?.purchaseRate ?? c.rawMaterialBatch.supplierTransport?.purchaseRate ?? null;
        return { batchNumber: c.rawMaterialBatch.batchNumber, quantityUsed: Number(c.quantityUsed), rate: rate === null ? null : Number(rate) };
      }),
    );
  }

  async get(id: string) {
    const pb = await this.prisma.productionBatch.findUnique({ where: { id } });
    if (!pb) throw new NotFoundException('Production batch not found');
    const auto = await this.autoRaw(id);
    const consumed = auto.lines.reduce((s, l) => s + l.quantityUsed, 0);
    const other = parseOtherCosts(pb.otherCosts);
    const recorded = pb.costRecordedAt !== null;
    const raw = recorded ? Number(pb.rawMaterialCost ?? 0) : auto.amount;
    const totals = costTotals(
      { raw, labour: Number(pb.labourCost ?? 0), machine: Number(pb.machineCost ?? 0), loss: Number(pb.lossCost ?? 0), other },
      n(pb.actualQuantity),
    );
    return {
      productionBatchId: pb.id,
      productionBatchNumber: pb.productionBatchNumber,
      status: pb.status,
      recorded,
      recordedAt: pb.costRecordedAt,
      unit: pb.unit,
      outputQuantity: n(pb.actualQuantity),
      consumedQuantity: Math.round(consumed * 100) / 100,
      processLossQuantity: n(pb.productionLoss),
      rawMaterial: {
        amount: raw,
        overridden: pb.rawMaterialCostOverridden,
        automatic: auto.amount,
        lines: auto.lines,
        missingRate: auto.missingRate,
      },
      labourCost: n(pb.labourCost),
      machineCost: n(pb.machineCost),
      lossCost: n(pb.lossCost),
      otherCosts: other,
      otherTotal: totals.otherTotal,
      totalCost: totals.total,
      costPerUnit: totals.perUnit,
    };
  }

  async record(id: string, dto: RecordProductionCostDto, userId: string) {
    const pb = await this.prisma.productionBatch.findUnique({ where: { id } });
    if (!pb) throw new NotFoundException('Production batch not found');
    if (pb.status === ProductionStatus.CANCELLED) throw new BadRequestException('A cancelled run has no production cost');
    if (pb.status === ProductionStatus.PLANNED) throw new BadRequestException('Start the run before recording its cost - nothing has been consumed yet');
    if (dto.otherCosts) {
      const err = validateOtherCosts(dto.otherCosts);
      if (err) throw new BadRequestException(err);
    }
    const auto = await this.autoRaw(id);
    // undefined = keep what is there (auto unless overridden before); null = back to auto.
    const override = dto.rawMaterialCost === undefined ? (pb.rawMaterialCostOverridden ? Number(pb.rawMaterialCost) : null) : dto.rawMaterialCost;
    const raw = override ?? auto.amount;
    const labour = dto.labourCost ?? Number(pb.labourCost ?? 0);
    const machine = dto.machineCost ?? Number(pb.machineCost ?? 0);
    const loss = dto.lossCost ?? Number(pb.lossCost ?? 0);
    const other = dto.otherCosts ? dto.otherCosts.map((o) => ({ label: o.label.trim(), amount: Math.round(o.amount * 100) / 100 })) : parseOtherCosts(pb.otherCosts);
    const t = costTotals({ raw, labour, machine, loss, other }, n(pb.actualQuantity));
    await this.prisma.productionBatch.update({
      where: { id },
      data: {
        rawMaterialCost: raw, rawMaterialCostOverridden: override !== null,
        labourCost: labour, machineCost: machine, lossCost: loss, otherCosts: other as unknown as Prisma.InputJsonValue,
        totalCost: t.total, costPerUnit: t.perUnit, costRecordedAt: new Date(), costRecordedById: userId,
      },
    });
    return this.get(id);
  }

  /**
   * Called when a run completes: output is now known, so the per-unit cost is
   * refreshed, and an automatic raw cost is re-read in case consumption changed.
   */
  async refreshAfterCompletion(id: string) {
    const pb = await this.prisma.productionBatch.findUnique({ where: { id } });
    if (!pb || pb.costRecordedAt === null) return;
    const raw = pb.rawMaterialCostOverridden ? Number(pb.rawMaterialCost ?? 0) : (await this.autoRaw(id)).amount;
    const t = costTotals(
      { raw, labour: Number(pb.labourCost ?? 0), machine: Number(pb.machineCost ?? 0), loss: Number(pb.lossCost ?? 0), other: parseOtherCosts(pb.otherCosts) },
      n(pb.actualQuantity),
    );
    await this.prisma.productionBatch.update({ where: { id }, data: { rawMaterialCost: raw, totalCost: t.total, costPerUnit: t.perUnit } });
  }

  /** FRD 34 Production Cost report: completed runs in an IST range, with their cost sheet. */
  async report(user: JwtPayload, q: { from?: string; to?: string; branchId?: string; productId?: string }) {
    let range: ReturnType<typeof istRange>;
    try {
      range = istRange(q.from, q.to);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const runs = await this.prisma.productionBatch.findMany({
      where: {
        status: ProductionStatus.COMPLETED,
        branchId: scopedBranchId(user, q.branchId),
        ...(q.productId ? { productId: q.productId } : {}),
        // Completion time when recorded; production date for runs completed before it was.
        OR: [
          { completedAt: { gte: range.start, lt: range.end } },
          { completedAt: null, productionDate: { gte: range.start, lt: range.end } },
        ],
      },
      orderBy: { productionDate: 'desc' },
      include: { product: { select: { id: true, name: true, sku: true } }, machine: { select: { code: true, name: true } } },
    });
    const rows = runs.map((r) => {
      const other = parseOtherCosts(r.otherCosts);
      const otherTotal = Math.round(other.reduce((s, o) => s + o.amount, 0) * 100) / 100;
      return {
        id: r.id,
        productionBatchNumber: r.productionBatchNumber,
        productionDate: r.productionDate,
        completedAt: r.completedAt,
        product: r.product,
        machine: r.machine ?? (r.machineName ? { code: null, name: r.machineName } : null),
        outputQuantity: n(r.actualQuantity),
        unit: r.unit,
        costRecorded: r.costRecordedAt !== null,
        rawMaterialCost: n(r.rawMaterialCost),
        labourCost: n(r.labourCost),
        machineCost: n(r.machineCost),
        lossCost: n(r.lossCost),
        otherCost: r.costRecordedAt ? otherTotal : null,
        totalCost: n(r.totalCost),
        costPerUnit: n(r.costPerUnit),
      };
    });
    const costed = rows.filter((r) => r.costRecorded);
    const sum = (k: 'rawMaterialCost' | 'labourCost' | 'machineCost' | 'lossCost' | 'otherCost' | 'totalCost') =>
      Math.round(costed.reduce((s, r) => s + (r[k] ?? 0), 0) * 100) / 100;

    const byProduct = new Map<string, { productId: string; product: string; runs: number; outputQuantity: number; totalCost: number; unit: string }>();
    for (const r of costed) {
      const p = byProduct.get(r.product.id) ?? { productId: r.product.id, product: r.product.name, runs: 0, outputQuantity: 0, totalCost: 0, unit: r.unit };
      p.runs++;
      p.outputQuantity += r.outputQuantity ?? 0;
      p.totalCost += r.totalCost ?? 0;
      byProduct.set(r.product.id, p);
    }
    return {
      from: range.from,
      to: range.to,
      totals: {
        runs: rows.length,
        costedRuns: costed.length,
        uncostedRuns: rows.length - costed.length,
        rawMaterialCost: sum('rawMaterialCost'),
        labourCost: sum('labourCost'),
        machineCost: sum('machineCost'),
        lossCost: sum('lossCost'),
        otherCost: sum('otherCost'),
        totalCost: sum('totalCost'),
      },
      byProduct: [...byProduct.values()].map((p) => ({
        ...p,
        outputQuantity: Math.round(p.outputQuantity * 100) / 100,
        totalCost: Math.round(p.totalCost * 100) / 100,
        averageCostPerUnit: p.outputQuantity > 0 ? Math.round((p.totalCost / p.outputQuantity) * 10000) / 10000 : null,
      })),
      runs: rows,
    };
  }
}
