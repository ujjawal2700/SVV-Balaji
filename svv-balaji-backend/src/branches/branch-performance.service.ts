import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * FRD 6.4 Branch Performance and FRD 6.5 Branch Reports.
 *
 * These are one thing, not two. 6.4 says the system tracks branch-wise
 * production, sales, inventory utilisation, procurement volume and operational
 * efficiency; 6.5 says a Branch Manager can generate reports over procurement,
 * production, warehouse, inventory and sales, and a Super Admin can see them
 * consolidated. That is the same aggregation, read once for a branch and once
 * for all of them — so it is computed once here and served both ways.
 *
 * It also answers FRD 34's "Branch Reports" family, which asks the Super Admin
 * to compare branches on production, procurement, sales, inventory and revenue.
 *
 * ## Every figure is scoped to a period
 *
 * A performance number with no window is not a performance number, it is a
 * running total that only ever goes up and cannot show whether anything
 * improved. Callers pass `from`/`to`; the default is the last 30 days.
 *
 * ## Inventory is reported per unit, deliberately
 *
 * `warehouse.status()` sums quantity while ignoring `unit`, so a warehouse
 * holding both KG and QUINTAL reports a meaningless occupancy figure. That bug
 * is not repeated here: stock is grouped by unit and the utilisation percentage
 * is only produced when a branch's stock shares one unit. A number that cannot
 * be trusted is worse than an honest absence, because it gets put in a report.
 */

/** A single measure, with the sample it came from. */
export interface Measure {
  value: number;
  /** How many records produced it. Zero means the figure is structural, not observed. */
  count: number;
}

export interface BranchPerformance {
  branchId: string;
  branchName: string;
  managerName: string | null;
  from: string;
  to: string;

  /** FRD 6.4 "procurement volume" — what came in from farmers. */
  procurement: {
    collections: number;
    /** Net weight received, by unit — never summed across units. */
    quantityByUnit: Record<string, number>;
    totalValue: number;
    farmersSupplying: number;
    inspections: number;
    inspectionsApproved: number;
  };

  /** FRD 6.4 "production". */
  production: {
    batches: number;
    completed: number;
    plannedQuantity: number;
    actualQuantity: number;
    /** Material consumed minus output, per FRD 20.5 as corrected. */
    totalLoss: number;
    /** Output as a share of input consumed. Null with nothing completed. */
    yieldPercent: number | null;
  };

  /** FRD 6.4 "sales" and FRD 34 "revenue". */
  sales: {
    orders: number;
    delivered: number;
    cancelled: number;
    /** Value of orders that were not cancelled. */
    revenue: number;
    outstanding: number;
  };

  /** FRD 6.4 "inventory utilisation". */
  inventory: {
    warehouses: number;
    rawMaterialByUnit: Record<string, number>;
    finishedGoodsPacks: number;
    totalCapacity: number;
    /**
     * Occupancy against capacity, or null when the branch's stock spans more
     * than one unit and the ratio would be arithmetic on incompatible numbers.
     */
    utilisationPercent: number | null;
  };

  /**
   * FRD 6.4 "operational efficiency".
   *
   * The FRD names it without defining it, so it is defined here explicitly
   * rather than left to whoever reads the number. Three rates the branch
   * actually controls, each shown separately so a poor composite can be
   * explained rather than merely reported:
   *
   *   - **Production yield** — output over input. How much of what was bought
   *     survived processing.
   *   - **Inspection approval rate** — approved harvest inspections over all of
   *     them. How well the branch's farmers are performing, and by extension
   *     how well the branch is advising them.
   *   - **On-time delivery** — orders delivered on or before the promised date.
   *     Only measurable since dispatch and delivery timestamps were added on
   *     19 Aug, so it reads null for anything shipped before then.
   *
   * The composite is the mean of whichever of the three have data. A component
   * with no input is excluded, not scored as zero — the same rule as farmer
   * performance, and for the same reason.
   */
  efficiency: {
    productionYieldPercent: number | null;
    inspectionApprovalPercent: number | null;
    onTimeDeliveryPercent: number | null;
    overallPercent: number | null;
  };
}

