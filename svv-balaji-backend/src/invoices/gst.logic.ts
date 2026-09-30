/**
 * GST invoice arithmetic and rules. Pure functions (no database, no framework),
 * unit-tested in gst.logic.spec.ts.
 *
 * The invoice never re-prices anything. Every figure on a goods line was frozen
 * onto the order line at placement (price rule, discount share, GST); this file
 * only re-presents it as the law wants it shown - taxable value, CGST+SGST or
 * IGST, HSN - and proves the result still adds up to what the customer paid.
 * Money is integer paise throughout, as in checkout.calculator.ts.
 */

/** GST state codes (first two digits of a GSTIN). 97 = Other Territory. */
export const GST_STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka',
  '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
  '97': 'Other Territory',
};

/** Spellings that turn up in typed addresses, mapped to the canonical name's code. */
const STATE_ALIASES: Record<string, string> = {
  'jammu & kashmir': '01', 'j&k': '01', 'orissa': '21', 'pondicherry': '34', 'uttaranchal': '05',
  'new delhi': '07', 'nct of delhi': '07', 'andaman & nicobar islands': '35', 'daman and diu': '26',
  'dadra and nagar haveli': '26', 'chattisgarh': '22', 'telengana': '36',
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z&]+/g, ' ').trim();

export function stateCodeFromName(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = norm(name);
  if (!n) return null;
  if (STATE_ALIASES[n]) return STATE_ALIASES[n];
  const hit = Object.entries(GST_STATES).find(([, v]) => norm(v) === n);
  return hit ? hit[0] : null;
}

const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/**
 * Shape, a real state code, and the mod-36 check digit. The check digit catches
 * the single mistyped character that would otherwise put a wrong GSTIN on an
 * invoice and cost the buyer their input tax credit.
 */
