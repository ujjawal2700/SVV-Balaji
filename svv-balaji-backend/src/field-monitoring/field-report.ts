/**
 * FRD 12.7 - "A detailed field report is automatically generated after every
 * inspection, helping procurement and production teams prepare for upcoming
 * harvests."
 *
 * The report is derived, not stored. Every figure on it comes from records that
 * already exist - the visit, the farmer, their land, their agreement for this
 * crop and the visit before this one - so it can never disagree with them, and
 * correcting a visit corrects its report. It is generated on every read, which
 * is what "automatically" means here: nobody has to write it up.
 *
 * Kept as a pure function so the judgement calls below (what counts as a risk,
 * when a harvest is "approaching") are unit-tested without a database.
 */

export type ReportSeverity = 'HIGH' | 'MEDIUM' | 'INFO';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type HarvestStage = 'NOT_READY' | 'APPROACHING' | 'READY' | 'OVERDUE' | 'UNKNOWN';

type Num = number | string | { toString(): string } | null | undefined;

export interface FieldReportInput {
  now: Date;
  visit: {
    id: string;
    visitDate: Date;
    cropName: string | null;
    cropGrowthStage: string | null;
    cropHealth: string | null;
    pestStatus: string | null;
    diseaseObservation: string | null;
    fertilizerAdvice: string | null;
    irrigationAdvice: string | null;
    pestControlSuggestions: string | null;
    harvestPreparation: string | null;
    yieldPredictionQty: Num;
    createdAt: Date;
    expert: { id: string; fullName: string } | null;
    branch: { id: string; name: string } | null;
    documents: Array<{ id: string; fileUrl: string; fileType: string; createdAt: Date }>;
  };
  farmer: {
    id: string;
    fullName: string;
    farmerCode: string | null;
    mobile: string;
    village: string;
    district: string;
    state: string;
    gpsLocation: string | null;
    farmSizeAcres: Num;
    landType: string | null;
    irrigationType: string | null;
    qualityRating: Num;
    status: string;
  };
  plots: Array<{
    id: string;
    name: string;
    surveyNumber: string | null;
    areaAcres: Num;
    currentCrop: string | null;
    expectedHarvest: Date | null;
    gpsLocation: string | null;
  }>;
  agreements: Array<{
    id: string;
    cropName: string;
    variety: string | null;
    expectedQuantity: Num;
    purchaseRate: Num;
    harvestDate: Date | null;
    status: string;
  }>;
  previousVisit: {
    id: string;
    visitDate: Date;
    cropHealth: string | null;
    cropGrowthStage: string | null;
    pestStatus: string | null;
    yieldPredictionQty: Num;
  } | null;
  plan: { id: string; plannedDate: Date; purpose: string | null } | null;
  visitCount: number;
  hasHarvestInspection: boolean;
}

export interface ReportFlag {
  severity: ReportSeverity;
  message: string;
}

const toNum = (value: Num): number | null => {
  if (value === null || value === undefined) return null;
  const n = Number(value.toString());
  return Number.isFinite(n) ? n : null;
};

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

/**
 * Calendar days are India's. The apps store a picked date as local midnight,
 * which is the previous day in UTC - counting in UTC put "harvest due 20 Sep"
 * in the summary beside "21 Sep" on the same page. IST has no DST, so a fixed
 * offset is exact.
 */
const IST_OFFSET_MS = 330 * 60_000;
const istKey = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
const day = (d: Date) =>
  new Date(d.getTime() + IST_OFFSET_MS).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const daysBetween = (from: Date, to: Date) =>
  Math.round((Date.parse(istKey(to)) - Date.parse(istKey(from))) / 86_400_000);

const has = (text: string | null | undefined, ...words: string[]) =>
  Boolean(text) && words.some((w) => text!.toLowerCase().includes(w));

/** A harvest this close is "approaching": procurement should book the inspection now. */
export const HARVEST_APPROACHING_DAYS = 14;

/** Predicted yield under this share of the contract is worth telling procurement about. */
export const YIELD_SHORTFALL_RATIO = 0.8;

/** Over this share of contract is a surplus - or, as often, a typo in the forecast. */
export const YIELD_SURPLUS_RATIO = 1.5;

