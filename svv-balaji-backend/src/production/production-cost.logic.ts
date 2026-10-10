/**
 * Production cost and machine utilisation. Pure functions, unit-tested in
 * production-cost.logic.spec.ts.
 *
 * Client decision 10 Oct 2026:
 *   - cost of a run = raw material + labour + machine + loss + other lines
 *   - raw material = each consumed batch's quantity x the rate paid for it
 *     (farmer collection or supplier transport), unless staff override it
 *   - machine utilisation = the machine list + its runs
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface OtherCost {
  label: string;
  amount: number;
}

export interface ConsumedLine {
  batchNumber: string;
  quantityUsed: number;
  /** Purchase rate per unit, or null when the batch has none recorded. */
  rate: number | null;
}

export interface RawCost {
  amount: number;
  lines: Array<ConsumedLine & { cost: number | null }>;
  /** Batches with no purchase rate - their cost is not in `amount`. */
  missingRate: string[];
}

export function rawMaterialCost(lines: ConsumedLine[]): RawCost {
  const out = lines.map((l) => ({ ...l, cost: l.rate === null ? null : r2(l.quantityUsed * l.rate) }));
  return {
    amount: r2(out.reduce((s, l) => s + (l.cost ?? 0), 0)),
    lines: out,
    missingRate: out.filter((l) => l.cost === null).map((l) => l.batchNumber),
  };
}

/** Returns an error message, or null when the other-cost lines are valid. */
export function validateOtherCosts(v: unknown): string | null {
  if (!Array.isArray(v)) return 'otherCosts must be a list of { label, amount }';
  if (v.length > 20) return 'At most 20 other cost lines';
  for (const [i, x] of v.entries()) {
    const label = typeof x?.label === 'string' ? x.label.trim() : '';
    if (!label) return `Other cost ${i + 1}: enter what it is for`;
    if (label.length > 80) return `Other cost ${i + 1}: keep the label under 80 characters`;
    if (typeof x?.amount !== 'number' || !Number.isFinite(x.amount) || x.amount < 0) return `Other cost ${i + 1}: amount must be 0 or more`;
  }
  return null;
}

export function parseOtherCosts(v: unknown): OtherCost[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x) => x && typeof x.label === 'string' && typeof x.amount === 'number')
    .map((x) => ({ label: String(x.label).trim(), amount: r2(Number(x.amount)) }));
}

export interface CostParts {
  raw: number;
  labour: number;
  machine: number;
  loss: number;
  other: OtherCost[];
}

export function costTotals(p: CostParts, outputQuantity: number | null) {
  const otherTotal = r2(p.other.reduce((s, o) => s + o.amount, 0));
  const total = r2(p.raw + p.labour + p.machine + p.loss + otherTotal);
  const perUnit = outputQuantity && outputQuantity > 0 ? Math.round((total / outputQuantity) * 10000) / 10000 : null;
  return { otherTotal, total, perUnit };
}

// ------------------------------------------------------------------ machine utilisation

export interface RunFact {
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  actualQuantity: number | null;
}

export interface Utilisation {
  runs: number;
  completedRuns: number;
  inProgressRuns: number;
  /** Runs started before run times were recorded (or never started) - counted, but no hours. */
  runsWithoutTimes: number;
  runHours: number;
  outputQuantity: number;
  availableHours: number;
  /** runHours / availableHours x 100, or null when no hours are available. */
  utilisationPercent: number | null;
}

/**
 * Hours are the overlap of each run with [start, end): a run that crosses the
 * range boundary only counts the part inside it, and a run still in progress
 * counts up to `now`. Output counts completed runs that finished in range.
 */
export function utilisation(runs: RunFact[], range: { start: Date; end: Date }, hoursPerDay: number, now: Date): Utilisation {
  const days = Math.max(1, Math.round((range.end.getTime() - range.start.getTime()) / 86_400_000));
  let ms = 0;
  let output = 0;
  let completed = 0;
  let inProgress = 0;
  let noTimes = 0;
  for (const r of runs) {
    if (r.status === 'CANCELLED') continue;
    if (r.status === 'COMPLETED') completed++;
    if (r.status === 'IN_PROGRESS') inProgress++;
    if (!r.startedAt) {
      noTimes++;
    } else {
      const stop = r.completedAt ?? (r.status === 'IN_PROGRESS' ? now : null);
      if (!stop) noTimes++;
      else {
        const a = Math.max(r.startedAt.getTime(), range.start.getTime());
        const b = Math.min(stop.getTime(), range.end.getTime());
        if (b > a) ms += b - a;
      }
    }
    if (r.status === 'COMPLETED' && r.actualQuantity !== null) output += r.actualQuantity;
  }
  const runHours = Math.round((ms / 3_600_000) * 100) / 100;
  const availableHours = r2(days * hoursPerDay);
  return {
    runs: runs.filter((r) => r.status !== 'CANCELLED').length,
    completedRuns: completed,
    inProgressRuns: inProgress,
    runsWithoutTimes: noTimes,
    runHours,
    outputQuantity: r2(output),
    availableHours,
    utilisationPercent: availableHours > 0 ? Math.round((runHours / availableHours) * 1000) / 10 : null,
  };
}
