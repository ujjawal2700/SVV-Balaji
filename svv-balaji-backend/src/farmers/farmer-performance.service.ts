import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * FRD 7.6 — Farmer Performance.
 *
 * "The system automatically tracks farmer performance based on procurement
 * quality and delivery consistency." Automatically is the operative word: none
 * of this is entered by anyone. Every number below is derived from records the
 * farmer's own harvests already produced, which is what makes the rating
 * defensible when a farmer disputes it — every component can be walked back to
 * the inspections and collections behind it.
 *
 * ## The four parameters, and where each comes from
 *
 * | FRD 7.6 parameter    | Source                                              |
 * |----------------------|-----------------------------------------------------|
 * | Crop Quality         | HarvestInspection results + measured moisture / foreign matter |
 * | Delivery Timeliness  | Collection date against the agreement's harvest date |
 * | Procurement Quantity | Delivered net weight against the agreed quantity     |
 * | Complaint Records    | **Nothing — FRD 32 is not built**                    |
 *
 * ## Why complaints score nothing rather than scoring full marks
 *
 * There is no complaint model in this system. The honest handling is to report
 * the component as uncaptured and leave it out of the average entirely. The
 * tempting alternative — treat "no complaints" as a perfect score — would hand
 * every farmer free marks for a check that never ran, and would silently
 * re-weight the moment section 32 ships and real complaints start pulling it
 * down. A component with no input is null, and null components are excluded.
 */

/**
 * How the components combine.
 *
 * Crop quality carries the most weight because this is a food business: a
 * farmer who delivers late is an inconvenience, a farmer who delivers wet grain
 * is a rejected batch. Weights are renormalised over whichever components
 * actually have data, so a farmer with agreements scores on three and a farmer
 * with none scores on one — rather than being punished for the absence.
 */
const WEIGHTS = {
  cropQuality: 0.5,
  deliveryTimeliness: 0.25,
  procurementQuantity: 0.25,
  /** FRD 7.6 lists it; there is no source. Stays 0 until section 32 exists. */
  complaintRecords: 0,
} as const;

/** Grain above this is wet enough to be a problem. Mirrors the inspection form's guidance. */
const MOISTURE_TARGET_PERCENT = 12;
/** Foreign matter above this starts costing cleaning time. */
const FOREIGN_MATTER_TARGET_PERCENT = 2;
/** A delivery this many days after the agreed harvest date scores zero for timeliness. */
const LATENESS_ZERO_AT_DAYS = 30;

export interface PerformanceComponent {
  /** 0-100, or null when there is no input for it. */
  score: number | null;
  /** How many records the score was computed from. Zero means "no basis". */
  sampleSize: number;
  /** One line the farmer could be shown. Never a bare number. */
  explanation: string;
}

export interface FarmerPerformance {
  farmerId: string;
  cropQuality: PerformanceComponent;
  deliveryTimeliness: PerformanceComponent;
  procurementQuantity: PerformanceComponent;
  complaintRecords: PerformanceComponent;
  /** Weighted 0-100 over the components that have data. Null when none do. */
  overallRating: number | null;
  /** The same figure as 0-5 stars, for display only. */
  stars: number | null;
  totalDelivered: string;
  totalCollections: number;
  computedAt: string;
}

