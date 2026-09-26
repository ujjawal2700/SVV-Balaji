/**
 * Rider pay rules. Pure functions, unit-tested in earning.logic.spec.ts.
 *
 * Every amount comes from a Super Admin rule; with no rule a component pays 0.
 * A failed or cancelled task never earns the delivery amounts - only what an
 * OUTCOME_COMPENSATION rule for that outcome says.
 *
 * How rules combine:
 *   - BASE_PER_DELIVERY, DISTANCE_SLAB, OUTCOME_COMPENSATION: a rule for the
 *     task's zone replaces the all-zones rule of the same kind (per outcome for
 *     compensation), so a zone can have its own rate card.
 *   - PEAK_HOUR, ZONE_INCENTIVE, WAITING_TIME: every applicable rule adds up.
 *   - DAILY_TARGET / WEEKLY_TARGET: one-off bonuses per target reached.
 */

export type RuleKind =
  | 'BASE_PER_DELIVERY'
  | 'DISTANCE_SLAB'
  | 'PEAK_HOUR'
  | 'ZONE_INCENTIVE'
  | 'DAILY_TARGET'
  | 'WEEKLY_TARGET'
  | 'WAITING_TIME'
  | 'OUTCOME_COMPENSATION';

export type EarningType = 'BASE' | 'DISTANCE' | 'PEAK' | 'ZONE_INCENTIVE' | 'DAILY_BONUS' | 'WEEKLY_BONUS' | 'WAITING' | 'OUTCOME';

export const OUTCOMES = [
  'CANCELLED_AFTER_ASSIGNMENT',
  'CANCELLED_AT_PICKUP',
  'CANCELLED_AFTER_PICKUP',
  'FAILED_CUSTOMER_UNAVAILABLE',
  'FAILED_CUSTOMER_REFUSED',
  'FAILED_ADDRESS_ISSUE',
  'FAILED_RIDER_ISSUE',
  'FAILED_OTHER',
] as const;
export type Outcome = (typeof OUTCOMES)[number];

export interface TimeWindow {
  /** 0 = Sunday ... 6 = Saturday. Empty = every day. */
  days: number[];
  start: string; // HH:mm
  end: string; // HH:mm, may be < start (overnight)
}

export interface Rule {
  id: string;
  name: string;
  kind: RuleKind;
  zoneId: string | null;
  validFrom: Date | null;
  validTo: Date | null;
  config: Record<string, unknown>;
}

export interface TaskContext {
  taskId: string;
  riderId: string;
  zoneId: string | null;
  /** 'DELIVERED' or the failure/cancellation outcome. */
  result: 'DELIVERED' | Outcome;
  distanceKm: number | null;
  /** When the task ended (delivered / failed / cancelled). */
  at: Date;
  timeZone: string;
  /** Verified waiting, in minutes; null when not verified or not applicable. */
  waitPickupMinutes: number | null;
  waitDropMinutes: number | null;
}

export interface EarningLine {
  type: EarningType;
  amount: number;
  ruleId: string;
  dedupeKey: string;
  detail: Record<string, unknown>;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

// ------------------------------------------------------------------ config validation

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function validWindows(v: unknown): v is TimeWindow[] {
  return (
    Array.isArray(v) &&
    v.every(
      (w) =>
        w && typeof w === 'object' &&
        Array.isArray((w as TimeWindow).days) && (w as TimeWindow).days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) &&
        HHMM.test(String((w as TimeWindow).start)) && HHMM.test(String((w as TimeWindow).end)) &&
        (w as TimeWindow).start !== (w as TimeWindow).end,
    )
  );
}

