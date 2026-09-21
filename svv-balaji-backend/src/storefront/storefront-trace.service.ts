import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const NOT_FOUND = 'We could not find that batch. Check the code printed on the pack.';
const round2 = (n: number) => Math.round(n * 100) / 100;

function average(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  return present.length ? round2(present.reduce((a, b) => a + b, 0) / present.length) : null;
}

/**
 * The consumer-facing projection of a pack's history (audit finding M1).
 *
 * A separate query with an explicit `select`, not a trimmed copy of
 * `PackagingService.traceFinishedGoods`: that one carries farmer names, GPS,
 * phone-adjacent fields and supplier detail, and a "hide these" filter over it
 * leaks the day someone adds a column. Here a field reaches the shopper only if
 * it is named below. Origin is deliberately region-level (village / district /
 * state) - farmers are data subjects, not public figures.
 */
@Injectable()
export class StorefrontTraceService {
  constructor(private readonly prisma: PrismaService) {}

  async trace(fgBatchNumber: string) {
    const batch = await this.prisma.finishedGoodsBatch.findUnique({
      where: { fgBatchNumber: fgBatchNumber.trim().toUpperCase() },
      select: {
        fgBatchNumber: true,
        netWeight: true,
        weightUnit: true,
        packagingType: true,
        manufacturingDate: true,
        packagingDate: true,
        expiryDate: true,
        qaReleased: true,
        holdStatus: true,
        product: { select: { name: true, category: true } },
        qualityInspections: {
          orderBy: { createdAt: 'asc' },
          select: { stage: true, result: true, createdAt: true, shelfLifeVerified: true },
        },
        productionBatch: {
          select: {
            productionDate: true,
            branch: { select: { name: true } },
            qualityInspections: {
              where: { stage: 'IN_PROCESS', result: 'PASS' },
              select: { id: true },
            },
            consumptions: {
              select: {
                rawMaterialBatch: {
                  select: {
                    cropName: true,
                    farmer: { select: { id: true, village: true, district: true, state: true } },
                    supplier: { select: { id: true, city: true, district: true, state: true } },
                    collection: { select: { collectionDate: true } },
                    qualityInspections: {
                      where: { result: 'PASS' },
                      select: { moisture: true, purity: true, foreignMatter: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!batch) throw new NotFoundException(NOT_FOUND);

    // A recalled pack is the one case where a scan must NOT vouch for it. Say so
    // plainly and return nothing else; the internal reason stays internal.
    if (batch.holdStatus === 'RECALLED') {
      return {
        status: 'RECALLED' as const,
        fgBatchNumber: batch.fgBatchNumber,
        product: { name: batch.product.name, category: batch.product.category },
        notice:
          'This batch has been recalled. Please do not consume it. Keep the pack and contact ' +
          'SVV Balaji customer support for a replacement or refund.',
      };
    }

    // An unreleased batch has not passed QA; a pack from it should not exist in
    // the market, and if one does we must not vouch for it.
    if (!batch.qaReleased) throw new NotFoundException(NOT_FOUND);

    const raw = batch.productionBatch.consumptions.map((c) => c.rawMaterialBatch);
    const inspections = raw.flatMap((r) => r.qualityInspections);
    const num = (d: unknown) => (d === null || d === undefined ? null : Number(d));

    const sources = new Map<string, { village: string; district: string; state: string }>();
    const growers = new Set<string>();
    for (const r of raw) {
      const who = r.farmer ?? r.supplier;
      if (who) growers.add(who.id);
      const village = r.farmer?.village ?? r.supplier?.city ?? '';
      const district = who?.district ?? '';
      const state = who?.state ?? '';
      if (district || state) sources.set(`${village}|${district}|${state}`, { village, district, state });
    }

    const harvestDates = raw
      .map((r) => r.collection?.collectionDate)
      .filter((d): d is Date => !!d)
      .sort((a, b) => a.getTime() - b.getTime());

    // Each stage is inspected against a DIFFERENT record: raw lots, the production
    // run, then the finished batch. Reading all three off the finished batch
    // (as this first did) reported the first two as never having happened.
    const finishedPassed = batch.qualityInspections.some(
      (q) => q.stage === 'FINISHED_GOODS' && q.result === 'PASS',
    );

    return {
      status: batch.holdStatus === 'ON_HOLD' ? ('ON_HOLD' as const) : ('VERIFIED' as const),
      fgBatchNumber: batch.fgBatchNumber,
      product: { name: batch.product.name, category: batch.product.category },
      pack: {
        netWeight: `${batch.netWeight} ${batch.weightUnit}`,
        packagingType: batch.packagingType,
        manufacturingDate: batch.manufacturingDate,
        packagingDate: batch.packagingDate,
        expiryDate: batch.expiryDate,
      },
      origin: {
        crops: [...new Set(raw.map((r) => r.cropName))],
        regions: [...sources.values()],
        /** A count, not names - the "sourcing cluster" badge. */
        growerCount: growers.size,
        firstHarvest: harvestDates[0] ?? null,
        lastHarvest: harvestDates[harvestDates.length - 1] ?? null,
      },
      // Averaged across the raw lots that went into this pack; null = never measured.
      quality: {
        moisturePercent: average(inspections.map((i) => num(i.moisture))),
        purityPercent: average(inspections.map((i) => num(i.purity))),
        foreignMatterPercent: average(inspections.map((i) => num(i.foreignMatter))),
        // Every raw lot that went in needs its own PASS, not just one of them.
        rawMaterialPassed: raw.length > 0 && raw.every((r) => r.qualityInspections.length > 0),
        inProcessPassed: batch.productionBatch.qualityInspections.length > 0,
        finishedGoodsPassed: finishedPassed,
        shelfLifeVerified: batch.qualityInspections.some((q) => q.shelfLifeVerified === true),
        qaReleased: true,
      },
      processing: {
        facility: batch.productionBatch.branch?.name ?? null,
        milledOn: batch.productionBatch.productionDate,
        packedOn: batch.packagingDate,
      },
    };
  }
}
