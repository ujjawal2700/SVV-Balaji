import { inWindows, slabAmount, targetBonuses, taskEarnings, validateConfig, weekKey, type Rule, type TaskContext } from './earning.logic';

const rule = (over: Partial<Rule> & Pick<Rule, 'kind' | 'config'>): Rule => ({
  id: over.id ?? `${over.kind}-${Math.random().toString(36).slice(2, 7)}`,
  name: over.name ?? over.kind,
  zoneId: null,
  validFrom: null,
  validTo: null,
  ...over,
});

// The slab table from the brief: 0-1 km 20, 1-2 km 25, 2-3 km 30, 3-5 km 35.
const SLABS = rule({
  id: 'slabs',
  kind: 'DISTANCE_SLAB',
  config: { slabs: [{ uptoKm: 1, amount: 20 }, { uptoKm: 2, amount: 25 }, { uptoKm: 3, amount: 30 }, { uptoKm: 5, amount: 35 }] },
});

// Sat 26 Sep 2026, 19:00 IST.
const EVENING = new Date('2026-09-26T13:30:00Z');

const ctx = (over: Partial<TaskContext> = {}): TaskContext => ({
  taskId: 't1', riderId: 'r1', zoneId: 'zA', result: 'DELIVERED', distanceKm: 1.4, at: EVENING, timeZone: 'Asia/Kolkata',
  waitPickupMinutes: null, waitDropMinutes: null, ...over,
});

const total = (lines: { amount: number }[]) => lines.reduce((s, l) => s + l.amount, 0);