@Injectable()
export class BranchPerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  /** One branch. FRD 6.4, and the Branch Manager's half of 6.5. */
  async forBranch(branchId: string, from?: Date, to?: Date): Promise<BranchPerformance> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      include: { manager: { select: { fullName: true } } },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    return this.compute(branch.id, branch.name, branch.manager?.fullName ?? null, ...this.window(from, to));
  }

  /**
   * Every branch, side by side. The Super Admin's half of FRD 6.5.
   *
   * Computed per branch rather than as one grouped query on purpose: the
   * measures are not all sums, and several (yield, approval rate, on-time
   * delivery) are ratios that cannot be aggregated by adding them up. Branch
   * counts are in single digits, so the clarity is worth more than the queries.
   */
  async consolidated(from?: Date, to?: Date): Promise<BranchPerformance[]> {
    const branches = await this.prisma.branch.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: { manager: { select: { fullName: true } } },
    });

    const [start, end] = this.window(from, to);

    return Promise.all(
      branches.map((b) => this.compute(b.id, b.name, b.manager?.fullName ?? null, start, end)),
    );
  }

  // --- internals ------------------------------------------------------------

  /** Defaults to the last 30 days. `to` is inclusive of the whole day. */
  private window(from?: Date, to?: Date): [Date, Date] {
    const end = to ? new Date(to) : new Date();
    end.setHours(23, 59, 59, 999);

    const start = from ? new Date(from) : new Date(end);
    if (!from) start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);

    return [start, end];
  }

  private async compute(
    branchId: string,
    branchName: string,
    managerName: string | null,
    from: Date,
    to: Date,
  ): Promise<BranchPerformance> {
    const period = { gte: from, lte: to };

    const [collections, inspections, productions, orders, warehouses, rmStock, fgStock] =
      await Promise.all([
        this.prisma.rawMaterialCollection.findMany({
          where: { branchId, collectionDate: period },
          select: { netWeight: true, unit: true, totalAmount: true, farmerId: true },
        }),
        this.prisma.harvestInspection.findMany({
          where: { farmer: { branchId }, inspectionDate: period },
          select: { result: true },
        }),
        this.prisma.productionBatch.findMany({
          where: { branchId, productionDate: period },
          select: {
            status: true,
            plannedQuantity: true,
            actualQuantity: true,
            productionLoss: true,
            consumptions: { select: { quantityUsed: true } },
          },
        }),
        this.prisma.order.findMany({
          where: { branchId, orderDate: period },
          select: {
            status: true,
            total: true,
            paymentStatus: true,
            requiredByDate: true,
            deliveredAt: true,
          },
        }),
        this.prisma.warehouse.findMany({
          where: { branchId, isActive: true },
          select: { id: true, capacity: true },
        }),
        this.prisma.warehouseStock.findMany({
          where: { warehouse: { branchId } },
          select: { quantity: true, unit: true },
        }),
        this.prisma.finishedGoodsStock.findMany({
          where: { warehouse: { branchId } },
          select: { quantity: true },
        }),
      ]);

    // --- procurement ---
    const quantityByUnit = this.sumByUnit(collections.map((c) => ({ q: c.netWeight, u: c.unit })));
    const inspectionsApproved = inspections.filter((i) => i.result === 'APPROVED').length;

    // --- production ---
    const completed = productions.filter((p) => p.status === 'COMPLETED');
    const actualQuantity = this.sum(completed.map((p) => p.actualQuantity));
    const inputConsumed = completed.reduce(
      (total, p) => total + this.sum(p.consumptions.map((c) => c.quantityUsed)),
      0,
    );
    const yieldPercent =
      inputConsumed > 0 ? this.round((actualQuantity / inputConsumed) * 100) : null;

    // --- sales ---
    const live = orders.filter((o) => o.status !== 'CANCELLED');
    const deliveredOrders = orders.filter((o) => o.status === 'DELIVERED');
    const measurable = deliveredOrders.filter((o) => o.deliveredAt && o.requiredByDate);
    const onTime = measurable.filter((o) => o.deliveredAt! <= o.requiredByDate!).length;

    // --- inventory ---
    const rawMaterialByUnit = this.sumByUnit(rmStock.map((s) => ({ q: s.quantity, u: s.unit })));
    const units = Object.keys(rawMaterialByUnit);
    const totalCapacity = this.sum(warehouses.map((w) => w.capacity));
    // Only when every stock row shares a unit — see the note at the top.
    const utilisationPercent =
      units.length === 1 && totalCapacity > 0
        ? this.round((rawMaterialByUnit[units[0]] / totalCapacity) * 100)
        : null;

    const efficiency = {
      productionYieldPercent: yieldPercent,
      inspectionApprovalPercent: inspections.length
        ? this.round((inspectionsApproved / inspections.length) * 100)
        : null,
      onTimeDeliveryPercent: measurable.length
        ? this.round((onTime / measurable.length) * 100)
        : null,
      overallPercent: null as number | null,
    };
    const present = [
      efficiency.productionYieldPercent,
      efficiency.inspectionApprovalPercent,
      efficiency.onTimeDeliveryPercent,
    ].filter((v): v is number => v !== null);
    efficiency.overallPercent = present.length
      ? this.round(present.reduce((a, b) => a + b, 0) / present.length)
      : null;

    return {
      branchId,
      branchName,
      managerName,
      from: from.toISOString(),
      to: to.toISOString(),

      procurement: {
        collections: collections.length,
        quantityByUnit,
        totalValue: this.round(this.sum(collections.map((c) => c.totalAmount))),
        farmersSupplying: new Set(collections.map((c) => c.farmerId)).size,
        inspections: inspections.length,
        inspectionsApproved,
      },

      production: {
        batches: productions.length,
        completed: completed.length,
        plannedQuantity: this.round(this.sum(productions.map((p) => p.plannedQuantity))),
        actualQuantity: this.round(actualQuantity),
        totalLoss: this.round(this.sum(completed.map((p) => p.productionLoss))),
        yieldPercent,
      },

      sales: {
        orders: orders.length,
        delivered: deliveredOrders.length,
        cancelled: orders.filter((o) => o.status === 'CANCELLED').length,
        revenue: this.round(this.sum(live.map((o) => o.total))),
        outstanding: this.round(
          this.sum(
            live
              .filter((o) => o.paymentStatus !== 'PAID' && o.paymentStatus !== 'REFUNDED')
              .map((o) => o.total),
          ),
        ),
      },

      inventory: {
        warehouses: warehouses.length,
        rawMaterialByUnit,
        finishedGoodsPacks: fgStock.reduce((total, s) => total + s.quantity, 0),
        totalCapacity: this.round(totalCapacity),
        utilisationPercent,
      },

      efficiency,
    };
  }

  /** Decimal columns arrive as Prisma.Decimal; never coerce them earlier than here. */
  private sum(values: Array<Prisma.Decimal | number | null>): number {
    return values.reduce<number>((total, v) => total + (v === null ? 0 : Number(v)), 0);
  }

  /**
   * Group quantities by their unit.
   *
   * The whole point: KG and QUINTAL do not add up, and a report that adds them
   * produces a number that looks authoritative and means nothing.
   */
  private sumByUnit(rows: Array<{ q: Prisma.Decimal | number; u: string }>): Record<string, number> {
    const byUnit: Record<string, number> = {};
    for (const row of rows) {
      byUnit[row.u] = this.round((byUnit[row.u] ?? 0) + Number(row.q));
    }
    return byUnit;
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
