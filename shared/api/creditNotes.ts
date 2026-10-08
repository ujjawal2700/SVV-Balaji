import { api } from './client';
import { pruneEmpty, unwrapList, type Paginated } from './envelope';
import type { EInvoiceStatus, HsnSummaryRow, Invoice, InvoiceLine, InvoiceParty, InvoiceStatus, InvoiceSupplyType } from './invoices';

/**
 * GST credit notes (backend `src/invoices/credit-notes.*`) and the GSTR-1
 * preparation endpoint. Like invoices, every figure comes from the server.
 */

export type CreditNoteReason =
  | 'SALES_RETURN'
  | 'POST_SALE_DISCOUNT'
  | 'DEFICIENCY_IN_SERVICES'
  | 'CORRECTION_IN_INVOICE'
  | 'CHANGE_IN_POS'
  | 'FINALIZATION_OF_PROVISIONAL_ASSESSMENT'
  | 'OTHERS';

export const CREDIT_NOTE_REASON_LABEL: Record<CreditNoteReason, string> = {
  SALES_RETURN: 'Sales return',
  POST_SALE_DISCOUNT: 'Discount after sale',
  DEFICIENCY_IN_SERVICES: 'Deficiency in services',
  CORRECTION_IN_INVOICE: 'Correction in invoice',
  CHANGE_IN_POS: 'Change in place of supply',
  FINALIZATION_OF_PROVISIONAL_ASSESSMENT: 'Finalisation of provisional assessment',
  OTHERS: 'Other',
};

export interface CreditNote {
  id: string;
  noteNumber: string;
  noteDate: string;
  financialYear: string;
  status: InvoiceStatus;
  supplyType: InvoiceSupplyType;
  channel: 'B2B' | 'B2C';
  reason: CreditNoteReason;
  reasonLabel: string;
  remark: string | null;
  seller: InvoiceParty & { footerNote?: string | null };
  buyer: InvoiceParty;
  placeOfSupply: string;
  placeOfSupplyName: string | null;
  isInterState: boolean;
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  taxTotal: number;
  grandTotal: number;
  lines: Array<InvoiceLine & { invoiceLineId: string }>;
  hsnSummary: HsnSummaryRow[];
  eInvoiceStatus: EInvoiceStatus;
  eInvoiceError: string | null;
  irn: string | null;
  ackNo: string | null;
  ackDate: string | null;
  signedQrImage: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  invoice: { id: string; invoiceNumber: string; invoiceDate: string; grandTotal: number; irn: string | null; order: { id: string; orderNumber: string } | null; posSale: { id: string; saleNumber: string } | null };
  returnRequest: { id: string; requestNumber: string } | null;
  issuedBy: { id: string; fullName: string } | null;
  cancelledBy: { id: string; fullName: string } | null;
}

export interface CreditNoteRow {
  id: string;
  noteNumber: string;
  noteDate: string;
  status: InvoiceStatus;
  supplyType: InvoiceSupplyType;
  channel: 'B2B' | 'B2C';
  reason: CreditNoteReason;
  reasonLabel: string;
  remark: string | null;
  taxableTotal: number;
  taxTotal: number;
  grandTotal: number;
  eInvoiceStatus: EInvoiceStatus;
  eInvoiceError: string | null;
  buyer: InvoiceParty;
  invoice: { id: string; invoiceNumber: string; order: { id: string; orderNumber: string } | null; posSale: { id: string; saleNumber: string } | null };
  returnRequest: { id: string; requestNumber: string } | null;
  customer: { id: string; name: string } | null;
}

export interface InvoiceCreditNoteRow {
  id: string;
  noteNumber: string;
  noteDate: string;
  status: InvoiceStatus;
  reason: CreditNoteReason;
  reasonLabel: string;
  grandTotal: number;
  eInvoiceStatus: EInvoiceStatus;
}

export interface CreditableLine {
  invoiceLineId: string;
  lineNo: number;
  description: string;
  sku: string | null;
  isService: boolean;
  quantity: number;
  unitPrice: number;
  gstRatePercent: number;
  lineTotal: number;
  creditedQuantity: number;
  creditedAmount: number;
  remainingQuantity: number;
  remainingAmount: number;
}

export interface Creditable {
  invoiceId: string;
  /** False once the invoice is cancelled or past the s.34(2) deadline. */
  open: boolean;
  deadline: string;
  lines: CreditableLine[];
}

