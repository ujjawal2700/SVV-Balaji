import {
  availableToSell,
  discrepancy,
  expectedCash,
  istDate,
  istDayBounds,
  istRange,
  mergeLines,
  pickFefo,
  StockRow,
  tender,
} from './pos.logic';

const today = new Date('2026-09-29T00:00:00+05:30');
const row = (id: string, qty: number, expiry: string | null, reserved = 0): StockRow => ({
  id: `s-${id}`, fgBatchId: `b-${id}`, fgBatchNumber: `FG-2026090${id}-001`,
  expiryDate: expiry ? new Date(`${expiry}T00:00:00+05:30`) : null, quantity: qty, reservedQuantity: reserved,
});

describe('pickFefo', () => {
  it('takes the earliest expiry first and spills into the next batch', () => {
    const r = pickFefo([row('3', 10, '2026-12-01'), row('1', 4, '2026-10-15'), row('2', 5, null)], 7, today);
    expect(r).toEqual({ ok: true, picks: [
      { stockId: 's-1', fgBatchId: 'b-1', fgBatchNumber: 'FG-20260901-001', quantity: 4 },
      { stockId: 's-3', fgBatchId: 'b-3', fgBatchNumber: 'FG-20260903-001', quantity: 3 },
    ] });
  });

  it('never sells an expired batch, but a batch expiring today is still sellable', () => {
    const r = pickFefo([row('1', 5, '2026-09-28'), row('2', 2, '2026-09-29')], 2, today);
    expect(r.ok && r.picks.map((p) => p.fgBatchId)).toEqual(['b-2']);
    expect(pickFefo([row('1', 5, '2026-09-28')], 1, today)).toEqual({ ok: false, available: 0 });
  });

  it('leaves packs reserved for orders and stock promised online alone', () => {
    expect(pickFefo([row('1', 10, null, 6)], 5, today)).toEqual({ ok: false, available: 4 });
    expect(pickFefo([row('1', 10, null)], 9, today, 2)).toEqual({ ok: false, available: 8 });
    const r = pickFefo([row('1', 10, null, 6)], 4, today);
    expect(r.ok && r.picks[0].quantity).toBe(4);
  });

  it('refuses rather than sell part of a line', () => {
    expect(pickFefo([row('1', 3, null), row('2', 2, null)], 6, today)).toEqual({ ok: false, available: 5 });
  });

  it('counts what the terminal may sell the same way', () => {
    expect(availableToSell([row('1', 5, '2026-09-28'), row('2', 7, null, 2)], today, 1)).toBe(4);
  });
});

describe('mergeLines', () => {
  it('turns a product scanned twice into one line, keeping first-seen order', () => {
    expect(mergeLines([{ productId: 'a', quantity: 1 }, { productId: 'b', quantity: 2 }, { productId: 'a', quantity: 3 }]))
      .toEqual([{ productId: 'a', quantity: 4 }, { productId: 'b', quantity: 2 }]);
  });
});

describe('tender', () => {
  it('gives change for cash and refuses short cash', () => {
    expect(tender('CASH', 551.25, 600)).toEqual({ ok: true, amountTendered: 600, changeDue: 48.75 });
    expect(tender('CASH', 551.25, 551.25)).toEqual({ ok: true, amountTendered: 551.25, changeDue: 0 });
    expect(tender('CASH', 551.25, 551.24)).toMatchObject({ ok: false });
    expect(tender('CASH', 100)).toMatchObject({ ok: false });
  });

  it('takes nothing at the drawer for UPI and card', () => {
    expect(tender('UPI', 551.25)).toEqual({ ok: true, amountTendered: null, changeDue: null });
    expect(tender('CARD', 551.25, 9999)).toEqual({ ok: true, amountTendered: null, changeDue: null });
  });
});

describe('shift cash', () => {
  it('expects opening float + cash taken - cash paid back, and never drifts by a paisa', () => {
    const e = expectedCash({ openingCash: 5000, salesByMode: { CASH: 12450.1, UPI: 18900, CARD: 6400 }, cashRefunds: 0.2 });
    expect(e).toBe(17449.9);
  });

  it('reports a short drawer as negative', () => {
    expect(discrepancy(7300, 7250)).toBe(-50);
    expect(discrepancy(7300.1, 7300.1)).toBe(0);
  });
});

describe('IST days', () => {
  it('uses the Indian calendar date, not UTC', () => {
    expect(istDate(new Date('2026-09-28T19:00:00Z'))).toBe('2026-09-29'); // 00:30 IST
    const { start, end } = istDayBounds('2026-09-29');
    expect(start.toISOString()).toBe('2026-09-28T18:30:00.000Z');
    expect(end.getTime() - start.getTime()).toBe(24 * 3600_000);
  });

  it('defaults a report to today, accepts either order, and refuses over a year', () => {
    const now = new Date('2026-09-29T10:00:00+05:30');
    expect(istRange(undefined, undefined, now)).toMatchObject({ from: '2026-09-29', to: '2026-09-29' });
    expect(istRange('2026-09-30', '2026-09-01', now)).toMatchObject({ from: '2026-09-01', to: '2026-09-30' });
    expect(() => istRange('2024-01-01', '2026-01-01', now)).toThrow(RangeError);
  });
});
