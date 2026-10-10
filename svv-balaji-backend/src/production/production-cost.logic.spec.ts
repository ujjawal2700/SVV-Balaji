import { costTotals, rawMaterialCost, utilisation, validateOtherCosts } from './production-cost.logic';

describe('rawMaterialCost', () => {
  it('multiplies each consumed batch by its purchase rate', () => {
    const r = rawMaterialCost([
      { batchNumber: 'RM-1', quantityUsed: 100, rate: 32.5 },
      { batchNumber: 'RM-2', quantityUsed: 40.25, rate: 28 },
    ]);
    expect(r.amount).toBe(4377);
    expect(r.missingRate).toEqual([]);
  });

  it('leaves a batch with no rate out of the amount and names it', () => {
    const r = rawMaterialCost([
      { batchNumber: 'RM-1', quantityUsed: 10, rate: 30 },
      { batchNumber: 'RM-2', quantityUsed: 5, rate: null },
    ]);
    expect(r.amount).toBe(300);
    expect(r.missingRate).toEqual(['RM-2']);
    expect(r.lines[1].cost).toBeNull();
  });
});

describe('costTotals', () => {
  it('adds raw + labour + machine + loss + other and divides by output', () => {
    const t = costTotals({ raw: 1000, labour: 200, machine: 150, loss: 50, other: [{ label: 'Packaging', amount: 100 }, { label: 'Power', amount: 0.5 }] }, 300);
    expect(t.otherTotal).toBe(100.5);
    expect(t.total).toBe(1500.5);
    expect(t.perUnit).toBe(5.0017);
  });

  it('has no per-unit cost until output is known', () => {
    expect(costTotals({ raw: 10, labour: 0, machine: 0, loss: 0, other: [] }, null).perUnit).toBeNull();
    expect(costTotals({ raw: 10, labour: 0, machine: 0, loss: 0, other: [] }, 0).perUnit).toBeNull();
  });
});

describe('validateOtherCosts', () => {
  it('accepts labelled non-negative amounts', () => {
    expect(validateOtherCosts([{ label: 'Packaging', amount: 0 }])).toBeNull();
    expect(validateOtherCosts([])).toBeNull();
  });
  it('refuses a missing label or a negative amount', () => {
    expect(validateOtherCosts([{ label: ' ', amount: 5 }])).toMatch(/what it is for/);
    expect(validateOtherCosts([{ label: 'x', amount: -1 }])).toMatch(/0 or more/);
    expect(validateOtherCosts('nope')).toMatch(/list/);
  });
});

describe('utilisation', () => {
  const day = (d: string, h = 0) => new Date(`2026-10-${d}T${String(h).padStart(2, '0')}:00:00.000Z`);
  const range = { start: day('01'), end: day('03') }; // two days

  it('sums run hours inside the range and divides by the hours available', () => {
    const u = utilisation(
      [
        { status: 'COMPLETED', startedAt: day('01', 2), completedAt: day('01', 6), actualQuantity: 400 },
        { status: 'COMPLETED', startedAt: day('02', 1), completedAt: day('02', 5), actualQuantity: 380 },
      ],
      range, 8, day('05'),
    );
    expect(u.runs).toBe(2);
    expect(u.runHours).toBe(8);
    expect(u.availableHours).toBe(16);
    expect(u.utilisationPercent).toBe(50);
    expect(u.outputQuantity).toBe(780);
  });

  it('clips runs crossing the range edges and counts a live run up to now', () => {
    const u = utilisation(
      [
        { status: 'COMPLETED', startedAt: day('01', 0, ), completedAt: day('01', 3), actualQuantity: 10 },
        { status: 'IN_PROGRESS', startedAt: day('02', 22), completedAt: null, actualQuantity: null },
      ],
      { start: day('01', 1), end: day('03') }, 8, day('02', 23),
    );
    expect(u.runHours).toBe(3); // 2h of the first + 1h of the live one
    expect(u.inProgressRuns).toBe(1);
  });

  it('counts old runs without times but gives them no hours, and ignores cancelled runs', () => {
    const u = utilisation(
      [
        { status: 'COMPLETED', startedAt: null, completedAt: null, actualQuantity: 50 },
        { status: 'CANCELLED', startedAt: day('01', 1), completedAt: null, actualQuantity: null },
      ],
      range, 8, day('05'),
    );
    expect(u.runs).toBe(1);
    expect(u.runsWithoutTimes).toBe(1);
    expect(u.runHours).toBe(0);
    expect(u.outputQuantity).toBe(50);
  });
});
