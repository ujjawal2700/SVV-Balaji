import { CreditPeriodStart, PaymentStatus, PaymentTerms } from '@prisma/client';

/**
 * B2B credit arithmetic - due dates, what is still owed, ageing, and how a
 * payment is spread over open bills. Pure functions, no database, so every rule
 * here is unit-tested directly (receivables.logic.spec.ts).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Net N days" for a payment term. PREPAID has no credit period. */
export function termDays(terms: PaymentTerms): number | null {
  switch (terms) {
    case PaymentTerms.CREDIT_7:
      return 7;
    case PaymentTerms.CREDIT_15:
      return 15;
    case PaymentTerms.CREDIT_30:
      return 30;
    case PaymentTerms.CREDIT_45:
      return 45;
    default:
      return null;
  }
}

/** Midnight UTC of a date's calendar day - due dates and ageing count whole days. */
export function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export interface CreditOrderFacts {
  total: number;
  amountPaid: number;
  paymentStatus: PaymentStatus;
  paymentTerms: PaymentTerms;
  orderDate: Date;
  dispatchedAt: Date | null;
}

/**
 * What the customer still owes on one order.
 *
 * PAID and REFUNDED are settled whatever `amountPaid` says: orders marked paid
 * before receipts existed have `amountPaid` 0, and must not reappear as debt.
 */
export function outstandingOf(o: Pick<CreditOrderFacts, 'total' | 'amountPaid' | 'paymentStatus'>): number {
  if (o.paymentStatus === PaymentStatus.PAID || o.paymentStatus === PaymentStatus.REFUNDED) return 0;
  return round2(Math.max(o.total - o.amountPaid, 0));
}

/**
 * When the order falls due. Null while the credit period has not started - under
 * DISPATCH that is every order not yet dispatched, which is therefore never overdue.
 */
export function dueDateOf(
  o: Pick<CreditOrderFacts, 'paymentTerms' | 'orderDate' | 'dispatchedAt'>,
  start: CreditPeriodStart,
): Date | null {
  const days = termDays(o.paymentTerms);
  if (days === null) return null;
  const from = start === CreditPeriodStart.ORDER_DATE ? o.orderDate : o.dispatchedAt;
  if (!from) return null;
  return new Date(startOfDay(from).getTime() + days * DAY_MS);
}

/** Whole days past due as of `today` (0 when not yet due or no due date). */
export function daysOverdue(due: Date | null, today: Date): number {
  if (!due) return 0;
  const diff = Math.floor((startOfDay(today).getTime() - startOfDay(due).getTime()) / DAY_MS);
  return Math.max(diff, 0);
}

export type AgeingBucket = 'NOT_DUE' | 'D1_30' | 'D31_60' | 'D61_90' | 'D90_PLUS';

export function bucketOf(overdueDays: number): AgeingBucket {
  if (overdueDays <= 0) return 'NOT_DUE';
  if (overdueDays <= 30) return 'D1_30';
  if (overdueDays <= 60) return 'D31_60';
  if (overdueDays <= 90) return 'D61_90';
  return 'D90_PLUS';
}

export type Ageing = Record<AgeingBucket, number>;

export function emptyAgeing(): Ageing {
  return { NOT_DUE: 0, D1_30: 0, D31_60: 0, D61_90: 0, D90_PLUS: 0 };
}

export interface OpenBill {
  id: string;
  outstanding: number;
  dueDate: Date | null;
  orderDate: Date;
}

/**
 * Spread a payment over open bills, oldest due first.
 *
 * Bills with a due date come before bills whose credit period has not started
 * (they are the ones costing the customer standing); ties go to the older order.
 * Refuses a payment larger than everything owed - an advance would need a
 * customer balance this system does not keep, and silently dropping the excess
 * would lose money on paper.
 */
export function allocateOldestFirst(bills: OpenBill[], amount: number): Array<{ id: string; amount: number }> {
  const pay = round2(amount);
  if (!(pay > 0)) throw new Error('Payment amount must be greater than zero');
  const owed = round2(bills.reduce((s, b) => s + b.outstanding, 0));
  if (pay > owed) {
    throw new Error(`Payment of ${pay.toFixed(2)} is more than the ${owed.toFixed(2)} outstanding`);
  }

  const ordered = [...bills]
    .filter((b) => b.outstanding > 0)
    .sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime() || a.orderDate.getTime() - b.orderDate.getTime();
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return a.orderDate.getTime() - b.orderDate.getTime();
    });

  const out: Array<{ id: string; amount: number }> = [];
  let left = pay;
  for (const bill of ordered) {
    if (left <= 0) break;
    const take = round2(Math.min(bill.outstanding, left));
    out.push({ id: bill.id, amount: take });
    left = round2(left - take);
  }
  return out;
}

/** PAID once nothing is left, PARTIAL once anything is paid, else PENDING. */
export function statusAfter(total: number, amountPaid: number): PaymentStatus {
  if (round2(amountPaid) >= round2(total)) return PaymentStatus.PAID;
  if (amountPaid > 0) return PaymentStatus.PARTIAL;
  return PaymentStatus.PENDING;
}

export interface StatementEntry {
  date: Date;
  kind: 'BILL' | 'RECEIPT';
  reference: string;
  description: string;
  debit: number;
  credit: number;
}

/**
 * The statement of account: bills (debits) and receipts (credits) in date order
 * with a running balance. Entries before `from` collapse into the opening balance.
 */
export function buildStatement(entries: StatementEntry[], from?: Date, to?: Date) {
  const sorted = [...entries].sort(
    (a, b) => a.date.getTime() - b.date.getTime() || (a.kind === b.kind ? 0 : a.kind === 'BILL' ? -1 : 1),
  );
  const fromDay = from ? startOfDay(from).getTime() : null;
  const toDay = to ? startOfDay(to).getTime() : null;

  let opening = 0;
  let balance = 0;
  const lines: Array<StatementEntry & { balance: number }> = [];
  for (const e of sorted) {
    const day = startOfDay(e.date).getTime();
    if (toDay !== null && day > toDay) continue;
    balance = round2(balance + e.debit - e.credit);
    if (fromDay !== null && day < fromDay) {
      opening = balance;
      continue;
    }
    lines.push({ ...e, balance });
  }
  const totals = lines.reduce(
    (t, l) => ({ debit: round2(t.debit + l.debit), credit: round2(t.credit + l.credit) }),
    { debit: 0, credit: 0 },
  );
  return { openingBalance: opening, lines, closingBalance: balance, totals };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
