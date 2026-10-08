import { api } from './client';
import type { SalesChannel } from './types';

/** from / to are YYYY-MM-DD (IST, inclusive). The server defaults to the last 30 days. */
export interface ReportQuery {
  from?: string;
  to?: string;
  channel?: SalesChannel;
  branchId?: string;
}

export type Granularity = 'day' | 'week' | 'month';

// --- Sales analytics ---------------------------------------------------------------

export interface SalesKpis {
  revenue: number;
  netOfTax: number;
  orders: number;
  posSales: number;
  units: number;
  avgOrderValue: number;
  customers: number;
  newCustomers: number;
  returningCustomers: number;
  repeatRate: number;
  cancelledOrders: number;
  cancellationRate: number;
  returnRequests: number;
  returnRate: number;
}

export interface ReorderRow {
  customerId: string;
  name: string;
  customerCode: string;
  phone: string;
  city: string | null;
  orders: number;
  avgGapDays: number | null;
  lastOrderDate: string;
  daysSinceLast: number;
  expectedNextDate: string | null;
  state: 'ON_TRACK' | 'DUE' | 'OVERDUE' | 'ONE_ORDER';
  lifetimeValue: number;
}

export interface SalesReport {
  range: { from: string; to: string };
  previousRange: { from: string; to: string };
  granularity: Granularity;
  channel: SalesChannel | null;
  kpis: SalesKpis;
  /** % change vs the previous period of the same length; null when the previous period had nothing. */
  changes: Record<'revenue' | 'orders' | 'avgOrderValue' | 'customers' | 'units' | 'returnRequests', number | null>;
  trend: Array<{ period: string; b2b: number; b2c: number; pos: number; total: number; orders: number }>;
  bySource: Array<{ key: string; label: string; orders: number; revenue: number; share: number }>;
  topProducts: Array<{ productId: string; name: string; sku: string | null; units: number; revenue: number; orders: number; share: number }>;
  byCategory: Array<{ categoryId: string | null; name: string; units: number; revenue: number; share: number }>;
  byRegion: Array<{ state: string; orders: number; customers: number; revenue: number; share: number }>;
  statusMix: Record<string, number>;
  /** Null when the report is filtered to B2C. */
  reorder: {
    medianGapDays: number | null;
    counts: { overdue: number; due: number; onTrack: number; oneOrder: number };
    customers: ReorderRow[];
  } | null;
  cohorts: Array<{ cohort: string; customers: number; retention: number[] }>;
  margin: { available: boolean; reason: string };
}

// --- Finance MIS -------------------------------------------------------------------

export type AgeingBucket = 'NOT_DUE' | 'D1_30' | 'D31_60' | 'D61_90' | 'D90_PLUS';

export interface FinanceChannel {
  key: 'B2C' | 'B2B' | 'POS';
  label: string;
  orders: number;
  billed: number;
  tax: number;
  netOfTax: number;
  collected: number;
  outstanding: number;
  discounts: number;
  coinsRedeemed: number;
  refunds: number;
  avgOrderValue: number;
  share: number;
}

export interface FinanceReport {
  range: { from: string; to: string };
  granularity: Granularity;
  totals: { orders: number; billed: number; tax: number; netOfTax: number; collected: number; outstanding: number; refunds: number; netRevenue: number };
  channels: FinanceChannel[];
  collections: { total: number; rows: Array<{ key: string; label: string; amount: number; count: number }>; refundWalletUsed: number };
  refunds: {
    total: number;
    returns: { count: number; byMethod: Record<string, number> };
    posRefunds: { count: number; amount: number };
  };
  gst: {
    invoices: number;
    cancelled: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    tax: number;
    total: number;
    bySupply: Record<'B2B' | 'B2C', { invoices: number; taxable: number; tax: number; total: number }>;
    byRate: Array<{ rate: number; taxable: number; tax: number }>;
    creditNotes: { count: number; taxable: number; tax: number; total: number };
    netTaxable: number;
    netCgst: number;
    netSgst: number;
    netIgst: number;
    netTax: number;
    eInvoice: { pending: number; generated: number; failed: number };
  };
  receivables: {
    creditPeriodStart: 'DISPATCH' | 'ORDER_DATE';
    outstanding: number;
    overdue: number;
    ageing: Record<AgeingBucket, number>;
    debtors: number;
    topDebtors: Array<{
      customerId: string; customerCode: string; name: string; phone: string; paymentTerms: string; creditLimit: number | null;
      outstanding: number; overdue: number; openBills: number; overdueBills: number; oldestOverdueDays: number;
    }>;
  };
  payables: { affiliateCommission: { amount: number; lines: number }; riderEarnings: number };
  trend: Array<{ period: string; billed: number; collected: number }>;
  recentCollections: Array<{ id: string; at: string; source: string; mode: string; reference: string | null; party: string | null; document: string | null; amount: number }>;
}

// --- Commerce dashboard ----------------------------------------------------------------

export interface CommerceDashboard {
  today: { orders: number; revenue: number };
  month: {
    from: string;
    b2b: { orders: number; revenue: number };
    b2c: { orders: number; revenue: number };
    pos: { sales: number; revenue: number };
  };
  toFulfil: { total: number; byStatus: Record<string, number> };
  pendingRetailerApprovals: number;
  openSupportTickets: number;
  openReturns: number;
  receivables: { outstanding: number; overdue: number };
  lowStock: {
    critical: number;
    low: number;
    items: Array<{ id: string; name: string; sku: string; unit: string; available: number; reorderPoint: number; safetyStock: number; status: 'LOW' | 'CRITICAL' }>;
  };
  recentOrders: Array<{ id: string; orderNumber: string; channel: SalesChannel; status: string; total: number; createdAt: string; customer: { name: string } }>;
}

export const reportsApi = {
  async sales(q: ReportQuery): Promise<SalesReport> {
    const response = await api.get<SalesReport>('/reports/sales', { params: q });
    return response.data;
  },

  async salesCsv(q: ReportQuery): Promise<Blob> {
    const response = await api.get('/reports/sales/export', { params: q, responseType: 'blob' });
    return response.data as Blob;
  },

  async finance(q: ReportQuery): Promise<FinanceReport> {
    const response = await api.get<FinanceReport>('/reports/finance', { params: q });
    return response.data;
  },

  async commerceDashboard(): Promise<CommerceDashboard> {
    const response = await api.get<CommerceDashboard>('/dashboard/commerce');
    return response.data;
  },
};
