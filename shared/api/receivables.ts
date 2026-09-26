import { api } from './client';
import { pruneEmpty, unwrap } from './envelope';
import type { PaymentTerms } from './types';

/**
 * B2B credit receivables (backend `src/receivables`): due dates, ageing,
 * payments received against credit bills, and the statement of account.
 */

export type CreditPeriodStart = 'DISPATCH' | 'ORDER_DATE';
export type ReceiptMethod = 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE' | 'OTHER';
export type AgeingBucket = 'NOT_DUE' | 'D1_30' | 'D31_60' | 'D61_90' | 'D90_PLUS';
export type Ageing = Record<AgeingBucket, number>;

export const RECEIPT_METHOD_LABEL: Record<ReceiptMethod, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  BANK_TRANSFER: 'Bank transfer',
  CHEQUE: 'Cheque',
  OTHER: 'Other',
};

export const AGEING_LABEL: Record<AgeingBucket, string> = {
  NOT_DUE: 'Not yet due',
  D1_30: '1–30 days overdue',
  D31_60: '31–60 days',
  D61_90: '61–90 days',
  D90_PLUS: '90+ days',
};

export const PAYMENT_TERMS_LABEL: Record<PaymentTerms, string> = {
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
  status: string;
  paymentTerms: PaymentTerms;
  paymentStatus: string;
  total: number;
  amountPaid: number;
  outstanding: number;
  dueDate: string | null;
  dueNote: string | null;
  overdueDays: number;
  overdue: boolean;
  bucket: AgeingBucket | null;
}

export interface CreditReceipt {
  id: string;
  receiptNumber: string;
  amount: number;
  method: ReceiptMethod;
  reference: string | null;
  receivedOn: string;
  note: string | null;
  recordedBy?: { id: string; fullName: string };
  createdAt: string;
  voided: boolean;
  voidedAt: string | null;
  voidReason: string | null;
  voidedBy?: { id: string; fullName: string } | null;
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

export interface CreditAccount {
  customer: { id: string; customerCode: string; name: string; contactName?: string | null; phone?: string; channel: string; gstin: string | null };
  terms: { paymentTerms: PaymentTerms; creditLimit: number | null; creditPeriodStart: CreditPeriodStart };
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
  ageing: Ageing;
  openBills: CreditBill[];
  receipts: CreditReceipt[];
  statement: {
    from: string | null;
    to: string | null;
    openingBalance: number;
    closingBalance: number;
    totals: { debit: number; credit: number };
    lines: StatementLine[];
  };
}

export interface ReceivablesRow {
  customerId: string;
  customerCode: string;
  name: string;
  phone: string;
  paymentTerms: PaymentTerms;
  creditLimit: number | null;
  outstanding: number;
  overdue: number;
  openBills: number;
  overdueBills: number;
  oldestOverdueDays: number;
  ageing: Ageing;
}

export interface ReceivablesList {
  creditPeriodStart: CreditPeriodStart;
  totals: { outstanding: number; overdue: number };
  ageing: Ageing;
  customers: ReceivablesRow[];
}

export interface RecordReceiptInput {
  amount: number;
  method: ReceiptMethod;
  reference?: string;
  /** YYYY-MM-DD */
  receivedOn: string;
  note?: string;
}

export interface StatementRange {
  from?: string;
  to?: string;
}

export const receivablesApi = {
  async list(query: { branchId?: string; overdueOnly?: boolean } = {}): Promise<ReceivablesList> {
    const response = await api.get<ReceivablesList>('/receivables', { params: pruneEmpty(query) });
    return unwrap<ReceivablesList>(response.data);
  },

  async account(customerId: string, range: StatementRange = {}): Promise<CreditAccount> {
    const response = await api.get<CreditAccount>(`/receivables/customers/${customerId}`, { params: pruneEmpty(range) });
    return unwrap<CreditAccount>(response.data);
  },

  async record(customerId: string, input: RecordReceiptInput) {
    const response = await api.post<{ id: string; receiptNumber: string; amount: number; appliedTo: Array<{ orderNumber: string; amount: number }> }>(
      `/receivables/customers/${customerId}/receipts`,
      input,
    );
    return response.data;
  },

  async void(receiptId: string, reason: string) {
    const response = await api.post(`/receivables/receipts/${receiptId}/void`, { reason });
    return response.data;
  },
};
