import { api } from './client';
import { pruneEmpty, unwrapList, type Paginated } from './envelope';

/**
 * GST tax invoices (backend `src/invoices`). Issued by the server at dispatch;
 * the client only ever prints what it is given - it never recomputes tax.
 * Money arrives as numbers on this API (see InvoicesService.present).
 */

export type InvoiceStatus = 'ISSUED' | 'CANCELLED';
export type InvoiceSupplyType = 'B2B' | 'B2C';
export type EInvoiceStatus = 'NOT_APPLICABLE' | 'PENDING' | 'GENERATED' | 'FAILED' | 'CANCELLED';
export type IrnCancelReason = '1' | '2' | '3' | '4';

export const EINVOICE_STATUS_LABEL: Record<EInvoiceStatus, string> = {
  NOT_APPLICABLE: 'Not required',
  PENDING: 'Queued',
  GENERATED: 'IRN generated',
  FAILED: 'Needs attention',
  CANCELLED: 'IRN cancelled',
};

export const IRN_CANCEL_REASON_LABEL: Record<IrnCancelReason, string> = {
  '1': 'Duplicate',
  '2': 'Data entry mistake',
  '3': 'Order cancelled',
  '4': 'Other',
};

export interface InvoiceParty {
  legalName: string;
  tradeName: string | null;
  gstin: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string | null;
  pincode: string | null;
  stateCode: string | null;
  stateName: string | null;
  phone: string | null;
  email: string | null;
}

export interface InvoiceLine {
  lineNo: number;
  productId: string | null;
  description: string;
  sku: string | null;
  hsnSac: string | null;
  isService: boolean;
  quantity: number;
  uqc: string;
  unitPrice: number;
  gross: number;
  discount: number;
  taxableValue: number;
  gstRatePercent: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  lineTotal: number;
}

export interface HsnSummaryRow {
  hsnSac: string | null;
  gstRatePercent: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  financialYear: string;
  status: InvoiceStatus;
  supplyType: InvoiceSupplyType;
  channel: 'B2B' | 'B2C';
  seller: InvoiceParty & { footerNote?: string | null };
  buyer: InvoiceParty;
  placeOfSupply: string;
  placeOfSupplyName: string | null;
  placeOfSupplyAssumed: boolean;
  isInterState: boolean;
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  taxTotal: number;
  discountTotal: number;
  roundOff: number;
  grandTotal: number;
  lines: InvoiceLine[];
  hsnSummary: HsnSummaryRow[];
  eInvoiceStatus: EInvoiceStatus;
  irn: string | null;
  ackNo: string | null;
  ackDate: string | null;
  signedQrCode: string | null;
  /** PNG data URL of the signed QR, rendered by the server. */
  signedQrImage: string | null;
  eInvoiceError?: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  order: { id: string; orderNumber: string; orderDate: string; status: string; paymentMode: string | null; paymentTerms: string; dispatchedAt: string | null } | null;
  posSale?: { id: string; saleNumber: string; createdAt: string; paymentMode: string; outlet: { id: string; name: string } } | null;
  issuedBy?: { id: string; fullName: string } | null;
  cancelledBy?: { id: string; fullName: string } | null;
}

export interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  status: InvoiceStatus;
  supplyType: InvoiceSupplyType;
  channel: 'B2B' | 'B2C';
  taxableTotal: string;
  taxTotal: string;
  grandTotal: string;
  eInvoiceStatus: EInvoiceStatus;
  eInvoiceError: string | null;
  irn: string | null;
  placeOfSupply: string;
  placeOfSupplyAssumed: boolean;
  isInterState: boolean;
  /** Exactly one of order / posSale is set. */
  order: { id: string; orderNumber: string } | null;
  posSale: { id: string; saleNumber: string; outlet: { name: string } } | null;
  /** Null for a counter sale to a walk-in (no customer record) - use buyer. */
  customer: { id: string; name: string; gstin: string | null } | null;
  buyer: InvoiceParty;
}

export interface OrderInvoiceRow {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  status: InvoiceStatus;
  supplyType: InvoiceSupplyType;
  grandTotal: string;
  eInvoiceStatus: EInvoiceStatus;
  eInvoiceError: string | null;
}

export interface InvoiceQuery {
  status?: InvoiceStatus;
  supplyType?: InvoiceSupplyType;
  eInvoiceStatus?: EInvoiceStatus;
  from?: string;
  to?: string;
  search?: string;
  branchId?: string;
  page?: number;
  limit?: number;
}

export interface GstSettings {
  id: string;
  legalName: string | null;
  tradeName: string | null;
  gstin: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  invoicePrefix: string;
  eInvoiceEnabled: boolean;
  deliveryFeeSac: string;
  deliveryFeeGstRatePercent: number;
  footerNote: string | null;
  invoicingStartsAt: string | null;
  stateCode: string | null;
  stateName: string | null;
  /** True once every seller detail an invoice needs is present. */
  ready: boolean;
  missing: string[];
  gspProvider: 'mock' | 'none';
}

export type UpdateGstSettingsInput = Partial<Pick<GstSettings,
  'legalName' | 'tradeName' | 'gstin' | 'addressLine1' | 'addressLine2' | 'city' | 'pincode' | 'phone' | 'email' |
  'invoicePrefix' | 'eInvoiceEnabled' | 'deliveryFeeSac' | 'deliveryFeeGstRatePercent' | 'footerNote'>>;

export const invoicesApi = {
  async list(query: InvoiceQuery = {}): Promise<Paginated<InvoiceRow>> {
    const response = await api.get('/invoices', { params: pruneEmpty(query) });
    return unwrapList<InvoiceRow>(response.data, { page: query.page ?? 1, limit: query.limit ?? 20 });
  },
  async get(id: string): Promise<Invoice> {
    const response = await api.get<Invoice>(`/invoices/${id}`);
    return response.data;
  },
  async forOrder(orderId: string): Promise<OrderInvoiceRow[]> {
    const response = await api.get<OrderInvoiceRow[]>(`/invoices/order/${orderId}`);
    return response.data;
  },
  async issue(orderId: string): Promise<Invoice> {
    const response = await api.post<Invoice>(`/invoices/order/${orderId}`);
    return response.data;
  },
  async retryEInvoice(id: string): Promise<Invoice> {
    const response = await api.post<Invoice>(`/invoices/${id}/einvoice/retry`);
    return response.data;
  },
  async cancel(id: string, input: { reasonCode: IrnCancelReason; remark: string }): Promise<Invoice> {
    const response = await api.post<Invoice>(`/invoices/${id}/cancel`, input);
    return response.data;
  },
  async settings(): Promise<GstSettings> {
    const response = await api.get<GstSettings>('/invoices/settings');
    return response.data;
  },
  async updateSettings(input: UpdateGstSettingsInput): Promise<GstSettings> {
    // Not pruned: clearing an optional field (trade name, footer) is sent as null on purpose.
    const response = await api.patch<GstSettings>('/invoices/settings', input);
    return response.data;
  },
};
