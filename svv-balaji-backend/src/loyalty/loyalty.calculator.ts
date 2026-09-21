/**
 * The loyalty engine's arithmetic, with no database and no framework.
 *
 * Everything the customer app previews, the admin screens explain and the
 * delivery hook credits goes through `computeEarn`, so "how many points is this
 * order worth" has exactly one answer.
 *
 * Money is handled in integer paise and point values in ten-thousandths of a
 * rupee, so 5% of Rs 1,000 is exactly 5000 paise and never 49.99999999.
 *
 * WHAT THE PERCENTAGE IS APPLIED TO (the "calculation base"):
 *   - the line value after the price rule is applied - EXCLUDING_TAX (default)
 *     or INCLUDING_TAX;
 *   - only lines that are ELIGIBLE (see resolveEligibility);
 *   - never delivery/shipping charges (they are not order lines at all) and
 *     never anything outside a line.
 *
 * WHAT ONE POINT IS WORTH: `pointValueInr` rupees. reward Rs = base x percent;
 * points = floor(reward Rs / pointValueInr). With pointValueInr = 1, Rs 50 of
 * reward is 50 points; with 0.25 it is 200 points.
 */

export type EligibilitySetting = 'INHERIT' | 'ELIGIBLE' | 'NOT_ELIGIBLE';
export type CalculationBase = 'EXCLUDING_TAX' | 'INCLUDING_TAX';
export type EligibilitySource = 'PRODUCT' | 'CATEGORY' | 'PARENT_CATEGORY' | 'DEFAULT';
export type IneligibleReason = 'PRODUCT_NOT_ELIGIBLE' | 'DISCOUNTED' | 'BELOW_MIN_ITEM';
export type SkipReason = 'PROGRAM_OFF' | 'NO_RATE' | 'NO_ELIGIBLE_ITEMS' | 'BELOW_MIN_ORDER';

/** The rules for ONE channel - the caller has already picked the B2C or B2B percent. */
export interface LoyaltyRules {
  isActive: boolean;
  earnPercent: number;
  pointValueInr: number;
  calculationBase: CalculationBase;
  defaultEligible: boolean;
  appliesToDiscountedProducts: boolean;
  minEligibleItemAmount: number | null;
  minEligibleOrderAmount: number | null;
  maxRewardPerOrderInr: number | null;
}

export interface CalcLine {
  key: string;
  quantity: number;
  /** Price per pack, before GST. */
  unitPrice: number;
  gstRatePercent: number;
  lineSubtotal: number;
  lineTotal: number;
  /** Product MRP (GST-inclusive), used only to decide whether a line is "discounted". */
  mrp: number | null;
  productEligibility: EligibilitySetting;
  categoryEligibility: EligibilitySetting | null;
  parentCategoryEligibility: EligibilitySetting | null;
}

export interface CalcLineResult {
  key: string;
  baseAmount: number;
  eligible: boolean;
  ineligibleReason: IneligibleReason | null;
  eligibilitySource: EligibilitySource;
  points: number;
}

export interface EarnResult {
  lines: CalcLineResult[];
  eligibleAmount: number;
  points: number;
  rewardInr: number;
  cappedByMax: boolean;
  skipReason: SkipReason | null;
}