export function buildFieldReport(input: FieldReportInput) {
  const { visit, farmer, now } = input;
  const crop = visit.cropName?.trim() || null;

  // --- The agreement this crop is being grown under --------------------------
  // Same crop, not cancelled/completed, latest harvest first. Crop names are
  // free text on both sides, so match case-insensitively.
  const liveAgreements = input.agreements.filter(
    (a) => a.status !== 'CANCELLED' && a.status !== 'COMPLETED',
  );
  const agreement =
    (crop
      ? liveAgreements.find((a) => a.cropName.trim().toLowerCase() === crop.toLowerCase())
      : undefined) ?? (liveAgreements.length === 1 ? liveAgreements[0] : undefined) ?? null;

  // --- Harvest outlook ------------------------------------------------------
  const predicted = toNum(visit.yieldPredictionQty);
  const contracted = agreement ? toNum(agreement.expectedQuantity) : null;
  const percentOfContract =
    predicted !== null && contracted ? round((predicted / contracted) * 100, 1) : null;

  const matchingPlot = crop
    ? input.plots.find((p) => p.currentCrop && p.currentCrop.toLowerCase() === crop.toLowerCase() && p.expectedHarvest)
    : undefined;
  const harvestDate = agreement?.harvestDate ?? matchingPlot?.expectedHarvest ?? null;
  const daysToHarvest = harvestDate ? daysBetween(now, harvestDate) : null;

  const stageSaysReady = has(visit.cropGrowthStage, 'harvest ready', 'ripening', 'maturation');
  let stage: HarvestStage = 'UNKNOWN';
  if (daysToHarvest !== null && daysToHarvest < 0 && !input.hasHarvestInspection) stage = 'OVERDUE';
  else if (stageSaysReady || (daysToHarvest !== null && daysToHarvest <= 0)) stage = 'READY';
  else if (daysToHarvest !== null && daysToHarvest <= HARVEST_APPROACHING_DAYS) stage = 'APPROACHING';
  else if (daysToHarvest !== null || visit.cropGrowthStage) stage = 'NOT_READY';

  const outlookSummary = (() => {
    const parts: string[] = [];
    if (predicted !== null) parts.push(`Expected yield about ${predicted.toLocaleString('en-IN')} kg${crop ? ` of ${crop}` : ''}`);
    if (percentOfContract !== null) parts.push(`${percentOfContract}% of the ${contracted!.toLocaleString('en-IN')} kg contracted`);
    if (harvestDate) {
      parts.push(
        daysToHarvest! < 0
          ? `harvest was due ${day(harvestDate)} (${Math.abs(daysToHarvest!)} days ago)`
          : daysToHarvest === 0
            ? 'harvest is due today'
            : `harvest due ${day(harvestDate)} (in ${daysToHarvest} days)`,
      );
    }
    return parts.length ? `${parts.join('; ')}.` : 'Not enough information yet to forecast the harvest.';
  })();

  // --- Flags ------------------------------------------------------------------
  const flags: ReportFlag[] = [];
  if (has(visit.pestStatus, 'severe')) flags.push({ severity: 'HIGH', message: `Severe pest infestation reported: ${visit.pestStatus}.` });
  else if (has(visit.pestStatus, 'moderate')) flags.push({ severity: 'MEDIUM', message: `Moderate pest infestation: ${visit.pestStatus}.` });

  if (has(visit.cropHealth, 'disease', 'pest damaged', 'poor', 'bad')) {
    flags.push({ severity: 'HIGH', message: `Crop health is poor: ${visit.cropHealth}.` });
  } else if (has(visit.cropHealth, 'stress', 'deficien', 'average', 'fair', 'moderate')) {
    flags.push({ severity: 'MEDIUM', message: `Crop is under stress: ${visit.cropHealth}.` });
  }
  if (visit.diseaseObservation?.trim()) flags.push({ severity: 'INFO', message: `Remarks: ${visit.diseaseObservation.trim()}` });

  if (percentOfContract !== null && percentOfContract < YIELD_SHORTFALL_RATIO * 100) {
    flags.push({
      severity: percentOfContract < 50 ? 'HIGH' : 'MEDIUM',
      message: `Predicted yield is only ${percentOfContract}% of the contracted quantity - procurement should expect a shortfall.`,
    });
  }
  if (percentOfContract !== null && percentOfContract > YIELD_SURPLUS_RATIO * 100) {
    flags.push({
      severity: 'MEDIUM',
      message: `Predicted yield is ${percentOfContract}% of the contracted quantity - check the figure, and decide whether to buy the surplus.`,
    });
  }
  if (stage === 'OVERDUE') {
    flags.push({ severity: 'HIGH', message: 'Harvest date has passed and no harvest inspection has been raised - procurement cannot collect until it is.' });
  }
  const prevPredicted = toNum(input.previousVisit?.yieldPredictionQty);
  if (predicted !== null && prevPredicted && predicted < prevPredicted * 0.9) {
    flags.push({ severity: 'MEDIUM', message: `Yield forecast dropped from ${prevPredicted.toLocaleString('en-IN')} kg at the last visit to ${predicted.toLocaleString('en-IN')} kg.` });
  }
  if (!farmer.gpsLocation) flags.push({ severity: 'INFO', message: 'Farm has no GPS location recorded.' });
  if (visit.documents.length === 0) flags.push({ severity: 'INFO', message: 'No photos or documents were attached to this visit.' });
  if (!agreement && crop) flags.push({ severity: 'INFO', message: `No active agreement found for ${crop}.` });

  const riskLevel: RiskLevel = flags.some((f) => f.severity === 'HIGH')
    ? 'HIGH'
    : flags.some((f) => f.severity === 'MEDIUM')
      ? 'MEDIUM'
      : 'LOW';

  // --- Next steps for the teams downstream ----------------------------------
  const procurement: string[] = [];
  const production: string[] = [];
  if (stage === 'OVERDUE' || stage === 'READY') procurement.push('Raise the harvest inspection now so the crop can be collected.');
  else if (stage === 'APPROACHING') procurement.push(`Book the harvest inspection before ${day(harvestDate!)}.`);
  if (predicted !== null) {
    procurement.push(`Plan collection capacity for about ${predicted.toLocaleString('en-IN')} kg${crop ? ` of ${crop}` : ''}.`);
    if (stage === 'READY' || stage === 'APPROACHING' || stage === 'OVERDUE') {
      production.push(`Expect about ${predicted.toLocaleString('en-IN')} kg${crop ? ` of raw ${crop}` : ''} into stores${harvestDate ? ` around ${day(harvestDate)}` : ''}.`);
    }
  }
  if (percentOfContract !== null && percentOfContract < YIELD_SHORTFALL_RATIO * 100) {
    procurement.push('Line up alternative supply for the expected shortfall.');
    production.push('Plan production against the reduced raw-material forecast.');
  }
  if (percentOfContract !== null && percentOfContract > YIELD_SURPLUS_RATIO * 100) {
    procurement.push('Confirm the yield forecast and whether the surplus over the agreement will be bought.');
  }
  if (riskLevel === 'HIGH') procurement.push('Schedule a follow-up visit to confirm the crop is recoverable.');

  // --- Trend against the previous visit --------------------------------------
  const previous = input.previousVisit
    ? {
        id: input.previousVisit.id,
        visitDate: input.previousVisit.visitDate,
        daysBefore: daysBetween(input.previousVisit.visitDate, visit.visitDate),
        cropHealth: input.previousVisit.cropHealth,
        cropGrowthStage: input.previousVisit.cropGrowthStage,
        pestStatus: input.previousVisit.pestStatus,
        yieldPredictionQty: prevPredicted,
      }
    : null;

  const registeredAcres = toNum(farmer.farmSizeAcres);
  const mappedAcres = round(input.plots.reduce((sum, p) => sum + (toNum(p.areaAcres) ?? 0), 0));

  return {
    /** Derived from the visit so it is stable across reads: FR-<visit date>-<first 6 of the id>. */
    reportNumber: `FR-${istKey(visit.visitDate).replace(/-/g, '')}-${visit.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`,
    generatedAt: now,
    visit: {
      id: visit.id,
      visitDate: visit.visitDate,
      recordedAt: visit.createdAt,
      expert: visit.expert,
      branch: visit.branch,
      cropName: visit.cropName,
      cropGrowthStage: visit.cropGrowthStage,
      cropHealth: visit.cropHealth,
      pestStatus: visit.pestStatus,
      diseaseObservation: visit.diseaseObservation,
      yieldPredictionQty: predicted,
      documents: visit.documents,
    },
    farmer: {
      id: farmer.id,
      fullName: farmer.fullName,
      farmerCode: farmer.farmerCode,
      mobile: farmer.mobile,
      village: farmer.village,
      district: farmer.district,
      state: farmer.state,
      gpsLocation: farmer.gpsLocation,
      landType: farmer.landType,
      irrigationType: farmer.irrigationType,
      qualityRating: toNum(farmer.qualityRating),
      status: farmer.status,
    },
    land: {
      registeredAcres,
      mappedAcres,
      plotCount: input.plots.length,
      plots: input.plots.map((p) => ({
        id: p.id,
        name: p.name,
        surveyNumber: p.surveyNumber,
        areaAcres: toNum(p.areaAcres),
        currentCrop: p.currentCrop,
        expectedHarvest: p.expectedHarvest,
      })),
    },
    agreement: agreement
      ? {
          id: agreement.id,
          cropName: agreement.cropName,
          variety: agreement.variety,
          expectedQuantity: contracted,
          purchaseRate: toNum(agreement.purchaseRate),
          harvestDate: agreement.harvestDate,
          status: agreement.status,
        }
      : null,
    recommendations: {
      fertilizer: visit.fertilizerAdvice,
      irrigation: visit.irrigationAdvice,
      pestControl: visit.pestControlSuggestions,
      harvestPreparation: visit.harvestPreparation,
    },
    harvestOutlook: {
      predictedYieldKg: predicted,
      contractedKg: contracted,
      percentOfContract,
      expectedHarvestDate: harvestDate,
      daysToHarvest,
      stage,
      hasHarvestInspection: input.hasHarvestInspection,
      summary: outlookSummary,
    },
    riskLevel,
    flags,
    nextSteps: { procurement, production },
    previousVisit: previous,
    plan: input.plan,
    visitNumber: input.visitCount,
  };
}

export type FieldReport = ReturnType<typeof buildFieldReport>;
