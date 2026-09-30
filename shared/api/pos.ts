import { api } from './client';
import { pruneEmpty, unwrap, unwrapList, type Paginated } from './envelope';

/**
 * POS counters for company-owned stores (backend `src/pos`). Money arrives as
 * numbers. Prices, tax, stock and totals are always the server's - the
 * terminal only ever shows them.
 */

export type PosPaymentMode = 'CASH' | 'UPI' | 'CARD';
export type PosSaleStatus = 'COMPLETED' | 'REFUNDED';
export type PosCustomerType = 'WALK_IN' | 'REGULAR_KIRANA' | 'INSTITUTIONAL';
export type PosShiftStatus = 'OPEN' | 'CLOSED';

export const PAYMENT_MODE_LABEL: Record<PosPaymentMode, string> = { CASH: 'Cash', UPI: 'UPI', CARD: 'Card' };
export const CUSTOMER_TYPE_LABEL: Record<PosCustomerType, string> = {
  WALK_IN: 'Walk-in',
  REGULAR_KIRANA: 'Regular kirana',
  INSTITUTIONAL: 'Institutional',
};

// --- Outlets ---

export interface PosOutletInventoryRow {
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  packs: number;
  sellable: number;
  reorderLevel: number;
  lowStock: boolean;
  unitPrice: number | null;
  gstRatePercent: number | null;
}

export interface PosOutlet {
  id: string;
  code: string;
  name: string;
  address: string;
  city: string;
  district: string | null;
  state: string;
  pincode: string | null;
  managerName: string | null;
  managerPhone: string | null;
  defaultCashierName: string | null;
  posTerminalsCount: number;
  defaultOpeningCash: number;
  isActive: boolean;
  branchId: string;
  branch?: { id: string; name: string };
  warehouseId: string;
  counterStatus: 'OPEN' | 'CLOSED';
  openShifts: Array<{ id: string; shiftNumber: string; openedAt: string; cashierName: string }>;
  today: { salesCount: number; cash: number; upi: number; card: number; total: number };
  lastReconciliation: { shiftNumber: string; closedAt: string; discrepancy: number; status: 'BALANCED' | 'DISCREPANCY' } | null;
  stock: { packs: number; products: number; lowStockCount: number; valuation: number };
  inventory?: PosOutletInventoryRow[];
}

export interface PosOutletInput {
  name: string;
  code: string;
  address: string;
  city: string;
  district?: string | null;
  state: string;
  pincode?: string | null;
  managerName?: string | null;
  managerPhone?: string | null;
  defaultCashierName?: string | null;
  posTerminalsCount?: number;
  defaultOpeningCash?: number;
  branchId?: string;
}

// --- Catalogue / shifts / sales ---

export interface PosCatalogueItem {
  id: string;
  name: string;
  sku: string;
  unit: string;
  packLabel: string | null;
  category: string;
  availableStock: number;
  /** GST-exclusive; null = no B2C price set, not sellable. */
  unitPrice: number | null;
  gstRatePercent: number | null;
}

export interface PosShift {
  id: string;
  shiftNumber: string;
  outletId: string;
  outlet?: { id: string; name: string; code?: string };
  cashierId: string;
  cashier?: { id: string; fullName: string };
  closedBy?: { id: string; fullName: string } | null;
  status: PosShiftStatus;
  openedAt: string;
  closedAt: string | null;
  openingCash: number;
  salesCount: number;
  salesByMode: Record<PosPaymentMode, number>;
  totalSales: number;
  refundsCount: number;
  refundsTotal: number;
  cashRefunds: number;
  expectedCash: number;
  countedCash: number | null;
  discrepancy: number | null;
  notes: string | null;
}

export interface PosCustomerInput {
  type?: PosCustomerType;
  name?: string;
  phone?: string;
  gstin?: string;
  address?: string;
  city?: string;
  notes?: string;
}

export interface CreatePosSaleInput {
  outletId: string;
  items: Array<{ productId: string; quantity: number }>;
  discount?: number;
  paymentMode: PosPaymentMode;
  amountTendered?: number;
  paymentReference?: string;
  customer?: PosCustomerInput;
  clientRequestId: string;
}

export interface PosSaleLine {
  id: string;
  lineNo: number;
  productId: string;
  nameSnapshot: string;
  skuSnapshot: string | null;
  quantity: number;
  unitPrice: number;
  gstRatePercent: number;
  lineSubtotal: number;
  lineDiscount: number;
  lineTax: number;
  lineTotal: number;
  batches: Array<{ fgBatchId: string; fgBatchNumber: string; expiryDate: string | null; quantity: number }>;
}