const toPaise = (rupees: number) => Math.round(rupees * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Product override -> its category -> that category's parent -> program default.
 * The first level that says anything other than INHERIT wins.
 */
export function resolveEligibility(
  product: EligibilitySetting,
  category: EligibilitySetting | null,
  parentCategory: EligibilitySetting | null,
  defaultEligible: boolean,
): { eligible: boolean; source: EligibilitySource } {
  const levels: Array<[EligibilitySetting | null, EligibilitySource]> = [
    [product, 'PRODUCT'],
    [category, 'CATEGORY'],
    [parentCategory, 'PARENT_CATEGORY'],
  ];
  for (const [setting, source] of levels) {
    if (setting === 'ELIGIBLE') return { eligible: true, source };
    if (setting === 'NOT_ELIGIBLE') return { eligible: false, source };
  }
  return { eligible: defaultEligible, source: 'DEFAULT' };
}

/** Selling price incl. GST below MRP = the line was sold at a discount. */
export function isDiscounted(line: Pick<CalcLine, 'unitPrice' | 'gstRatePercent' | 'mrp'>): boolean {
  if (line.mrp === null || line.mrp <= 0) return false;
  return round2(line.unitPrice * (1 + line.gstRatePercent / 100)) < line.mrp;
}

export function computeEarn(rules: LoyaltyRules, lines: CalcLine[]): EarnResult {
  const percentBp = Math.round(rules.earnPercent * 100); // basis points: 5% = 500
  const pointValueMilli = Math.round(rules.pointValueInr * 10000); // Rs 1 = 10000
  const minItemPaise = rules.minEligibleItemAmount === null ? 0 : toPaise(rules.minEligibleItemAmount);

  const evaluated = lines.map((line) => {
    const base = rules.calculationBase === 'INCLUDING_TAX' ? line.lineTotal : line.lineSubtotal;
    const basePaise = toPaise(base);
    const resolved = resolveEligibility(
      line.productEligibility,
      line.categoryEligibility,
      line.parentCategoryEligibility,
      rules.defaultEligible,
    );

    let ineligibleReason: IneligibleReason | null = null;
    if (!resolved.eligible) ineligibleReason = 'PRODUCT_NOT_ELIGIBLE';
    else if (!rules.appliesToDiscountedProducts && isDiscounted(line)) ineligibleReason = 'DISCOUNTED';
    else if (basePaise < minItemPaise) ineligibleReason = 'BELOW_MIN_ITEM';

    return { line, basePaise, resolved, ineligibleReason };
  });

  const eligibleAmountPaise = evaluated
    .filter((e) => e.ineligibleReason === null)
    .reduce((sum, e) => sum + e.basePaise, 0);

  let skipReason: SkipReason | null = null;
  if (!rules.isActive) skipReason = 'PROGRAM_OFF';
  else if (percentBp <= 0 || pointValueMilli <= 0) skipReason = 'NO_RATE';
  else if (eligibleAmountPaise === 0) skipReason = 'NO_ELIGIBLE_ITEMS';
  else if (
    rules.minEligibleOrderAmount !== null &&
    eligibleAmountPaise < toPaise(rules.minEligibleOrderAmount)
  ) {
    skipReason = 'BELOW_MIN_ORDER';
  }

  // Per line: reward paise = base x percent, points = reward / point value, floored.
  let pointsByLine = evaluated.map((e) => {
    if (skipReason !== null || e.ineligibleReason !== null) return 0;
    const rewardPaise = Math.floor((e.basePaise * percentBp) / 10000);
    return Math.floor((rewardPaise * 100) / pointValueMilli);
  });

  let total = pointsByLine.reduce((a, b) => a + b, 0);
  let cappedByMax = false;
  if (rules.maxRewardPerOrderInr !== null && pointValueMilli > 0) {
    const maxPoints = Math.floor((toPaise(rules.maxRewardPerOrderInr) * 100) / pointValueMilli);
    if (total > maxPoints) {
      cappedByMax = true;
      // Scale every line down in proportion so the per-line audit still adds up.
      pointsByLine = pointsByLine.map((p) => Math.floor((p * maxPoints) / total));
      total = pointsByLine.reduce((a, b) => a + b, 0);
    }
  }

  return {
    lines: evaluated.map((e, i) => ({
      key: e.line.key,
      baseAmount: e.basePaise / 100,
      eligible: e.ineligibleReason === null,
      ineligibleReason: e.ineligibleReason,
      eligibilitySource: e.resolved.source,
      points: pointsByLine[i],
    })),
    eligibleAmount: eligibleAmountPaise / 100,
    points: total,
    rewardInr: round2((total * pointValueMilli) / 10000),
    cappedByMax,
    skipReason,
  };
}

/**
 * How many of a line's points a (cumulative) return takes back, beyond what
 * earlier returns already took. Proportional to the quantity returned, and a
 * full return always reverses exactly what is left - so partial returns never
 * strand a rounding point.
 */
export function reversalDelta(
  linePoints: number,
  lineQuantity: number,
  cumulativeReturnedQuantity: number,
  alreadyReversed: number,
): number {
  if (lineQuantity <= 0 || linePoints <= 0) return 0;
  const target =
    cumulativeReturnedQuantity >= lineQuantity
      ? linePoints
      : Math.floor((linePoints * cumulativeReturnedQuantity) / lineQuantity);
  return Math.max(0, target - alreadyReversed);
}
