import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { scopedBranchId } from '../common/branch-scope';

/**
 * Loss / Yield Tracking.
 *
 * Read-only aggregation over the three processing phases that already exist -
 * Cleaning & Grading, Production, and Finished Goods packaging. It invents no
 * new phase and writes nothing; it walks the chain each phase already records
 * (RawMaterialBatch -> CleaningGradingRecord, ProductionConsumption ->
 * ProductionBatch, ProductionBatch -> FinishedGoodsBatch) and reports the
 * loss at each stage plus the totals across the run.
 *
 * "Loss" and "by-product" are kept separate throughout: wastageQuantity /
 * productionLoss are material that is simply gone, while byProductQuantity is
 * material recovered with resale value (bran, husk, oil cake). Both eat into
 * yield, but only one of them is a pure write-off.
 */

/** FRD-agreed band: 4-8% total loss is expected. Above it gets flagged. */
const NORMAL_LOSS_CEILING_PERCENT = 8;

/** A run losing more than this multiple of its machine's own historical average gets flagged. */
const MACHINE_DEVIATION_MULTIPLIER = 1.5;

export type AlertLevel = 'NORMAL' | 'HIGH';

export interface StageBreakdown {
  stage: 'CLEANING_GRADING' | 'PRODUCTION' | 'FINISHED_GOODS';
  inputQuantity: number;
  outputQuantity: number;
  lossQuantity: number;
  lossPercent: number | null;
  byProductQuantity: number;
}

export interface YieldChain {
  productionBatchId: string;
  productionBatchNumber: string;
  productId: string;
  productName: string;
  branchId: string;
  machineName: string | null;
  machineNumber: string | null;
  productionDate: string;
  stages: StageBreakdown[];
  totalInput: number;
  totalLoss: number;
  totalByProduct: number;
  finalOutput: number;
  overallYieldPercent: number | null;
  totalLossPercent: number | null;
  alertLevel: AlertLevel;
  fgBatchNumbers: string[];
}

