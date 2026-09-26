import { CreditPeriodStart, PaymentStatus, PaymentTerms } from '@prisma/client';
import {
  allocateOldestFirst,
  bucketOf,
  buildStatement,
  daysOverdue,
  dueDateOf,
  outstandingOf,
  statusAfter,
  termDays,
} from './receivables.logic';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('receivables logic', () => {
  describe('termDays', () => {
    it('maps every credit term and gives prepaid no period', () => {
      expect(termDays(PaymentTerms.CREDIT_7)).toBe(7);
      expect(termDays(PaymentTerms.CREDIT_15)).toBe(15);
      expect(termDays(PaymentTerms.CREDIT_30)).toBe(30);
      expect(termDays(PaymentTerms.CREDIT_45)).toBe(45);
      expect(termDays(PaymentTerms.PREPAID)).toBeNull();
    });
  });

  describe('dueDateOf', () => {
    const order = { paymentTerms: PaymentTerms.CREDIT_15, orderDate: d('2026-09-01'), dispatchedAt: d('2026-09-04') };

    it('counts from dispatch by default', () => {
      expect(dueDateOf(order, CreditPeriodStart.DISPATCH)).toEqual(d('2026-09-19'));
    });

    it('counts from the order date when configured', () => {
      expect(dueDateOf(order, CreditPeriodStart.ORDER_DATE)).toEqual(d('2026-09-16'));
    });

    it('has no due date before dispatch under DISPATCH', () => {
      expect(dueDateOf({ ...order, dispatchedAt: null }, CreditPeriodStart.DISPATCH)).toBeNull();
    });

    it('ignores the time of day of the start', () => {
      const late = { ...order, dispatchedAt: new Date('2026-09-04T22:45:00.000Z') };
      expect(dueDateOf(late, CreditPeriodStart.DISPATCH)).toEqual(d('2026-09-19'));
    });

    it('has no due date on prepaid terms', () => {
      expect(dueDateOf({ ...order, paymentTerms: PaymentTerms.PREPAID }, CreditPeriodStart.ORDER_DATE)).toBeNull();
    });
  });

  describe('daysOverdue and buckets', () => {
    it('is zero on and before the due date', () => {
      expect(daysOverdue(d('2026-09-19'), d('2026-09-19'))).toBe(0);
      expect(daysOverdue(d('2026-09-19'), d('2026-09-10'))).toBe(0);
      expect(daysOverdue(null, d('2026-09-30'))).toBe(0);
    });

    it('counts whole days after it', () => {
      expect(daysOverdue(d('2026-09-19'), d('2026-09-20'))).toBe(1);
      expect(daysOverdue(d('2026-09-19'), new Date('2026-10-19T23:00:00.000Z'))).toBe(30);
    });

    it('buckets by days overdue', () => {
      expect(bucketOf(0)).toBe('NOT_DUE');
      expect(bucketOf(1)).toBe('D1_30');
      expect(bucketOf(30)).toBe('D1_30');
      expect(bucketOf(31)).toBe('D31_60');
      expect(bucketOf(61)).toBe('D61_90');
      expect(bucketOf(91)).toBe('D90_PLUS');
    });
  });

  describe('outstandingOf', () => {
    it('is total minus paid on an open order', () => {
      expect(outstandingOf({ total: 1000, amountPaid: 250.5, paymentStatus: PaymentStatus.PARTIAL })).toBe(749.5);
    });

    it('treats an order already marked PAID or REFUNDED as settled, even with no receipts', () => {
      expect(outstandingOf({ total: 1000, amountPaid: 0, paymentStatus: PaymentStatus.PAID })).toBe(0);
      expect(outstandingOf({ total: 1000, amountPaid: 0, paymentStatus: PaymentStatus.REFUNDED })).toBe(0);
    });
  });

  describe('allocateOldestFirst', () => {
    const bills = [
      { id: 'new', outstanding: 300, dueDate: d('2026-10-10'), orderDate: d('2026-09-25') },
      { id: 'undispatched', outstanding: 500, dueDate: null, orderDate: d('2026-09-01') },
      { id: 'old', outstanding: 200, dueDate: d('2026-09-15'), orderDate: d('2026-08-31') },
    ];

    it('pays the earliest due bill first, then the next, and leaves bills without a due date for last', () => {
      expect(allocateOldestFirst(bills, 350)).toEqual([
        { id: 'old', amount: 200 },
        { id: 'new', amount: 150 },
      ]);
      expect(allocateOldestFirst(bills, 1000)).toEqual([
        { id: 'old', amount: 200 },
        { id: 'new', amount: 300 },
        { id: 'undispatched', amount: 500 },
      ]);
    });

    it('never allocates more than was paid, to the paisa', () => {
      const out = allocateOldestFirst(bills, 200.01);
      expect(out.reduce((s, a) => s + a.amount, 0)).toBeCloseTo(200.01, 2);
    });

    it('refuses more than is owed and non-positive amounts', () => {
      expect(() => allocateOldestFirst(bills, 1000.01)).toThrow(/more than/);
      expect(() => allocateOldestFirst(bills, 0)).toThrow(/greater than zero/);
    });
  });

  describe('statusAfter', () => {
    it('moves PENDING -> PARTIAL -> PAID', () => {
      expect(statusAfter(1000, 0)).toBe(PaymentStatus.PENDING);
      expect(statusAfter(1000, 0.01)).toBe(PaymentStatus.PARTIAL);
      expect(statusAfter(1000, 1000)).toBe(PaymentStatus.PAID);
    });
  });

  describe('buildStatement', () => {
    const entries = [
      { date: d('2026-09-01'), kind: 'BILL' as const, reference: 'SO-1', description: 'Order', debit: 1000, credit: 0 },
      { date: d('2026-09-10'), kind: 'RECEIPT' as const, reference: 'RCPT-1', description: 'UPI', debit: 0, credit: 400 },
      { date: d('2026-09-12'), kind: 'BILL' as const, reference: 'SO-2', description: 'Order', debit: 500, credit: 0 },
    ];

    it('keeps a running balance', () => {
      const s = buildStatement(entries);
      expect(s.lines.map((l) => l.balance)).toEqual([1000, 600, 1100]);
      expect(s.openingBalance).toBe(0);
      expect(s.closingBalance).toBe(1100);
      expect(s.totals).toEqual({ debit: 1500, credit: 400 });
    });

    it('folds entries before the period into the opening balance', () => {
      const s = buildStatement(entries, d('2026-09-05'));
      expect(s.openingBalance).toBe(1000);
      expect(s.lines.map((l) => l.reference)).toEqual(['RCPT-1', 'SO-2']);
      expect(s.closingBalance).toBe(1100);
    });

    it('drops entries after the period end', () => {
      const s = buildStatement(entries, undefined, d('2026-09-10'));
      expect(s.closingBalance).toBe(600);
    });
  });
});