@Injectable()
export class FarmerPerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recompute and persist. Call after anything that changes the inputs.
   *
   * Deliberately never throws on a farmer that has since been deleted — this
   * runs after a collection or inspection write, and a performance refresh
   * failing must not roll back a weighbridge entry.
   */
  async recalculate(farmerId: string): Promise<FarmerPerformance | null> {
    const exists = await this.prisma.farmer.findUnique({
      where: { id: farmerId },
      select: { id: true },
    });
    if (!exists) return null;

    const performance = await this.compute(farmerId);

    await this.prisma.farmer.update({
      where: { id: farmerId },
      data: {
        qualityRating: performance.overallRating,
        cropQualityScore: performance.cropQuality.score,
        deliveryTimelinessScore: performance.deliveryTimeliness.score,
        procurementQuantityScore: performance.procurementQuantity.score,
        performanceUpdatedAt: new Date(),
      },
    });

    return performance;
  }

  /** Read the full breakdown, recomputed live so the explanation cannot be stale. */
  async forFarmer(farmerId: string): Promise<FarmerPerformance> {
    const farmer = await this.prisma.farmer.findUnique({
      where: { id: farmerId },
      select: { id: true },
    });
    if (!farmer) throw new NotFoundException(`Farmer ${farmerId} not found`);

    return this.compute(farmerId);
  }

  // --- the calculation ------------------------------------------------------

  private async compute(farmerId: string): Promise<FarmerPerformance> {
    const [inspections, collections] = await Promise.all([
      this.prisma.harvestInspection.findMany({
        where: { farmerId },
        select: { result: true, moistureLevel: true, foreignMatter: true },
      }),
      this.prisma.rawMaterialCollection.findMany({
        where: { farmerId },
        select: {
          netWeight: true,
          collectionDate: true,
          inspection: {
            select: {
              agreement: { select: { harvestDate: true, expectedQuantity: true, id: true } },
            },
          },
        },
      }),
    ]);

    const cropQuality = this.scoreCropQuality(inspections);
    const deliveryTimeliness = this.scoreDeliveryTimeliness(collections);
    const procurementQuantity = this.scoreProcurementQuantity(collections);
    const complaintRecords = this.scoreComplaints();

    const overallRating = this.combine({
      cropQuality: cropQuality.score,
      deliveryTimeliness: deliveryTimeliness.score,
      procurementQuantity: procurementQuantity.score,
      complaintRecords: complaintRecords.score,
    });

    const totalDelivered = collections.reduce(
      (sum, c) => sum.plus(c.netWeight),
      new Prisma.Decimal(0),
    );

    return {
      farmerId,
      cropQuality,
      deliveryTimeliness,
      procurementQuantity,
      complaintRecords,
      overallRating,
      stars: overallRating === null ? null : Math.round((overallRating / 20) * 10) / 10,
      totalDelivered: totalDelivered.toString(),
      totalCollections: collections.length,
      computedAt: new Date().toISOString(),
    };
  }

  /**
   * Crop Quality — did the harvest pass inspection, and how clean was it.
   *
   * Two halves. The pass rate is the blunt signal: what share of this farmer's
   * harvests were approved outright. The measured half reads moisture and
   * foreign matter, because a farmer whose crop is approved at 11% moisture is
   * doing better than one scraping in at 14%, and the pass rate alone cannot
   * see that difference.
   *
   * HOLD_FOR_REINSPECTION counts as a half pass rather than a fail — it means
   * "come back", not "rejected".
   */
  private scoreCropQuality(
    inspections: Array<{
      result: string;
      moistureLevel: Prisma.Decimal | null;
      foreignMatter: Prisma.Decimal | null;
    }>,
  ): PerformanceComponent {
    if (inspections.length === 0) {
      return { score: null, sampleSize: 0, explanation: 'No harvest inspections yet.' };
    }

    const credit = inspections.reduce((sum, i) => {
      if (i.result === 'APPROVED') return sum + 1;
      if (i.result === 'HOLD_FOR_REINSPECTION') return sum + 0.5;
      return sum;
    }, 0);
    const passRate = (credit / inspections.length) * 100;

    // Only inspections that actually recorded a measurement can contribute.
    const measured = inspections.filter((i) => i.moistureLevel !== null || i.foreignMatter !== null);

    let score = passRate;
    let measuredNote = '';

    if (measured.length > 0) {
      const cleanliness =
        measured.reduce((sum, i) => {
          const moisture = i.moistureLevel === null ? null : Number(i.moistureLevel);
          const foreign = i.foreignMatter === null ? null : Number(i.foreignMatter);

          const moistureScore =
            moisture === null ? null : this.decayAboveTarget(moisture, MOISTURE_TARGET_PERCENT);
          const foreignScore =
            foreign === null ? null : this.decayAboveTarget(foreign, FOREIGN_MATTER_TARGET_PERCENT);

          const parts = [moistureScore, foreignScore].filter((p): p is number => p !== null);
          return sum + parts.reduce((a, b) => a + b, 0) / parts.length;
        }, 0) / measured.length;

      // Pass rate leads; the measurements adjust it. A farmer who never fails
      // an inspection should not drop below a farmer who often does, merely
      // because their moisture readings sit closer to the limit.
      score = passRate * 0.7 + cleanliness * 0.3;
      measuredNote = ` Moisture and foreign matter recorded on ${measured.length} of them.`;
    }

    const approved = inspections.filter((i) => i.result === 'APPROVED').length;

    return {
      score: this.clamp(score),
      sampleSize: inspections.length,
      explanation:
        `${approved} of ${inspections.length} harvest inspections approved.${measuredNote}`,
    };
  }

  /**
   * Delivery Timeliness — did the harvest arrive when the agreement said it would.
   *
   * Scored only against collections whose agreement actually named a harvest
   * date. A collection with no agreed date is not late; it is unscheduled, and
   * counting it as on-time would inflate the score of farmers who simply never
   * signed a dated agreement.
   *
   * Early or on the day is full marks. Lateness decays linearly to zero at 30
   * days, because a month late is a different crop cycle.
   */
  private scoreDeliveryTimeliness(
    collections: Array<{
      collectionDate: Date;
      inspection: { agreement: { harvestDate: Date | null } | null } | null;
    }>,
  ): PerformanceComponent {
    const dated = collections.filter((c) => c.inspection?.agreement?.harvestDate);

    if (dated.length === 0) {
      return {
        score: null,
        sampleSize: 0,
        explanation:
          collections.length === 0
            ? 'No collections yet.'
            : `${collections.length} collection${collections.length === 1 ? '' : 's'}, none against an agreement with an agreed harvest date.`,
      };
    }

    let onTime = 0;
    const total = dated.reduce((sum, c) => {
      const expected = c.inspection!.agreement!.harvestDate!;
      const daysLate = Math.round(
        (this.startOfDay(c.collectionDate).getTime() - this.startOfDay(expected).getTime()) /
          86_400_000,
      );
      if (daysLate <= 0) onTime += 1;
      return sum + this.clamp(100 - (Math.max(0, daysLate) / LATENESS_ZERO_AT_DAYS) * 100);
    }, 0);

    return {
      score: this.clamp(total / dated.length),
      sampleSize: dated.length,
      explanation: `${onTime} of ${dated.length} deliveries on or before the agreed harvest date.`,
    };
  }

  /**
   * Procurement Quantity — did the farmer deliver what they agreed to.
   *
   * A fulfilment ratio, not a volume. Scoring raw tonnage would rank a
   * large farm above a small one for being large, which says nothing about
   * performance; delivering 95% of what you committed to is the same
   * achievement at any size.
   *
   * Over-delivery is capped at 100 rather than rewarded — surplus above the
   * agreement is not something the buyer planned for or is obliged to take.
   */
  private scoreProcurementQuantity(
    collections: Array<{
      netWeight: Prisma.Decimal;
      inspection: {
        agreement: { id: string; expectedQuantity: Prisma.Decimal } | null;
      } | null;
    }>,
  ): PerformanceComponent {
    // Group by agreement: several collections can fulfil one agreement, and
    // each should be judged against its own commitment.
    const byAgreement = new Map<string, { expected: Prisma.Decimal; delivered: Prisma.Decimal }>();

    for (const c of collections) {
      const agreement = c.inspection?.agreement;
      if (!agreement) continue;
      const row = byAgreement.get(agreement.id) ?? {
        expected: agreement.expectedQuantity,
        delivered: new Prisma.Decimal(0),
      };
      row.delivered = row.delivered.plus(c.netWeight);
      byAgreement.set(agreement.id, row);
    }

    if (byAgreement.size === 0) {
      return {
        score: null,
        sampleSize: 0,
        explanation:
          collections.length === 0
            ? 'No collections yet.'
            : `${collections.length} collection${collections.length === 1 ? '' : 's'}, none against an agreement to measure them against.`,
      };
    }

    let fulfilled = 0;
    const total = [...byAgreement.values()].reduce((sum, row) => {
      if (row.expected.lessThanOrEqualTo(0)) return sum + 100;
      const ratio = row.delivered.dividedBy(row.expected).toNumber() * 100;
      if (ratio >= 95) fulfilled += 1;
      return sum + this.clamp(ratio);
    }, 0);

    return {
      score: this.clamp(total / byAgreement.size),
      sampleSize: byAgreement.size,
      explanation: `${fulfilled} of ${byAgreement.size} agreements delivered in full.`,
    };
  }

  /** FRD 7.6 lists it, FRD 32 does not exist yet. Said plainly rather than faked. */
  private scoreComplaints(): PerformanceComponent {
    return {
      score: null,
      sampleSize: 0,
      explanation:
        'Not captured — complaint management (FRD 32) is not built. This component is ' +
        'excluded from the rating rather than scored as clean.',
    };
  }

  /**
   * Weighted mean over the components that have a score.
   *
   * Renormalising over the available weights is the whole point: a farmer with
   * inspections but no dated agreement is judged on quality alone, at full
   * marks for quality — not on quality scaled down by two components that
   * never had an input.
   */
  private combine(scores: Record<keyof typeof WEIGHTS, number | null>): number | null {
    let weighted = 0;
    let available = 0;

    for (const key of Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>) {
      const score = scores[key];
      const weight = WEIGHTS[key];
      if (score === null || weight === 0) continue;
      weighted += score * weight;
      available += weight;
    }

    if (available === 0) return null;
    return this.clamp(weighted / available);
  }

  /** 100 at or below target, decaying to 0 at twice the target. */
  private decayAboveTarget(value: number, target: number): number {
    if (value <= target) return 100;
    return this.clamp(100 - ((value - target) / target) * 100);
  }

  private clamp(value: number): number {
    return Math.round(Math.min(100, Math.max(0, value)) * 100) / 100;
  }

  private startOfDay(date: Date): Date {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }
}