export function isValidGstin(raw: string | null | undefined): boolean {
  const g = (raw ?? '').trim().toUpperCase();
  if (!GSTIN_SHAPE.test(g) || !GST_STATES[g.slice(0, 2)]) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = GSTIN_CHARS.indexOf(g[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36] === g[14];
}

export const stateCodeFromGstin = (gstin: string) => gstin.trim().slice(0, 2);

/**
 * Indian financial year (April-March) of `date` in IST, as the 4-digit series
 * key: 1 Apr 2026 - 31 Mar 2027 -> "2627".
 */
export function financialYear(date: Date): string {
  const ist = new Date(date.getTime() + 330 * 60_000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${String(start % 100).padStart(2, '0')}${String((start + 1) % 100).padStart(2, '0')}`;
}

/** Up to 4 letters/digits, so PREFIX/YYYY-NNNNNN stays within Rule 46's 16 characters. */
export const INVOICE_PREFIX = /^[A-Z0-9]{1,4}$/;

/** The sequence series an invoice number is drawn from; SequenceService appends "-NNNNNN". */
export const invoiceSeries = (prefix: string, fy: string) => `${prefix}/${fy}`;

// --- Money -------------------------------------------------------------------

export const paise = (rupees: number) => Math.round(rupees * 100);
export const rupees = (p: number) => p / 100;

export interface TaxSplit { cgst: number; sgst: number; igst: number }

/** Split a line's tax (paise). Intra-state halves it; the odd paisa goes to CGST so the parts always sum. */
export function splitTax(taxP: number, interState: boolean): TaxSplit {
  if (interState) return { cgst: 0, sgst: 0, igst: taxP };
  const cgst = Math.ceil(taxP / 2);
  return { cgst, sgst: taxP - cgst, igst: 0 };
}

// --- Building an invoice ------------------------------------------------------

export interface OrderLineInput {
  productId: string;
  description: string;
  sku: string | null;
  hsn: string | null;
  quantity: number;
  unitPrice: number;
  /** All four as frozen on the order line, in rupees. */
  lineSubtotal: number;
  lineDiscount: number;
  lineTax: number;
  gstRatePercent: number;
}

export interface BuildInput {
  lines: OrderLineInput[];
  /** GST-inclusive, as charged at checkout. */
  deliveryFee: number;
  deliveryFeeSac: string;
  deliveryFeeGstRatePercent: number;
  interState: boolean;
  /** What the order actually charged. The invoice must land on this. */
  orderTotal: number;
}

export interface BuiltLine {
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

export interface BuiltInvoice {
  lines: BuiltLine[];
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  taxTotal: number;
  discountTotal: number;
  roundOff: number;
  grandTotal: number;
}

/**
 * Carve GST out of an inclusive amount: taxable = amount x 100 / (100 + rate),
 * tax = the rest, so the two always sum back to exactly what was charged.
 */
export function carveInclusive(amountP: number, ratePercent: number): { taxable: number; tax: number } {
  const taxable = Math.round((amountP * 100) / (100 + ratePercent));
  return { taxable, tax: amountP - taxable };
}

export function buildInvoice(input: BuildInput): BuiltInvoice {
  const lines: BuiltLine[] = input.lines.map((l, i) => {
    const grossP = paise(l.lineSubtotal);
    const discountP = paise(l.lineDiscount);
    const taxableP = grossP - discountP;
    const taxP = paise(l.lineTax);
    const split = splitTax(taxP, input.interState);
    return {
      lineNo: i + 1,
      productId: l.productId,
      description: l.description,
      sku: l.sku,
      hsnSac: l.hsn?.trim() || null,
      isService: false,
      quantity: l.quantity,
      // Order quantities are packs, whatever the product's operational unit.
      uqc: 'PAC',
      unitPrice: l.unitPrice,
      gross: rupees(grossP),
      discount: rupees(discountP),
      taxableValue: rupees(taxableP),
      gstRatePercent: l.gstRatePercent,
      cgstAmount: rupees(split.cgst),
      sgstAmount: rupees(split.sgst),
      igstAmount: rupees(split.igst),
      lineTotal: rupees(taxableP + taxP),
    };
  });

  const feeP = paise(input.deliveryFee);
  if (feeP > 0) {
    const { taxable, tax } = carveInclusive(feeP, input.deliveryFeeGstRatePercent);
    const split = splitTax(tax, input.interState);
    lines.push({
      lineNo: lines.length + 1,
      productId: null,
      description: 'Delivery charges',
      sku: null,
      hsnSac: input.deliveryFeeSac,
      isService: true,
      quantity: 1,
      uqc: 'OTH',
      unitPrice: rupees(taxable),
      gross: rupees(taxable),
      discount: 0,
      taxableValue: rupees(taxable),
      gstRatePercent: input.deliveryFeeGstRatePercent,
      cgstAmount: rupees(split.cgst),
      sgstAmount: rupees(split.sgst),
      igstAmount: rupees(split.igst),
      lineTotal: rupees(feeP),
    });
  }

  const sum = (f: (l: BuiltLine) => number) => lines.reduce((a, l) => a + paise(f(l)), 0);
  const taxableP = sum((l) => l.taxableValue);
  const cgstP = sum((l) => l.cgstAmount);
  const sgstP = sum((l) => l.sgstAmount);
  const igstP = sum((l) => l.igstAmount);
  const computedP = taxableP + cgstP + sgstP + igstP;
  const grandP = paise(input.orderTotal);

  return {
    lines,
    taxableTotal: rupees(taxableP),
    cgstTotal: rupees(cgstP),
    sgstTotal: rupees(sgstP),
    igstTotal: rupees(igstP),
    taxTotal: rupees(cgstP + sgstP + igstP),
    discountTotal: rupees(sum((l) => l.discount)),
    roundOff: rupees(grandP - computedP),
    grandTotal: rupees(grandP),
  };
}

export interface HsnSummaryRow {
  hsnSac: string | null;
  gstRatePercent: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
}

/** Tax by HSN and rate - printed under the lines and needed for GSTR-1 Table 12. */
export function hsnSummary(lines: BuiltLine[]): HsnSummaryRow[] {
  const rows = new Map<string, { hsn: string | null; rate: number; t: number; c: number; s: number; i: number }>();
  for (const l of lines) {
    const key = `${l.hsnSac ?? ''}|${l.gstRatePercent}`;
    const r = rows.get(key) ?? { hsn: l.hsnSac, rate: l.gstRatePercent, t: 0, c: 0, s: 0, i: 0 };
    r.t += paise(l.taxableValue);
    r.c += paise(l.cgstAmount);
    r.s += paise(l.sgstAmount);
    r.i += paise(l.igstAmount);
    rows.set(key, r);
  }
  return [...rows.values()].map((r) => ({
    hsnSac: r.hsn, gstRatePercent: r.rate, taxableValue: rupees(r.t), cgst: rupees(r.c), sgst: rupees(r.s), igst: rupees(r.i),
  }));
}

// --- Parties -----------------------------------------------------------------

export interface PartySnapshot {
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

export interface PlaceOfSupply { code: string; assumed: boolean }

/**
 * Where the goods were delivered decides the tax (IGST Act s.10(1)(a)): the
 * delivery address state first, then the customer record's state, then the
 * buyer's GSTIN. Only when none of those is known is the seller's own state
 * used - and the invoice says so, so staff can correct it rather than trust it.
 */
export function placeOfSupply(
  candidates: Array<string | null | undefined>,
  buyerGstin: string | null,
  sellerStateCode: string,
): PlaceOfSupply {
  for (const c of candidates) {
    const code = stateCodeFromName(c);
    if (code) return { code, assumed: false };
  }
  if (buyerGstin && isValidGstin(buyerGstin)) return { code: stateCodeFromGstin(buyerGstin), assumed: false };
  return { code: sellerStateCode, assumed: true };
}

// --- E-invoice (NIC IRP schema 1.1) ---------------------------------------------

export interface EInvoiceSource {
  invoiceNumber: string;
  invoiceDate: Date;
  seller: PartySnapshot;
  buyer: PartySnapshot;
  placeOfSupply: string;
  lines: BuiltLine[];
  totals: Pick<BuiltInvoice, 'taxableTotal' | 'cgstTotal' | 'sgstTotal' | 'igstTotal' | 'roundOff' | 'grandTotal'>;
}

/** Everything that would make the IRP refuse this invoice, in words staff can act on. Empty = submittable. */
export function eInvoiceProblems(src: EInvoiceSource): string[] {
  const p: string[] = [];
  if (!isValidGstin(src.seller.gstin)) p.push('Seller GSTIN is missing or invalid (GST Settings)');
  if (!isValidGstin(src.buyer.gstin)) p.push('Buyer GSTIN is missing or invalid');
  if (!/^\d{6}$/.test(src.seller.pincode ?? '')) p.push('Seller pincode is missing (GST Settings)');
  if (!/^\d{6}$/.test(src.buyer.pincode ?? '')) p.push("Buyer pincode is missing on the customer's address");
  if (!src.seller.city) p.push('Seller city is missing (GST Settings)');
  for (const l of src.lines) {
    if (!/^\d{4,8}$/.test(l.hsnSac ?? '')) p.push(`"${l.description}" has no valid HSN code (4-8 digits) - add it on the product`);
  }
  return p;
}

const ddmmyyyy = (d: Date) => {
  const ist = new Date(d.getTime() + 330 * 60_000);
  return `${String(ist.getUTCDate()).padStart(2, '0')}/${String(ist.getUTCMonth() + 1).padStart(2, '0')}/${ist.getUTCFullYear()}`;
};

const party = (s: PartySnapshot) => ({
  Gstin: s.gstin,
  LglNm: s.legalName,
  ...(s.tradeName ? { TrdNm: s.tradeName } : {}),
  Addr1: s.addressLine1.slice(0, 100),
  ...(s.addressLine2 ? { Addr2: s.addressLine2.slice(0, 100) } : {}),
  Loc: (s.city ?? '').slice(0, 50),
  Pin: Number(s.pincode),
  Stcd: s.stateCode,
  ...(s.phone ? { Ph: s.phone.replace(/\D/g, '').slice(-12) } : {}),
  ...(s.email ? { Em: s.email } : {}),
});

/**
 * The request body every GSP forwards to the IRP (e-invoice schema v1.1). Built
 * here, once, so a GSP adapter only has to authenticate and post it.
 */
export function buildEInvoicePayload(src: EInvoiceSource) {
  const interState = src.seller.stateCode !== src.placeOfSupply;
  return {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N', IgstOnIntra: 'N' },
    DocDtls: { Typ: 'INV', No: src.invoiceNumber, Dt: ddmmyyyy(src.invoiceDate) },
    SellerDtls: party(src.seller),
    BuyerDtls: { ...party(src.buyer), Pos: src.placeOfSupply },
    ItemList: src.lines.map((l) => ({
      SlNo: String(l.lineNo),
      PrdDesc: l.description.slice(0, 300),
      IsServc: l.isService ? 'Y' : 'N',
      HsnCd: l.hsnSac,
      Qty: l.quantity,
      Unit: l.uqc,
      UnitPrice: l.unitPrice,
      TotAmt: l.gross,
      Discount: l.discount,
      AssAmt: l.taxableValue,
      GstRt: l.gstRatePercent,
      IgstAmt: interState ? l.igstAmount : 0,
      CgstAmt: l.cgstAmount,
      SgstAmt: l.sgstAmount,
      CesRt: 0, CesAmt: 0, CesNonAdvlAmt: 0, StateCesRt: 0, StateCesAmt: 0, StateCesNonAdvlAmt: 0,
      OthChrg: 0,
      TotItemVal: l.lineTotal,
    })),
    ValDtls: {
      AssVal: src.totals.taxableTotal,
      CgstVal: src.totals.cgstTotal,
      SgstVal: src.totals.sgstTotal,
      IgstVal: src.totals.igstTotal,
      CesVal: 0, StCesVal: 0, Discount: 0, OthChrg: 0,
      RndOffAmt: src.totals.roundOff,
      TotInvVal: src.totals.grandTotal,
    },
  };
}

export type EInvoicePayload = ReturnType<typeof buildEInvoicePayload>;