export interface IssueCreditNoteInput {
  reason: CreditNoteReason;
  remark: string;
  lines: Array<{ invoiceLineId: string; quantity?: number; amount?: number }>;
}

export interface CreditNoteQuery {
  status?: InvoiceStatus;
  supplyType?: InvoiceSupplyType;
  reason?: CreditNoteReason;
  from?: string;
  to?: string;
  search?: string;
  branchId?: string;
  page?: number;
  limit?: number;
}

export interface Gstr1Report {
  month: string;
  gstin: string;
  generatedAt: string;
  counts: { invoices: number; cancelledInvoices: number; creditNotes: number; cancelledCreditNotes: number };
  summary: Array<{ table: string; section: string; label: string; documents: number; taxable: number; tax: number }>;
  hsn: {
    hsn_b2b: Array<{ num: number; hsn_sc: string; desc: string; uqc: string; qty: number; rt: number; txval: number; iamt: number; camt: number; samt: number }>;
    hsn_b2c: Array<{ num: number; hsn_sc: string; desc: string; uqc: string; qty: number; rt: number; txval: number; iamt: number; camt: number; samt: number }>;
  };
  docIssue: { doc_det: Array<{ doc_num: number; doc_typ: string; docs: Array<{ num: number; from: string; to: string; totnum: number; cancel: number; net_issue: number }> }> };
  warnings: string[];
  gstr1: Record<string, unknown>;
}

/** A credit note shaped like an invoice, so the same print layout serves both. */
export function creditNoteAsInvoice(n: CreditNote): Invoice {
  return {
    id: n.id, invoiceNumber: n.noteNumber, invoiceDate: n.noteDate, financialYear: n.financialYear, status: n.status,
    supplyType: n.supplyType, channel: n.channel, seller: n.seller, buyer: n.buyer, placeOfSupply: n.placeOfSupply,
    placeOfSupplyName: n.placeOfSupplyName, placeOfSupplyAssumed: false, isInterState: n.isInterState,
    taxableTotal: n.taxableTotal, cgstTotal: n.cgstTotal, sgstTotal: n.sgstTotal, igstTotal: n.igstTotal, taxTotal: n.taxTotal,
    discountTotal: 0, roundOff: 0, grandTotal: n.grandTotal, lines: n.lines, hsnSummary: n.hsnSummary,
    eInvoiceStatus: n.eInvoiceStatus, irn: n.irn, ackNo: n.ackNo, ackDate: n.ackDate, signedQrCode: null, signedQrImage: n.signedQrImage,
    cancelledAt: n.cancelledAt, cancelReason: n.cancelReason, order: null, posSale: null,
  };
}

export const creditNotesApi = {
  async list(query: CreditNoteQuery = {}): Promise<Paginated<CreditNoteRow>> {
    const response = await api.get('/credit-notes', { params: pruneEmpty(query) });
    return unwrapList<CreditNoteRow>(response.data, { page: query.page ?? 1, limit: query.limit ?? 20 });
  },
  async get(id: string): Promise<CreditNote> {
    return (await api.get<CreditNote>(`/credit-notes/${id}`)).data;
  },
  async forInvoice(invoiceId: string): Promise<InvoiceCreditNoteRow[]> {
    return (await api.get<InvoiceCreditNoteRow[]>(`/invoices/${invoiceId}/credit-notes`)).data;
  },
  async creditable(invoiceId: string): Promise<Creditable> {
    return (await api.get<Creditable>(`/invoices/${invoiceId}/creditable`)).data;
  },
  async issue(invoiceId: string, input: IssueCreditNoteInput): Promise<CreditNote> {
    return (await api.post<CreditNote>(`/invoices/${invoiceId}/credit-notes`, input)).data;
  },
  async cancel(id: string, remark: string): Promise<CreditNote> {
    return (await api.post<CreditNote>(`/credit-notes/${id}/cancel`, { remark })).data;
  },
  async retryEInvoice(id: string): Promise<CreditNote> {
    return (await api.post<CreditNote>(`/credit-notes/${id}/einvoice/retry`)).data;
  },
  async gstr1(month: string): Promise<Gstr1Report> {
    return (await api.get<Gstr1Report>('/gst-returns/gstr1', { params: { month } })).data;
  },
  async gstr1Download(month: string): Promise<Blob> {
    return (await api.get('/gst-returns/gstr1/download', { params: { month }, responseType: 'blob' })).data as Blob;
  },
};