describe('rider earning rules', () => {
  describe('validateConfig', () => {
    it('accepts the slab table and rejects gaps, unordered or open-in-the-middle slabs', () => {
      expect(validateConfig('DISTANCE_SLAB', SLABS.config, null)).toBeNull();
      expect(validateConfig('DISTANCE_SLAB', { slabs: [{ uptoKm: 2, amount: 20 }, { uptoKm: 1, amount: 25 }] }, null)).toMatch(/greater/);
      expect(validateConfig('DISTANCE_SLAB', { slabs: [{ uptoKm: null, amount: 20 }, { uptoKm: 3, amount: 25 }] }, null)).toMatch(/last slab/);
    });

    it('requires a zone for a zone incentive and a known outcome for compensation', () => {
      expect(validateConfig('ZONE_INCENTIVE', { amount: 10 }, null)).toMatch(/zone/);
      expect(validateConfig('OUTCOME_COMPENSATION', { outcome: 'NOPE', mode: 'FIXED', value: 5 }, null)).toMatch(/outcome/);
      expect(validateConfig('OUTCOME_COMPENSATION', { outcome: 'CANCELLED_AT_PICKUP', mode: 'PERCENT_OF_DELIVERY', value: 150 }, null)).toMatch(/100/);
    });
  });

  describe('distance slabs', () => {
    it('pays the slab the distance falls in, edges inclusive', () => {
      expect(slabAmount(SLABS.config, 0.4).amount).toBe(20);
      expect(slabAmount(SLABS.config, 1).amount).toBe(20);
      expect(slabAmount(SLABS.config, 1.01).amount).toBe(25);
      expect(slabAmount(SLABS.config, 2.9).amount).toBe(30);
      expect(slabAmount(SLABS.config, 4.5).amount).toBe(35);
    });

    it('beyond the last closed slab pays the last slab; unknown distance pays the configured fallback', () => {
      expect(slabAmount(SLABS.config, 7).amount).toBe(35);
      expect(slabAmount({ ...SLABS.config, unknownDistanceAmount: 22 }, null).amount).toBe(22);
      expect(slabAmount(SLABS.config, null).amount).toBe(20);
    });
  });

  describe('a delivered task', () => {
    it('reproduces the brief example: base 20 + distance incentive 10 + peak 5 = 35', () => {
      const rules = [
        rule({ kind: 'BASE_PER_DELIVERY', config: { amount: 20 } }),
        rule({ kind: 'DISTANCE_SLAB', config: { slabs: [{ uptoKm: 1, amount: 0 }, { uptoKm: null, amount: 10 }] } }),
        rule({ kind: 'PEAK_HOUR', config: { amount: 5, windows: [{ days: [], start: '18:00', end: '21:00' }] } }),
      ];
      const lines = taskEarnings(rules, ctx());
      expect(lines.map((l) => [l.type, l.amount])).toEqual([['BASE', 20], ['DISTANCE', 10], ['PEAK', 5]]);
      expect(total(lines)).toBe(35);
    });

    it('pays no peak incentive outside the window', () => {
      const peak = rule({ kind: 'PEAK_HOUR', config: { amount: 5, windows: [{ days: [], start: '08:00', end: '10:00' }] } });
      expect(taskEarnings([peak], ctx())).toEqual([]);
    });

    it('a zone rate card replaces the all-zones one; other zones keep the global card', () => {
      const zoneSlabs = rule({ ...SLABS, id: 'zoneSlabs', zoneId: 'zA', config: { slabs: [{ uptoKm: null, amount: 50 }] } });
      expect(total(taskEarnings([SLABS, zoneSlabs], ctx()))).toBe(50);
      expect(total(taskEarnings([SLABS, zoneSlabs], ctx({ zoneId: 'zB' })))).toBe(25);
    });

    it('zone incentive only in its zone, and only while it is valid', () => {
      const zi = rule({ kind: 'ZONE_INCENTIVE', zoneId: 'zA', config: { amount: 8 }, validTo: new Date('2026-09-30T00:00:00Z') });
      expect(total(taskEarnings([zi], ctx()))).toBe(8);
      expect(total(taskEarnings([zi], ctx({ zoneId: 'zB' })))).toBe(0);
      expect(total(taskEarnings([zi], ctx({ at: new Date('2026-10-02T10:00:00Z') })))).toBe(0);
    });

    it('waiting time pays only beyond the free minutes, capped', () => {
      const w = rule({ kind: 'WAITING_TIME', config: { at: 'BOTH', freeMinutes: 5, perMinute: 1.5, maxAmount: 20 } });
      expect(total(taskEarnings([w], ctx({ waitPickupMinutes: 4, waitDropMinutes: 3 })))).toBe(3); // 7 - 5 = 2 min x 1.5
      expect(total(taskEarnings([w], ctx({ waitPickupMinutes: 30 })))).toBe(20);
      expect(total(taskEarnings([w], ctx({ waitPickupMinutes: null, waitDropMinutes: null })))).toBe(0); // unverified = none
    });
  });

  describe('failed and cancelled tasks', () => {
    const base = rule({ kind: 'BASE_PER_DELIVERY', config: { amount: 20 } });

    it('earn nothing without a compensation rule - never the full delivery amount', () => {
      expect(taskEarnings([base, SLABS], ctx({ result: 'FAILED_CUSTOMER_UNAVAILABLE' }))).toEqual([]);
      expect(taskEarnings([base, SLABS], ctx({ result: 'CANCELLED_AFTER_ASSIGNMENT' }))).toEqual([]);
    });

    it('pay the configured compensation for that outcome only', () => {
      const atPickup = rule({ kind: 'OUTCOME_COMPENSATION', config: { outcome: 'CANCELLED_AT_PICKUP', mode: 'FIXED', value: 10 } });
      const unavailable = rule({ kind: 'OUTCOME_COMPENSATION', config: { outcome: 'FAILED_CUSTOMER_UNAVAILABLE', mode: 'PERCENT_OF_DELIVERY', value: 50 } });
      const rules = [base, SLABS, atPickup, unavailable];
      expect(total(taskEarnings(rules, ctx({ result: 'CANCELLED_AT_PICKUP' })))).toBe(10);
      expect(total(taskEarnings(rules, ctx({ result: 'FAILED_CUSTOMER_UNAVAILABLE' })))).toBe(22.5); // 50% of (20 + 25)
      expect(total(taskEarnings(rules, ctx({ result: 'CANCELLED_AFTER_ASSIGNMENT' })))).toBe(0);
    });

    it('still pays verified waiting at a door nobody opened', () => {
      const w = rule({ kind: 'WAITING_TIME', config: { at: 'DROP', freeMinutes: 5, perMinute: 2 } });
      expect(total(taskEarnings([w], ctx({ result: 'FAILED_CUSTOMER_UNAVAILABLE', waitDropMinutes: 10 })))).toBe(10);
    });
  });

  describe('count targets', () => {
    const daily = rule({ id: 'daily', kind: 'DAILY_TARGET', config: { targets: [{ deliveries: 10, bonus: 100 }, { deliveries: 20, bonus: 250 }] } });

    it('credits each target reached, with a per-day key so it is paid once', () => {
      const at = { riderId: 'r1', zoneId: null, at: EVENING, timeZone: 'Asia/Kolkata', weekCount: 0 };
      expect(targetBonuses([daily], { ...at, dayCount: 9 })).toEqual([]);
      const ten = targetBonuses([daily], { ...at, dayCount: 10 });
      expect(ten.map((b) => [b.amount, b.dedupeKey])).toEqual([[100, 'bonus:r1:daily:2026-09-26:10']]);
      expect(targetBonuses([daily], { ...at, dayCount: 21 }).map((b) => b.amount)).toEqual([100, 250]);
    });

    it('weeks run Monday to Sunday in the rider timezone', () => {
      expect(weekKey(EVENING, 'Asia/Kolkata')).toBe('2026-09-21');
      expect(weekKey(new Date('2026-09-27T20:00:00Z'), 'Asia/Kolkata')).toBe('2026-09-28'); // Mon 01:30 IST
    });
  });

  it('inWindows handles overnight windows and specific days', () => {
    const late = [{ days: [6], start: '22:00', end: '02:00' }];
    expect(inWindows(late, new Date('2026-09-26T17:00:00Z'), 'Asia/Kolkata')).toBe(true); // Sat 22:30
    expect(inWindows(late, new Date('2026-09-26T19:30:00Z'), 'Asia/Kolkata')).toBe(true); // Sun 01:00
    expect(inWindows(late, new Date('2026-09-25T17:00:00Z'), 'Asia/Kolkata')).toBe(false); // Fri 22:30
  });
});
