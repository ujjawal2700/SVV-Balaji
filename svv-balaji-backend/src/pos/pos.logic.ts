/**
 * POS counter rules with no database and no framework. Unit-tested in
 * pos.logic.spec.ts. Money is rupees with paise precision; every sum goes
 * through integer paise so a drawer never drifts by a paisa.
 */

const paise = (r: number) => Math.round(r * 100);
const rupees = (p: number) => p / 100;

// --- Picking stock -----------------------------------------------------------------

export interface StockRow {
  /** finished_goods_stock row id */
  id: string;
  fgBatchId: string;
  fgBatchNumber: string;
  expiryDate: Date | null;
  quantity: number;
  reservedQuantity: number;
}

export interface Pick {
  stockId: string;
  fgBatchId: string;
  fgBatchNumber: string;
  quantity: number;
}

/** Sellable today: unexpired (an expiry of today is still sellable), with unreserved packs. */
export function sellable(rows: StockRow[], today: Date): StockRow[] {
  return rows.filter((r) => r.quantity - r.reservedQuantity > 0 && (!r.expiryDate || r.expiryDate >= today));
}

/** First expiry first out; batches without an expiry go last; ties by batch number for a stable order. */
export function byFefo(a: StockRow, b: StockRow): number {
  const ea = a.expiryDate ? a.expiryDate.getTime() : Infinity;
  const eb = b.expiryDate ? b.expiryDate.getTime() : Infinity;
  return ea - eb || a.fgBatchNumber.localeCompare(b.fgBatchNumber);
}

/**
 * Take `needed` packs first-expiry-first-out. `heldElsewhere` is stock already
 * promised to online orders at this node, which the counter must not sell -
 * it is subtracted from the total before anything is picked.
 *
 * Returns the picks, or the shortfall if the store cannot cover the line. Never
 * returns a partial sale: a counter customer is standing there, so the cashier
 * needs to know the whole truth before taking money.
 */
export function pickFefo(
  rows: StockRow[],
  needed: number,
  today: Date,
  heldElsewhere = 0,
): { ok: true; picks: Pick[] } | { ok: false; available: number } {
  const eligible = sellable(rows, today).sort(byFefo);
  const free = eligible.reduce((s, r) => s + r.quantity - r.reservedQuantity, 0);
  const available = Math.max(0, free - heldElsewhere);
  if (available < needed) return { ok: false, available };

  const picks: Pick[] = [];
  let outstanding = needed;
  for (const r of eligible) {
    if (outstanding === 0) break;
    const take = Math.min(outstanding, r.quantity - r.reservedQuantity);
    if (take <= 0) continue;
    picks.push({ stockId: r.id, fgBatchId: r.fgBatchId, fgBatchNumber: r.fgBatchNumber, quantity: take });
    outstanding -= take;
  }
  return { ok: true, picks };
}

/** Packs the store can sell now - the number shown on the billing terminal. */
export function availableToSell(rows: StockRow[], today: Date, heldElsewhere = 0): number {
  const free = sellable(rows, today).reduce((s, r) => s + r.quantity - r.reservedQuantity, 0);
  return Math.max(0, free - heldElsewhere);
}

/** Same product added twice (scanned twice) becomes one line. Order of first appearance is kept. */
export function mergeLines(items: Array<{ productId: string; quantity: number }>): Array<{ productId: string; quantity: number }> {
  const m = new Map<string, number>();
  for (const i of items) m.set(i.productId, (m.get(i.productId) ?? 0) + i.quantity);
  return [...m.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

// --- Tender -----------------------------------------------------------------------

/**
 * Cash: the customer must hand over at least the total; change is the rest.
 * UPI / card: nothing is tendered at the drawer.
 */
export function tender(
  mode: 'CASH' | 'UPI' | 'CARD',
  total: number,
  amountTendered?: number | null,
): { ok: true; amountTendered: number | null; changeDue: number | null } | { ok: false; message: string } {
  if (mode !== 'CASH') return { ok: true, amountTendered: null, changeDue: null };
  if (amountTendered === undefined || amountTendered === null) {
    return { ok: false, message: 'Enter the cash the customer handed over' };
  }
  if (paise(amountTendered) < paise(total)) {
    return { ok: false, message: `Cash tendered (₹${amountTendered.toFixed(2)}) is less than the bill (₹${total.toFixed(2)})` };
  }
  return { ok: true, amountTendered, changeDue: rupees(paise(amountTendered) - paise(total)) };
}

// --- Shift cash --------------------------------------------------------------------

export interface ShiftMoney {
  openingCash: number;
  /** Totals of every sale rung up in this shift, by how it was paid - including ones refunded later: the money did come in. */
  salesByMode: { CASH: number; UPI: number; CARD: number };
  /** Cash paid back out of THIS drawer for refunds (whichever shift the sale was in). */
  cashRefunds: number;
}

/** What should be in the drawer: opening float + cash taken - cash paid back. */
export function expectedCash(m: ShiftMoney): number {
  return rupees(paise(m.openingCash) + paise(m.salesByMode.CASH) - paise(m.cashRefunds));
}

/** counted - expected. Negative means the drawer is short. */
export function discrepancy(expected: number, counted: number): number {
  return rupees(paise(counted) - paise(expected));
}

// --- Days in IST --------------------------------------------------------------------

const IST_MS = 330 * 60_000;

/** "YYYY-MM-DD" of `d` as the calendar date in India. */
export function istDate(d: Date): string {
  return new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
}

/** [start, end) of an IST calendar day given as "YYYY-MM-DD". */
export function istDayBounds(day: string): { start: Date; end: Date } {
  const start = new Date(Date.parse(`${day}T00:00:00.000Z`) - IST_MS);
  return { start, end: new Date(start.getTime() + 24 * 3600_000) };
}

/**
 * A report range from optional "YYYY-MM-DD" from/to (inclusive, IST). Defaults
 * to today. Refuses ranges over 366 days so one request cannot scan years.
 */
export function istRange(from?: string, to?: string, now = new Date()): { start: Date; end: Date; from: string; to: string } {
  const f = from ?? to ?? istDate(now);
  const t = to ?? from ?? istDate(now);
  const [a, b] = f <= t ? [f, t] : [t, f];
  const start = istDayBounds(a).start;
  const end = istDayBounds(b).end;
  if (end.getTime() - start.getTime() > 366 * 24 * 3600_000) throw new RangeError('Choose a range of at most one year');
  return { start, end, from: a, to: b };
}

/** Start of today in IST - batches expiring today are still sellable. */
export function istStartOfToday(now = new Date()): Date {
  return istDayBounds(istDate(now)).start;
}