@Injectable()
export class YieldTrackingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Paginated/filterable list of chains, one row per production run. */
  async list(
    user: JwtPayload,
    filters: { productId?: string; branchId?: string; from?: string; to?: string; page?: number; pageSize?: number },
  ) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const pageSize = filters.pageSize && filters.pageSize > 0 ? Math.min(filters.pageSize, 100) : 20;

    const where: Prisma.ProductionBatchWhereInput = {
      status: 'COMPLETED',
      branchId: scopedBranchId(user, filters.branchId),
      productId: filters.productId,
      productionDate: {
        gte: filters.from ? new Date(filters.from) : undefined,
        lte: filters.to ? new Date(filters.to) : undefined,
      },
    };

    const [total, batches] = await Promise.all([
      this.prisma.productionBatch.count({ where }),
      this.prisma.productionBatch.findMany({
        where,
        orderBy: { productionDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true },
      }),
    ]);

    const chains = await Promise.all(batches.map((b) => this.buildChain(b.id)));

    return {
      data: chains,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** Single-chain detail, given a productionBatchId or an fgBatchNumber. */
  async detail(args: { productionBatchId?: string; fgBatchNumber?: string }): Promise<YieldChain> {
    let productionBatchId = args.productionBatchId;

    if (!productionBatchId && args.fgBatchNumber) {
      const fg = await this.prisma.finishedGoodsBatch.findUnique({
        where: { fgBatchNumber: args.fgBatchNumber },
        select: { productionBatchId: true },
      });
      if (!fg) throw new NotFoundException(`Finished goods batch ${args.fgBatchNumber} not found`);
      productionBatchId = fg.productionBatchId;
    }

    if (!productionBatchId) {
      throw new NotFoundException('Provide either productionBatchId or fgBatchNumber');
    }

    return this.buildChain(productionBatchId);
  }

  private async buildChain(productionBatchId: string): Promise<YieldChain> {
    const production = await this.prisma.productionBatch.findUnique({
      where: { id: productionBatchId },
      include: {
        product: { select: { id: true, name: true } },
        consumptions: {
          include: {
            rawMaterialBatch: {
              include: { cleaningGradingRecords: true },
            },
          },
        },
        finishedGoodsBatches: { select: { fgBatchNumber: true, netWeight: true, packCount: true } },
      },
    });
    if (!production) throw new NotFoundException('Production batch not found');

    // --- Cleaning & Grading stage: sum across every raw material batch feeding this run ---
    let cleaningInput = 0;
    let cleaningWastage = 0;
    let cleaningByProduct = 0;

    for (const consumption of production.consumptions) {
      const rmQuantity = Number(consumption.rawMaterialBatch.quantity ?? consumption.quantityUsed);
      cleaningInput += rmQuantity;
      for (const record of consumption.rawMaterialBatch.cleaningGradingRecords) {
        cleaningWastage += Number(record.wastageQuantity ?? 0);
        cleaningByProduct += Number(record.byProductQuantity ?? 0);
      }
    }
    const cleaningOutput = Math.max(0, cleaningInput - cleaningWastage - cleaningByProduct);

    // --- Production stage ---
    const productionInput = production.consumptions.reduce(
      (sum, c) => sum + Number(c.quantityUsed),
      0,
    );
    const productionOutput = Number(production.actualQuantity ?? 0);
    const productionLoss = Number(production.productionLoss ?? 0);
    const productionByProduct = Number(production.byProductQuantity ?? 0);

    // --- Finished Goods stage: output = netWeight * packCount, summed per batch ---
    const fgOutput = production.finishedGoodsBatches.reduce(
      (sum, fg) => sum + Number(fg.netWeight) * fg.packCount,
      0,
    );
    const fgLoss = Math.max(0, productionOutput - fgOutput);

    const stages: StageBreakdown[] = [
      {
        stage: 'CLEANING_GRADING',
        inputQuantity: this.round(cleaningInput),
        outputQuantity: this.round(cleaningOutput),
        lossQuantity: this.round(cleaningWastage),
        lossPercent: this.percent(cleaningWastage, cleaningInput),
        byProductQuantity: this.round(cleaningByProduct),
      },
      {
        stage: 'PRODUCTION',
        inputQuantity: this.round(productionInput),
        outputQuantity: this.round(productionOutput),
        lossQuantity: this.round(productionLoss),
        lossPercent: this.percent(productionLoss, productionInput),
        byProductQuantity: this.round(productionByProduct),
      },
      {
        stage: 'FINISHED_GOODS',
        inputQuantity: this.round(productionOutput),
        outputQuantity: this.round(fgOutput),
        lossQuantity: this.round(fgLoss),
        lossPercent: this.percent(fgLoss, productionOutput),
        byProductQuantity: 0,
      },
    ];

    // Chain totals. Total input is what entered cleaning - the earliest point
    // in this chain. Total loss sums pure write-offs only, not by-product.
    const totalInput = cleaningInput;
    const totalLoss = cleaningWastage + productionLoss + fgLoss;
    const totalByProduct = cleaningByProduct + productionByProduct;
    const finalOutput = fgOutput;
    const overallYieldPercent = this.percent(finalOutput, totalInput, true);
    const totalLossPercent = this.percent(totalLoss, totalInput);

    const alertLevel: AlertLevel =
      totalLossPercent !== null && totalLossPercent > NORMAL_LOSS_CEILING_PERCENT ? 'HIGH' : 'NORMAL';

    return {
      productionBatchId: production.id,
      productionBatchNumber: production.productionBatchNumber,
      productId: production.product.id,
      productName: production.product.name,
      branchId: production.branchId,
      machineName: production.machineName,
      machineNumber: production.machineNumber,
      productionDate: production.productionDate.toISOString(),
      stages,
      totalInput: this.round(totalInput),
      totalLoss: this.round(totalLoss),
      totalByProduct: this.round(totalByProduct),
      finalOutput: this.round(finalOutput),
      overallYieldPercent,
      totalLossPercent,
      alertLevel,
      fgBatchNumbers: production.finishedGoodsBatches.map((fg) => fg.fgBatchNumber),
    };
  }

  /**
   * Farmer/supplier quality signal (FRD 7.6 pattern, extended rather than
   * duplicated): average loss % across a farmer's raw material batches,
   * pooling cleaning wastage and the production loss of the runs that
   * consumed them. Repeated high-loss sources stand out at the top.
   */
  async farmerQuality(user: JwtPayload, limit = 20) {
    const rmBatches = await this.prisma.rawMaterialBatch.findMany({
      where: {
        farmer: { branchId: scopedBranchId(user) },
        farmerId: { not: null },
      },
      select: {
        id: true,
        quantity: true,
        farmerId: true,
        farmer: { select: { id: true, farmerCode: true, fullName: true } },
        cleaningGradingRecords: { select: { wastageQuantity: true } },
        consumptions: {
          select: {
            quantityUsed: true,
            productionBatch: { select: { productionLoss: true, actualQuantity: true, consumptions: { select: { quantityUsed: true } } } },
          },
        },
      },
    });

    const byFarmer = new Map<
      string,
      { farmerCode: string | null; fullName: string; batches: number; lossPercentSum: number; lossSamples: number }
    >();

    for (const rm of rmBatches) {
      if (!rm.farmer) continue;
      const input = Number(rm.quantity);
      const wastage = rm.cleaningGradingRecords.reduce((s, r) => s + Number(r.wastageQuantity ?? 0), 0);
      const cleaningLossPct = this.percent(wastage, input);

      const row = byFarmer.get(rm.farmer.id) ?? {
        farmerCode: rm.farmer.farmerCode,
        fullName: rm.farmer.fullName,
        batches: 0,
        lossPercentSum: 0,
        lossSamples: 0,
      };
      row.batches += 1;
      if (cleaningLossPct !== null) {
        row.lossPercentSum += cleaningLossPct;
        row.lossSamples += 1;
      }

      // Attribute a share of each production run's loss back to this batch,
      // proportional to how much of that run's total input it supplied.
      for (const pc of rm.consumptions) {
        const runTotalInput = pc.productionBatch.consumptions.reduce(
          (s, c) => s + Number(c.quantityUsed),
          0,
        );
        if (runTotalInput <= 0) continue;
        const runLossPct = this.percent(Number(pc.productionBatch.productionLoss ?? 0), runTotalInput);
        if (runLossPct !== null) {
          row.lossPercentSum += runLossPct;
          row.lossSamples += 1;
        }
      }

      byFarmer.set(rm.farmer.id, row);
    }

    return [...byFarmer.entries()]
      .map(([farmerId, row]) => ({
        farmerId,
        farmerCode: row.farmerCode,
        fullName: row.fullName,
        rawMaterialBatches: row.batches,
        averageLossPercent: row.lossSamples > 0 ? this.round(row.lossPercentSum / row.lossSamples) : null,
        flagged: row.lossSamples > 0 && row.lossPercentSum / row.lossSamples > NORMAL_LOSS_CEILING_PERCENT,
      }))
      .filter((r) => r.averageLossPercent !== null)
      .sort((a, b) => (b.averageLossPercent ?? 0) - (a.averageLossPercent ?? 0))
      .slice(0, limit);
  }

  /**
   * Machine health signal: for each machine, its historical average loss %,
   * and any completed run whose loss % is a significant jump above that
   * average (>1.5x) - a candidate for maintenance review.
   */
  async machineHealth(user: JwtPayload) {
    const runs = await this.prisma.productionBatch.findMany({
      where: {
        status: 'COMPLETED',
        branchId: scopedBranchId(user),
        machineName: { not: null },
      },
      select: {
        id: true,
        productionBatchNumber: true,
        machineName: true,
        machineNumber: true,
        productionLoss: true,
        productionDate: true,
        consumptions: { select: { quantityUsed: true } },
      },
      orderBy: { productionDate: 'desc' },
    });

    const byMachine = new Map<
      string,
      { machineName: string; machineNumber: string | null; runs: Array<{ id: string; productionBatchNumber: string; lossPercent: number; productionDate: Date }> }
    >();

    for (const run of runs) {
      const input = run.consumptions.reduce((s, c) => s + Number(c.quantityUsed), 0);
      const lossPercent = this.percent(Number(run.productionLoss ?? 0), input);
      if (lossPercent === null) continue;

      const key = `${run.machineName}::${run.machineNumber ?? ''}`;
      const row = byMachine.get(key) ?? { machineName: run.machineName!, machineNumber: run.machineNumber, runs: [] };
      row.runs.push({
        id: run.id,
        productionBatchNumber: run.productionBatchNumber,
        lossPercent,
        productionDate: run.productionDate,
      });
      byMachine.set(key, row);
    }

    const machines = [...byMachine.values()].map((m) => {
      const historicalAverage =
        m.runs.reduce((s, r) => s + r.lossPercent, 0) / m.runs.length;

      const flaggedRuns = m.runs
        .filter((r) => r.lossPercent > historicalAverage * MACHINE_DEVIATION_MULTIPLIER && historicalAverage > 0)
        .map((r) => ({
          productionBatchId: r.id,
          productionBatchNumber: r.productionBatchNumber,
          lossPercent: this.round(r.lossPercent),
          productionDate: r.productionDate.toISOString(),
        }));

      return {
        machineName: m.machineName,
        machineNumber: m.machineNumber,
        totalRuns: m.runs.length,
        historicalAverageLossPercent: this.round(historicalAverage),
        flaggedRuns,
        needsMaintenanceReview: flaggedRuns.length > 0,
      };
    });

    return machines.sort((a, b) => b.flaggedRuns.length - a.flaggedRuns.length);
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private percent(part: number, whole: number, allowOverHundred = false): number | null {
    if (!whole || whole <= 0) return null;
    const pct = (part / whole) * 100;
    return this.round(allowOverHundred ? pct : Math.max(0, pct));
  }
}
