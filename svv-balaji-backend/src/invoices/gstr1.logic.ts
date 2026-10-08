/**
 * GSTR-1 for one month, built from issued invoices and credit notes. Pure - no
 * Prisma. The shape follows the GST portal's GSTR-1 JSON (the one the offline
 * tool imports), section by section:
 *
 *   b2b    4A   invoices to registered buyers, per invoice, items by rate
 *   b2cl   5    inter-state B2C invoices above B2CL_LIMIT, per invoice
 *   b2cs   7    every other B2C supply, by supply type + place of supply + rate,
 *               NET of credit notes against those invoices
 *   cdnr   9B   credit notes to registered buyers
 *   cdnur  9B   credit notes against B2CL invoices
 *   nil    8    nil-rated (0%) supplies, which stay out of the tables above
 *   hsn    12   HSN summary, split B2B / B2C, net of credit notes
 *   doc_issue 13 invoice and credit note series issued, with cancellations
 *
 * The output is what the system knows. It is prepared for review in the
 * offline tool, never filed blind: an invoice raised outside this system is not
 * in it.
 */
import { paise, rupees } from './gst.logic';

/** Inter-state B2C invoices above this go in B2CL (Notification 12/2024, from 1 Aug 2024). */
export const B2CL_LIMIT = 100_000;

export interface G1Line {
  hsnSac: string | null;
  description: string;
  uqc: string;
  quantity: number;
  taxableValue: number;
  gstRatePercent: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
}

export interface G1Invoice {
  number: string;
  date: Date;
  status: 'ISSUED' | 'CANCELLED';
  supplyType: 'B2B' | 'B2C';
  buyerGstin: string | null;
  placeOfSupply: string;
  isInterState: boolean;
  grandTotal: number;
  lines: G1Line[];
}

export interface G1CreditNote {
  number: string;
  date: Date;
  status: 'ISSUED' | 'CANCELLED';
  grandTotal: number;
  lines: G1Line[];
  /** The invoice the note reduces - decides which table the note lands in. */
  invoice: Pick<G1Invoice, 'number' | 'date' | 'supplyType' | 'buyerGstin' | 'placeOfSupply' | 'isInterState' | 'grandTotal'>;
}

/** dd-mm-yyyy in IST, the portal's date format. */
export function portalDate(d: Date): string {
  const s = new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
  const [y, m, day] = s.split('-');
  return `${day}-${m}-${y}`;
}

/** "2026-10" -> "102026". */
export function returnPeriod(month: string): string {
  const [y, m] = month.split('-');
  return `${m}${y}`;
}

const r2 = (p: number) => rupees(p);

type Itm = { rt: number; txval: number; iamt: number; camt: number; samt: number; csamt: number };

/** Items of one document collapsed by rate, nil-rated lines left out. */
function itemsByRate(lines: G1Line[]): Array<{ num: number; itm_det: Itm }> {
  const by = new Map<number, { tx: number; i: number; c: number; s: number }>();
  for (const l of lines) {
    if (!l.gstRatePercent) continue;
    const a = by.get(l.gstRatePercent) ?? { tx: 0, i: 0, c: 0, s: 0 };
    a.tx += paise(l.taxableValue);
    a.i += paise(l.igstAmount);
    a.c += paise(l.cgstAmount);
    a.s += paise(l.sgstAmount);
    by.set(l.gstRatePercent, a);
  }
  return [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rt, a], i) => ({ num: i + 1, itm_det: { rt, txval: r2(a.tx), iamt: r2(a.i), camt: r2(a.c), samt: r2(a.s), csamt: 0 } }));
}

const isB2cl = (inv: Pick<G1Invoice, 'supplyType' | 'isInterState' | 'grandTotal'>) =>
  inv.supplyType === 'B2C' && inv.isInterState && inv.grandTotal > B2CL_LIMIT;

/** "INV/2627-000123" -> series "INV/2627", sequence 123. */
function seriesOf(n: string): { series: string; seq: number } | null {
  const m = /^(.*)-(\d+)$/.exec(n);
  return m ? { series: m[1], seq: Number(m[2]) } : null;
}

function docSeries(docs: Array<{ number: string; status: string }>) {
  const by = new Map<string, Array<{ number: string; seq: number; status: string }>>();
  for (const d of docs) {
    const s = seriesOf(d.number);
    const key = s?.series ?? d.number;
    by.set(key, [...(by.get(key) ?? []), { number: d.number, seq: s?.seq ?? 0, status: d.status }]);
  }
  return [...by.values()].map((list, i) => {
    list.sort((a, b) => a.seq - b.seq);
    const cancel = list.filter((d) => d.status === 'CANCELLED').length;
    return { num: i + 1, from: list[0].number, to: list[list.length - 1].number, totnum: list.length, cancel, net_issue: list.length - cancel };
  });
}