export interface PosSale {
  id: string;
  saleNumber: string;
  createdAt: string;
  outlet: { id: string; code: string; name: string; address: string; city: string; state: string; pincode: string | null };
  shift: { id: string; shiftNumber: string };
  cashier: { id: string; fullName: string };
  customerType: PosCustomerType;
  customerName: string;
  customerPhone: string | null;
  customerGstin: string | null;
  customerAddress: string | null;
  customerCity: string | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  paymentMode: PosPaymentMode;
  amountTendered: number | null;
  changeDue: number | null;
  paymentReference: string | null;
  status: PosSaleStatus;
  refundedAt: string | null;
  refundedBy: { id: string; fullName: string } | null;
  refundReason: string | null;
  lines: PosSaleLine[];
  invoice: { id: string; invoiceNumber: string; status: string; eInvoiceStatus: string } | null;
  invoices: Array<{ id: string; invoiceNumber: string; status: string; eInvoiceStatus: string; invoiceDate: string }>;
}

export interface PosSaleRow {
  id: string;
  saleNumber: string;
  createdAt: string;
  outlet: { id: string; name: string; code: string };
  cashierName: string;
  customerType: PosCustomerType;
  customerName: string;
  customerPhone: string | null;
  customerGstin: string | null;
  itemsSummary: string;
  itemCount: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMode: PosPaymentMode;
  status: PosSaleStatus;
  invoice: { id: string; invoiceNumber: string } | null;
}

export interface PosSalesQuery {
  outletId?: string;
  paymentMode?: PosPaymentMode;
  status?: PosSaleStatus;
  shiftId?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface PosReport {
  range: { from: string; to: string };
  totals: {
    salesCount: number;
    netSales: number;
    taxCollected: number;
    discountGiven: number;
    refundsCount: number;
    refundsAmount: number;
    averageBill: number;
  };
  byMode: Record<PosPaymentMode, { total: number; count: number }>;
  daily: Array<{ date: string; total: number; count: number }>;
  topItems: Array<{ productId: string; name: string; sku: string | null; quantity: number; revenue: number }>;
  byOutlet: Array<{ outletId: string; name: string; total: number; count: number }>;
}

export const posApi = {
  outlets: async (query: { search?: string; branchId?: string; includeInactive?: boolean } = {}): Promise<PosOutlet[]> =>
    unwrap((await api.get<PosOutlet[]>('/pos/outlets', { params: pruneEmpty({ ...query, includeInactive: query.includeInactive ? 'true' : undefined }) })).data),
  outlet: async (id: string): Promise<PosOutlet> => unwrap((await api.get<PosOutlet>(`/pos/outlets/${id}`)).data),
  createOutlet: async (input: PosOutletInput) => (await api.post('/pos/outlets', pruneEmpty(input))).data,
  // Not pruned: clearing an optional field is sent as null on purpose.
  updateOutlet: async (id: string, input: Partial<PosOutletInput>) => (await api.patch(`/pos/outlets/${id}`, input)).data,
  setOutletActive: async (id: string, isActive: boolean) => (await api.patch(`/pos/outlets/${id}/status`, { isActive })).data,
  deleteOutlet: async (id: string) => (await api.delete(`/pos/outlets/${id}`)).data,

  catalogue: async (outletId: string): Promise<PosCatalogueItem[]> =>
    unwrap((await api.get<PosCatalogueItem[]>(`/pos/outlets/${outletId}/catalogue`)).data),

  myShift: async (outletId: string): Promise<PosShift | null> =>
    (await api.get<PosShift | null>('/pos/shifts/mine', { params: { outletId } })).data || null,
  shifts: async (query: { outletId?: string; status?: PosShiftStatus; from?: string; to?: string } = {}): Promise<PosShift[]> =>
    unwrap((await api.get<PosShift[]>('/pos/shifts', { params: pruneEmpty(query) })).data),
  openShift: async (outletId: string, openingCash: number) => (await api.post('/pos/shifts', { outletId, openingCash })).data,
  closeShift: async (id: string, countedCash: number, notes?: string) =>
    (await api.post(`/pos/shifts/${id}/close`, pruneEmpty({ countedCash, notes }))).data,

  createSale: async (input: CreatePosSaleInput): Promise<PosSale> => (await api.post<PosSale>('/pos/sales', input)).data,
  sales: async (query: PosSalesQuery = {}): Promise<Paginated<PosSaleRow>> => {
    const res = await api.get('/pos/sales', { params: pruneEmpty(query) });
    return unwrapList<PosSaleRow>(res.data, { page: query.page ?? 1, limit: query.limit ?? 20 });
  },
  sale: async (id: string): Promise<PosSale> => (await api.get<PosSale>(`/pos/sales/${id}`)).data,
  refund: async (id: string, reason: string): Promise<PosSale> => (await api.post<PosSale>(`/pos/sales/${id}/refund`, { reason })).data,

  report: async (query: { outletId?: string; from?: string; to?: string } = {}): Promise<PosReport> =>
    (await api.get<PosReport>('/pos/reports', { params: pruneEmpty(query) })).data,
};
