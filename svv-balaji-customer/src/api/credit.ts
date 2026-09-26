import { api } from './client';

/** GET /storefront/credit - the signed-in retailer's own credit account. */

export type PaymentTerms = 'PREPAID' | 'CREDIT_7' | 'CREDIT_15' | 'CREDIT_30' | 'CREDIT_45';
export type AgeingBucket = 'NOT_DUE' | 'D1_30' | 'D31_60' | 'D61_90' | 'D90_PLUS';

export const TERMS_LABEL: Record<PaymentTerms, string> = {
  PREPAID: 'Prepaid',
  CREDIT_7: 'Net 7 days',
  CREDIT_15: 'Net 15 days',
  CREDIT_30: 'Net 30 days',
  CREDIT_45: 'Net 45 days',
};

export interface CreditBill {
  orderId: string;
  orderNumber: string;
  orderDate: string;
  dispatchedAt: string | null;
  total: number;
  amountPaid: number;
  outstanding: number;
  dueDate: string | null;
  dueNote: string | null;
  overdueDays: number;
  overdue: boolean;
  bucket: AgeingBucket | null;
}

export interface CreditPayment {
  id: string;
  receiptNumber: string;
  amount: number;
  method: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE' | 'OTHER';
  reference: string | null;
  receivedOn: string;
  voided: boolean;
  appliedTo: Array<{ orderNumber: string; amount: number }>;
}

export interface StatementLine {
  date: string;
  kind: 'BILL' | 'RECEIPT';
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface MyCreditAccount {
  terms: { paymentTerms: PaymentTerms; creditLimit: number | null; creditPeriodStart: 'DISPATCH' | 'ORDER_DATE' };
  summary: {
    outstanding: number;
    overdue: number;
    availableCredit: number | null;
    overLimit: boolean;
    openBills: number;
    overdueBills: number;
    oldestOverdueDays: number;
    nextDue: { orderNumber: string; dueDate: string; amount: number } | null;
  };
  ageing: Record<AgeingBucket, number>;
  openBills: CreditBill[];
  receipts: CreditPayment[];
  statement: {
    openingBalance: number;
    closingBalance: number;
    totals: { debit: number; credit: number };
    lines: StatementLine[];
  };
}

export const creditApi = {
  mine: (range: { from?: string; to?: string } = {}) =>
    api.get<MyCreditAccount>('/storefront/credit', { params: range }).then((r) => r.data),
};