export function buildGstr1(input: { gstin: string; month: string; invoices: G1Invoice[]; creditNotes: G1CreditNote[] }) {
  const issued = input.invoices.filter((i) => i.status === 'ISSUED');
  const notes = input.creditNotes.filter((n) => n.status === 'ISSUED');

  // --- 4A B2B
  const b2bMap = new Map<string, unknown[]>();
  for (const inv of issued.filter((i) => i.supplyType === 'B2B')) {
    const itms = itemsByRate(inv.lines);
    if (!itms.length) continue; // wholly nil-rated: table 8 only
    const ctin = inv.buyerGstin!;
    b2bMap.set(ctin, [
      ...(b2bMap.get(ctin) ?? []),
      { inum: inv.number, idt: portalDate(inv.date), val: inv.grandTotal, pos: inv.placeOfSupply, rchrg: 'N', inv_typ: 'R', itms },
    ]);
  }
  const b2b = [...b2bMap.entries()].map(([ctin, inv]) => ({ ctin, inv }));

  // --- 5 B2CL
  const b2clMap = new Map<string, unknown[]>();
  for (const inv of issued.filter(isB2cl)) {
    const itms = itemsByRate(inv.lines);
    if (!itms.length) continue;
    b2clMap.set(inv.placeOfSupply, [...(b2clMap.get(inv.placeOfSupply) ?? []), { inum: inv.number, idt: portalDate(inv.date), val: inv.grandTotal, itms }]);
  }
  const b2cl = [...b2clMap.entries()].map(([pos, inv]) => ({ pos, inv }));

  // --- 7 B2CS, net of credit notes on B2CS invoices
  const b2csMap = new Map<string, { sply_ty: 'INTRA' | 'INTER'; pos: string; rt: number; tx: number; i: number; c: number; s: number }>();
  const addB2cs = (interState: boolean, pos: string, l: G1Line, sign: 1 | -1) => {
    if (!l.gstRatePercent) return;
    const sply_ty = interState ? 'INTER' : 'INTRA';
    const key = `${sply_ty}|${pos}|${l.gstRatePercent}`;
    const a = b2csMap.get(key) ?? { sply_ty, pos, rt: l.gstRatePercent, tx: 0, i: 0, c: 0, s: 0 };
    a.tx += sign * paise(l.taxableValue);
    a.i += sign * paise(l.igstAmount);
    a.c += sign * paise(l.cgstAmount);
    a.s += sign * paise(l.sgstAmount);
    b2csMap.set(key, a);
  };
  for (const inv of issued.filter((i) => i.supplyType === 'B2C' && !isB2cl(i))) {
    for (const l of inv.lines) addB2cs(inv.isInterState, inv.placeOfSupply, l, 1);
  }
  for (const n of notes.filter((x) => x.invoice.supplyType === 'B2C' && !isB2cl(x.invoice))) {
    for (const l of n.lines) addB2cs(n.invoice.isInterState, n.invoice.placeOfSupply, l, -1);
  }
  const b2cs = [...b2csMap.values()]
    .filter((a) => a.tx !== 0 || a.i !== 0 || a.c !== 0 || a.s !== 0)
    .sort((a, b) => a.pos.localeCompare(b.pos) || a.rt - b.rt)
    .map((a) => ({ sply_ty: a.sply_ty, pos: a.pos, typ: 'OE', rt: a.rt, txval: r2(a.tx), iamt: r2(a.i), camt: r2(a.c), samt: r2(a.s), csamt: 0 }));

  // --- 9B CDNR / CDNUR
  const cdnrMap = new Map<string, unknown[]>();
  const cdnur: unknown[] = [];
  for (const n of notes) {
    const itms = itemsByRate(n.lines);
    if (!itms.length) continue;
    if (n.invoice.supplyType === 'B2B') {
      const ctin = n.invoice.buyerGstin!;
      cdnrMap.set(ctin, [
        ...(cdnrMap.get(ctin) ?? []),
        { ntty: 'C', nt_num: n.number, nt_dt: portalDate(n.date), val: n.grandTotal, pos: n.invoice.placeOfSupply, rchrg: 'N', inv_typ: 'R', itms },
      ]);
    } else if (isB2cl(n.invoice)) {
      cdnur.push({ typ: 'B2CL', ntty: 'C', nt_num: n.number, nt_dt: portalDate(n.date), val: n.grandTotal, pos: n.invoice.placeOfSupply, itms });
    }
  }
  const cdnr = [...cdnrMap.entries()].map(([ctin, nt]) => ({ ctin, nt }));

  // --- 8 Nil rated (net of notes)
  const nilKey = (supplyType: string, inter: boolean) => `${inter ? 'INTR' : 'INTRA'}${supplyType === 'B2B' ? 'B2B' : 'B2C'}`;
  const nil = new Map<string, number>([['INTRB2B', 0], ['INTRAB2B', 0], ['INTRB2C', 0], ['INTRAB2C', 0]]);
  for (const inv of issued) for (const l of inv.lines) if (!l.gstRatePercent) nil.set(nilKey(inv.supplyType, inv.isInterState), nil.get(nilKey(inv.supplyType, inv.isInterState))! + paise(l.taxableValue));
  for (const n of notes) for (const l of n.lines) if (!l.gstRatePercent) nil.set(nilKey(n.invoice.supplyType, n.invoice.isInterState), nil.get(nilKey(n.invoice.supplyType, n.invoice.isInterState))! - paise(l.taxableValue));

  // --- 12 HSN, split B2B / B2C, net of notes
  type H = { hsn: string; desc: string; uqc: string; rt: number; qty: number; val: number; tx: number; i: number; c: number; s: number };
  const hsnMaps = { B2B: new Map<string, H>(), B2C: new Map<string, H>() };
  const addHsn = (supplyType: 'B2B' | 'B2C', l: G1Line, sign: 1 | -1) => {
    const hsn = l.hsnSac?.trim() || 'NA';
    const key = `${hsn}|${l.gstRatePercent}|${l.uqc}`;
    const m = hsnMaps[supplyType];
    const a = m.get(key) ?? { hsn, desc: l.description.slice(0, 30), uqc: l.uqc, rt: l.gstRatePercent, qty: 0, val: 0, tx: 0, i: 0, c: 0, s: 0 };
    a.qty += sign * l.quantity;
    a.tx += sign * paise(l.taxableValue);
    a.i += sign * paise(l.igstAmount);
    a.c += sign * paise(l.cgstAmount);
    a.s += sign * paise(l.sgstAmount);
    a.val += sign * (paise(l.taxableValue) + paise(l.igstAmount) + paise(l.cgstAmount) + paise(l.sgstAmount));
    m.set(key, a);
  };
  for (const inv of issued) for (const l of inv.lines) addHsn(inv.supplyType, l, 1);
  for (const n of notes) for (const l of n.lines) addHsn(n.invoice.supplyType, l, -1);
  const hsnRows = (m: Map<string, H>) =>
    [...m.values()]
      .filter((a) => a.tx !== 0 || a.qty !== 0)
      .sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rt - b.rt)
      .map((a, idx) => ({
        num: idx + 1, hsn_sc: a.hsn, desc: a.desc, uqc: a.uqc, qty: Math.round(a.qty * 1000) / 1000, rt: a.rt,
        txval: r2(a.tx), iamt: r2(a.i), camt: r2(a.c), samt: r2(a.s), csamt: 0,
      }));

  // --- 13 Documents issued (cancelled ones count too - that is the point of the table)
  const doc_issue = {
    doc_det: [
      { doc_num: 1, doc_typ: 'Invoices for outward supply', docs: docSeries(input.invoices) },
      { doc_num: 5, doc_typ: 'Credit Note', docs: docSeries(input.creditNotes) },
    ].filter((d) => d.docs.length),
  };

  const gstr1 = {
    gstin: input.gstin,
    fp: returnPeriod(input.month),
    b2b,
    b2cl,
    b2cs,
    cdnr,
    cdnur,
    nil: { inv: [...nil.entries()].map(([sply_ty, p]) => ({ sply_ty, expt_amt: 0, nil_amt: r2(p), ngsup_amt: 0 })) },
    hsn: { hsn_b2b: hsnRows(hsnMaps.B2B), hsn_b2c: hsnRows(hsnMaps.B2C) },
    doc_issue,
  };

  // --- What the screen shows: one row per table.
  type ItmHolder = { itms: Array<{ itm_det: Itm }> };
  const sumItms = (docs: ItmHolder[]) => {
    let tx = 0, tax = 0;
    for (const d of docs) for (const it of d.itms) { tx += paise(it.itm_det.txval); tax += paise(it.itm_det.iamt) + paise(it.itm_det.camt) + paise(it.itm_det.samt); }
    return { taxable: r2(tx), tax: r2(tax) };
  };
  const b2bDocs = b2b.flatMap((x) => x.inv as ItmHolder[]);
  const b2clDocs = b2cl.flatMap((x) => x.inv as ItmHolder[]);
  const cdnrDocs = cdnr.flatMap((x) => x.nt as ItmHolder[]);
  const b2csTx = b2cs.reduce((a, x) => a + paise(x.txval), 0);
  const b2csTax = b2cs.reduce((a, x) => a + paise(x.iamt) + paise(x.camt) + paise(x.samt), 0);
  const summary = [
    { table: '4A', section: 'b2b', label: 'B2B invoices', documents: b2bDocs.length, ...sumItms(b2bDocs) },
    { table: '5', section: 'b2cl', label: `B2C large (inter-state, over ₹${B2CL_LIMIT.toLocaleString('en-IN')})`, documents: b2clDocs.length, ...sumItms(b2clDocs) },
    { table: '7', section: 'b2cs', label: 'B2C others (net of credit notes)', documents: b2cs.length, taxable: r2(b2csTx), tax: r2(b2csTax) },
    { table: '9B', section: 'cdnr', label: 'Credit notes - registered', documents: cdnrDocs.length, ...sumItms(cdnrDocs) },
    { table: '9B', section: 'cdnur', label: 'Credit notes - unregistered (B2CL)', documents: cdnur.length, ...sumItms(cdnur as ItmHolder[]) },
    { table: '8', section: 'nil', label: 'Nil rated', documents: 0, taxable: r2([...nil.values()].reduce((a, b) => a + b, 0)), tax: 0 },
  ];

  return { gstr1, summary };
}