const positive = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Returns an error message, or null when the config is valid for its kind. */
export function validateConfig(kind: RuleKind, c: Record<string, unknown>, zoneId: string | null): string | null {
  switch (kind) {
    case 'BASE_PER_DELIVERY':
      return positive(c.amount) ? null : 'amount must be a number >= 0';
    case 'DISTANCE_SLAB': {
      const slabs = c.slabs as Array<{ uptoKm: number | null; amount: number }> | undefined;
      if (!Array.isArray(slabs) || slabs.length === 0) return 'slabs: at least one { uptoKm, amount }';
      let last = 0;
      for (const [i, s] of slabs.entries()) {
        if (!positive(s?.amount)) return `slab ${i + 1}: amount must be >= 0`;
        const open = s.uptoKm === null;
        if (open && i !== slabs.length - 1) return 'only the last slab may be open-ended (uptoKm: null)';
        if (!open && !(typeof s.uptoKm === 'number' && s.uptoKm > last)) return `slab ${i + 1}: uptoKm must be greater than the previous slab`;
        if (!open) last = s.uptoKm as number;
      }
      if (c.unknownDistanceAmount !== undefined && !positive(c.unknownDistanceAmount)) return 'unknownDistanceAmount must be >= 0';
      return null;
    }
    case 'PEAK_HOUR':
      if (!positive(c.amount)) return 'amount must be >= 0';
      return validWindows(c.windows) && (c.windows as TimeWindow[]).length > 0 ? null : 'windows: at least one { days, start, end }';
    case 'ZONE_INCENTIVE':
      if (!zoneId) return 'a zone incentive needs a zone';
      if (!positive(c.amount)) return 'amount must be >= 0';
      return c.windows === undefined || validWindows(c.windows) ? null : 'windows must be { days, start, end }[]';
    case 'DAILY_TARGET':
    case 'WEEKLY_TARGET': {
      const t = c.targets as Array<{ deliveries: number; bonus: number }> | undefined;
      if (!Array.isArray(t) || t.length === 0) return 'targets: at least one { deliveries, bonus }';
      const counts = new Set<number>();
      for (const x of t) {
        if (!Number.isInteger(x?.deliveries) || x.deliveries < 1) return 'each target needs deliveries >= 1';
        if (!positive(x.bonus)) return 'each target needs bonus >= 0';
        if (counts.has(x.deliveries)) return 'two targets with the same delivery count';
        counts.add(x.deliveries);
      }
      return null;
    }
    case 'WAITING_TIME':
      if (!['PICKUP', 'DROP', 'BOTH'].includes(String(c.at))) return 'at must be PICKUP, DROP or BOTH';
      if (!positive(c.freeMinutes) || !positive(c.perMinute)) return 'freeMinutes and perMinute must be >= 0';
      return c.maxAmount === undefined || c.maxAmount === null || positive(c.maxAmount) ? null : 'maxAmount must be >= 0';
    case 'OUTCOME_COMPENSATION':
      if (!OUTCOMES.includes(c.outcome as Outcome)) return `outcome must be one of ${OUTCOMES.join(', ')}`;
      if (!['FIXED', 'PERCENT_OF_DELIVERY'].includes(String(c.mode))) return 'mode must be FIXED or PERCENT_OF_DELIVERY';
      if (!positive(c.value)) return 'value must be >= 0';
      if (c.mode === 'PERCENT_OF_DELIVERY' && (c.value as number) > 100) return 'a percentage cannot exceed 100';
      return null;
    default:
      return 'unknown rule kind';
  }
}

// ------------------------------------------------------------------ helpers

