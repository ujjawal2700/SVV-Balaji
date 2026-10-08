/**
 * Pure helpers behind the Sales Analytics and Finance reports. No Prisma here,
 * so each rule can be tested on plain values.
 *
 * Money is summed in paise and handed back in rupees, the same way POS and
 * receivables do it, so a report total always equals the sum of its rows.
 */
import { istDate } from '../pos/pos.logic';

export const paise = (n: number | string | { toString(): string } | null | undefined): number =>
  Math.round(Number(n ?? 0) * 100);
export const rupees = (p: number): number => Math.round(p) / 100;

const DAY_MS = 24 * 3600_000;

// --- Periods ---------------------------------------------------------------------

export type Granularity = 'day' | 'week' | 'month';

/** Day for a month or less, week up to ~4 months, month beyond. Keeps a chart under ~40 bars. */
export function granularityFor(from: string, to: string): Granularity {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;
  if (days <= 31) return 'day';
  if (days <= 124) return 'week';
  return 'month';
}

/**
 * The bucket an instant falls in, as an IST calendar label: "2026-10-08" for a
 * day, the Monday of its week for a week, "2026-10" for a month.
 */
export function periodOf(d: Date, g: Granularity): string {
  const day = istDate(d);
  if (g === 'day') return day;
  if (g === 'month') return day.slice(0, 7);
  const t = Date.parse(`${day}T00:00:00.000Z`);
  const dow = (new Date(t).getUTCDay() + 6) % 7; // Monday = 0
  return new Date(t - dow * DAY_MS).toISOString().slice(0, 10);
}

/** Every bucket label from `from` to `to` inclusive, so empty periods still get a bar. */
export function periodsBetween(from: string, to: string, g: Granularity): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00.000Z`);
  let t = Date.parse(`${from}T00:00:00.000Z`);
  // Start at the bucket containing `from`.
  const first = periodOf(new Date(t - 330 * 60_000), g);
  if (g === 'month') {
    let [y, m] = first.split('-').map(Number);
    const last = to.slice(0, 7);
    for (;;) {
      const label = `${y}-${String(m).padStart(2, '0')}`;
      out.push(label);
      if (label >= last) break;
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    return out;
  }
  t = Date.parse(`${first}T00:00:00.000Z`);
  const step = g === 'day' ? DAY_MS : 7 * DAY_MS;
  for (; t <= end; t += step) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** The range of the same length immediately before [from, to], for "vs previous period". */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const f = Date.parse(`${from}T00:00:00.000Z`);
  const t = Date.parse(`${to}T00:00:00.000Z`);
  const len = t - f + DAY_MS;
  return {
    from: new Date(f - len).toISOString().slice(0, 10),
    to: new Date(f - DAY_MS).toISOString().slice(0, 10),
  };
}

/** Percentage change, or null when there is nothing to compare against. */
export function changePercent(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function ratio(part: number, whole: number): number {
  return whole ? Math.round((part / whole) * 1000) / 10 : 0;
}

// --- Cohorts -------------------------------------------------------------------

export interface CustomerOrderFact {
  customerId: string;
  orderDate: Date;
}

export interface CohortRow {
  /** "YYYY-MM" of the customer's first order. */
  cohort: string;
  customers: number;
  /**
   * `retention[k]` = % of the cohort that ordered again in month k after their
   * first (k = 0 is the first month itself, always 100). Months that have not
   * happened yet by `asOf` are left out, so a young cohort has a shorter row.
   */
  retention: number[];
}

function monthIndex(label: string): number {
  const [y, m] = label.split('-').map(Number);
  return y * 12 + (m - 1);
}

/**
 * Monthly acquisition cohorts. `orders` must be every (non-cancelled) order of
 * the customers in question, not just the report range - otherwise a customer's
 * first order is whatever happened to fall in the range.
 */
export function buildCohorts(orders: CustomerOrderFact[], asOf: Date, maxCohorts = 6, maxMonths = 6): CohortRow[] {
  const monthsByCustomer = new Map<string, Set<number>>();
  for (const o of orders) {
    const m = monthIndex(istDate(o.orderDate).slice(0, 7));
    const set = monthsByCustomer.get(o.customerId) ?? new Set<number>();
    set.add(m);
    monthsByCustomer.set(o.customerId, set);
  }
  const nowMonth = monthIndex(istDate(asOf).slice(0, 7));
  const cohorts = new Map<number, number[][]>(); // first month -> list of month sets (as offsets)
  for (const months of monthsByCustomer.values()) {
    const first = Math.min(...months);
    const offsets = [...months].map((m) => m - first);
    const list = cohorts.get(first) ?? [];
    list.push(offsets);
    cohorts.set(first, list);
  }
  return [...cohorts.keys()]
    .filter((m) => m <= nowMonth)
    .sort((a, b) => b - a)
    .slice(0, maxCohorts)
    .sort((a, b) => a - b)
    .map((first) => {
      const members = cohorts.get(first)!;
      const span = Math.min(maxMonths, nowMonth - first + 1);
      const retention: number[] = [];
      for (let k = 0; k < span; k += 1) {
        const active = members.filter((offs) => offs.includes(k)).length;
        retention.push(ratio(active, members.length));
      }
      const y = Math.floor(first / 12);
      const mo = (first % 12) + 1;
      return { cohort: `${y}-${String(mo).padStart(2, '0')}`, customers: members.length, retention };
    });
}

// --- B2B reorder cycle -------------------------------------------------------------

export type ReorderState = 'ON_TRACK' | 'DUE' | 'OVERDUE' | 'ONE_ORDER';

export interface ReorderRow {
  customerId: string;
  orders: number;
  /** Mean days between consecutive orders; null with a single order. */
  avgGapDays: number | null;
  lastOrderDate: Date;
  daysSinceLast: number;
  /** When the next order would be expected on their own rhythm. */
  expectedNextDate: Date | null;
  state: ReorderState;
}

/**
 * A retailer's reorder rhythm from their own order history. DUE once they pass
 * their usual gap, OVERDUE past 1.5x it - the point where a sales executive
 * should call. Orders on the same day count once.
 */
export function reorderCycle(customerId: string, dates: Date[], asOf: Date): ReorderRow | null {
  if (!dates.length) return null;
  const days = [...new Set(dates.map((d) => istDate(d)))].sort();
  const last = days[days.length - 1];
  const lastDate = new Date(Date.parse(`${last}T00:00:00.000Z`));
  const daysSinceLast = Math.max(0, Math.floor((Date.parse(`${istDate(asOf)}T00:00:00.000Z`) - lastDate.getTime()) / DAY_MS));
  const lastOrderDate = dates.reduce((a, b) => (a > b ? a : b));
  if (days.length < 2) {
    return { customerId, orders: dates.length, avgGapDays: null, lastOrderDate, daysSinceLast, expectedNextDate: null, state: 'ONE_ORDER' };
  }
  const span = (Date.parse(`${last}T00:00:00.000Z`) - Date.parse(`${days[0]}T00:00:00.000Z`)) / DAY_MS;
  const avg = Math.round((span / (days.length - 1)) * 10) / 10;
  const state: ReorderState = daysSinceLast > avg * 1.5 ? 'OVERDUE' : daysSinceLast > avg ? 'DUE' : 'ON_TRACK';
  return {
    customerId,
    orders: dates.length,
    avgGapDays: avg,
    lastOrderDate,
    daysSinceLast,
    expectedNextDate: new Date(lastDate.getTime() + Math.round(avg) * DAY_MS),
    state,
  };
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 10) / 10;
}

// --- CSV ------------------------------------------------------------------------

export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