export function localParts(at: Date, timeZone: string) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
    .formatToParts(at)
    .reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { date: `${p.year}-${p.month}-${p.day}`, day, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

const mins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export function inWindows(windows: TimeWindow[], at: Date, timeZone: string): boolean {
  const { day, minutes } = localParts(at, timeZone);
  const yesterday = (day + 6) % 7;
  return windows.some((w) => {
    const days = w.days.length ? w.days : [0, 1, 2, 3, 4, 5, 6];
    const s = mins(w.start);
    const e = mins(w.end);
    if (s < e) return days.includes(day) && minutes >= s && minutes < e;
    return (days.includes(day) && minutes >= s) || (days.includes(yesterday) && minutes < e);
  });
}

/** Monday-based week key, e.g. "2026-09-21" for the week containing Sat 26 Sep. */
export function weekKey(at: Date, timeZone: string): string {
  const { date, day } = localParts(at, timeZone);
  const back = (day + 6) % 7; // days since Monday
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

function applicable(rules: Rule[], zoneId: string | null, at: Date): Rule[] {
  return rules.filter(
    (r) =>
      (r.zoneId === null || r.zoneId === zoneId) &&
      (!r.validFrom || r.validFrom <= at) &&
      (!r.validTo || r.validTo >= at),
  );
}

/** Zone-specific rules of a kind replace the all-zones ones. */
function mostSpecific(rules: Rule[]): Rule[] {
  const zoned = rules.filter((r) => r.zoneId !== null);
  return zoned.length ? zoned : rules;
}

export function slabAmount(config: Record<string, unknown>, distanceKm: number | null): { amount: number; slab: string } {
  const slabs = config.slabs as Array<{ uptoKm: number | null; amount: number }>;
  if (distanceKm === null) {
    const amount = num(config.unknownDistanceAmount, slabs[0].amount);
    return { amount, slab: 'distance unknown' };
  }
  let from = 0;
  for (const s of slabs) {
    if (s.uptoKm === null || distanceKm <= s.uptoKm) return { amount: s.amount, slab: s.uptoKm === null ? `${from}+ km` : `${from}-${s.uptoKm} km` };
    from = s.uptoKm;
  }
  // Beyond the last closed slab: the last slab's amount.
  const last = slabs[slabs.length - 1];
  return { amount: last.amount, slab: `${from}+ km` };
}

function deliveryParts(rules: Rule[], ctx: TaskContext): EarningLine[] {
  const out: EarningLine[] = [];
  for (const r of mostSpecific(rules.filter((x) => x.kind === 'BASE_PER_DELIVERY'))) {
    out.push({ type: 'BASE', amount: r2(num(r.config.amount)), ruleId: r.id, dedupeKey: `task:${ctx.taskId}:${r.id}`, detail: { rule: r.name } });
  }
  for (const r of mostSpecific(rules.filter((x) => x.kind === 'DISTANCE_SLAB'))) {
    const { amount, slab } = slabAmount(r.config, ctx.distanceKm);
    out.push({ type: 'DISTANCE', amount: r2(amount), ruleId: r.id, dedupeKey: `task:${ctx.taskId}:${r.id}`, detail: { rule: r.name, slab, distanceKm: ctx.distanceKm } });
  }
  return out;
}

function waiting(rules: Rule[], ctx: TaskContext): EarningLine[] {
  const out: EarningLine[] = [];
  for (const r of rules.filter((x) => x.kind === 'WAITING_TIME')) {
    const at = String(r.config.at);
    const waited = (at !== 'DROP' ? ctx.waitPickupMinutes ?? 0 : 0) + (at !== 'PICKUP' ? ctx.waitDropMinutes ?? 0 : 0);
    const billable = Math.max(waited - num(r.config.freeMinutes), 0);
    if (billable <= 0) continue;
    let amount = billable * num(r.config.perMinute);
    const cap = r.config.maxAmount;
    if (typeof cap === 'number') amount = Math.min(amount, cap);
    if (amount > 0) {
      out.push({ type: 'WAITING', amount: r2(amount), ruleId: r.id, dedupeKey: `task:${ctx.taskId}:${r.id}`, detail: { rule: r.name, waitedMinutes: Math.round(waited), billableMinutes: Math.round(billable) } });
    }
  }
  return out;
}

/** Everything a single task earns its rider when it ends. */
export function taskEarnings(allRules: Rule[], ctx: TaskContext): EarningLine[] {
  const rules = applicable(allRules, ctx.zoneId, ctx.at);
  const lines: EarningLine[] = [];

  if (ctx.result === 'DELIVERED') {
    lines.push(...deliveryParts(rules, ctx));
    for (const r of rules.filter((x) => x.kind === 'PEAK_HOUR')) {
      if (inWindows(r.config.windows as TimeWindow[], ctx.at, ctx.timeZone)) {
        lines.push({ type: 'PEAK', amount: r2(num(r.config.amount)), ruleId: r.id, dedupeKey: `task:${ctx.taskId}:${r.id}`, detail: { rule: r.name } });
      }
    }
    for (const r of rules.filter((x) => x.kind === 'ZONE_INCENTIVE' && x.zoneId === ctx.zoneId)) {
      const w = r.config.windows as TimeWindow[] | undefined;
      if (!w || w.length === 0 || inWindows(w, ctx.at, ctx.timeZone)) {
        lines.push({ type: 'ZONE_INCENTIVE', amount: r2(num(r.config.amount)), ruleId: r.id, dedupeKey: `task:${ctx.taskId}:${r.id}`, detail: { rule: r.name } });
      }
    }
    lines.push(...waiting(rules, ctx));
  } else {
    const comp = mostSpecific(rules.filter((x) => x.kind === 'OUTCOME_COMPENSATION' && x.config.outcome === ctx.result));
    for (const r of comp) {
      const deliveryValue = deliveryParts(rules, ctx).reduce((s, l) => s + l.amount, 0);
      const amount = r.config.mode === 'FIXED' ? num(r.config.value) : (deliveryValue * num(r.config.value)) / 100;
      if (amount > 0) {
        lines.push({
          type: 'OUTCOME', amount: r2(amount), ruleId: r.id, dedupeKey: `task:${ctx.taskId}:${r.id}`,
          detail: { rule: r.name, outcome: ctx.result, mode: r.config.mode, value: r.config.value, ...(r.config.mode === 'FIXED' ? {} : { deliveryValue: r2(deliveryValue) }) },
        });
      }
    }
    // Waiting that was genuinely verified (e.g. at a door nobody opened) is still paid.
    if (ctx.result.startsWith('FAILED_')) lines.push(...waiting(rules, ctx));
  }
  return lines.filter((l) => l.amount > 0);
}

/**
 * One-off count bonuses. `counts` are the rider's delivered tasks today and
 * this week (including the one just delivered).
 */
export function targetBonuses(
  allRules: Rule[],
  ctx: { riderId: string; zoneId: string | null; at: Date; timeZone: string; dayCount: number; weekCount: number },
): EarningLine[] {
  const rules = applicable(allRules, ctx.zoneId, ctx.at);
  const out: EarningLine[] = [];
  const day = localParts(ctx.at, ctx.timeZone).date;
  const week = weekKey(ctx.at, ctx.timeZone);
  for (const r of rules.filter((x) => x.kind === 'DAILY_TARGET' || x.kind === 'WEEKLY_TARGET')) {
    const daily = r.kind === 'DAILY_TARGET';
    const count = daily ? ctx.dayCount : ctx.weekCount;
    const period = daily ? day : week;
    for (const t of r.config.targets as Array<{ deliveries: number; bonus: number }>) {
      if (count >= t.deliveries && t.bonus > 0) {
        out.push({
          type: daily ? 'DAILY_BONUS' : 'WEEKLY_BONUS',
          amount: r2(t.bonus),
          ruleId: r.id,
          dedupeKey: `bonus:${ctx.riderId}:${r.id}:${period}:${t.deliveries}`,
          detail: { rule: r.name, period, target: t.deliveries },
        });
      }
    }
  }
  return out;
}
