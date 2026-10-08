import { buildCreditNote, canCancelInsteadOfCredit, creditNoteDeadline, CreditableLine, CreditNoteError } from './credit-note.logic';
import { buildGstr1, G1Invoice, portalDate, returnPeriod } from './gstr1.logic';

/** 3 packs at 5% GST: taxable 100.00, tax 5.01 (deliberately odd paisa). */
const line = (over: Partial<CreditableLine> = {}): CreditableLine => ({
  id: 'L1', lineNo: 1, productId: 'P1', description: 'Atta 5kg', sku: 'ATTA5', hsnSac: '1101', isService: false,
  quantity: 3, uqc: 'PAC', unitPrice: 33.33, taxableValue: 100, gstRatePercent: 5, tax: 5.01,
  creditedQuantity: 0, creditedTaxable: 0, creditedTax: 0,
  ...over,
});

describe('credit-note.logic', () => {
  it('credits returned packs in proportion and splits CGST/SGST intra-state', () => {
    const n = buildCreditNote([line()], [{ invoiceLineId: 'L1', quantity: 1 }], false);
    expect(n.lines[0]).toMatchObject({ quantity: 1, taxableValue: 33.33, cgstAmount: 0.84, sgstAmount: 0.83, igstAmount: 0 });
    expect(n.grandTotal).toBe(35);
  });

  it('the last packs take exactly what is left, so a full return adds up to the invoice line', () => {
    const first = buildCreditNote([line()], [{ invoiceLineId: 'L1', quantity: 1 }], true);
    const after = line({ creditedQuantity: 1, creditedTaxable: first.taxableTotal, creditedTax: first.taxTotal });
    const rest = buildCreditNote([after], [{ invoiceLineId: 'L1', quantity: 2 }], true);
    expect(first.taxableTotal + rest.taxableTotal).toBeCloseTo(100, 2);
    expect(first.taxTotal + rest.taxTotal).toBeCloseTo(5.01, 2);
    expect(rest.lines[0].igstAmount).toBe(rest.taxTotal);
  });

  it('refuses more packs than are left', () => {
    expect(() => buildCreditNote([line({ creditedQuantity: 2, creditedTaxable: 66.67, creditedTax: 3.34 })], [{ invoiceLineId: 'L1', quantity: 2 }], false))
      .toThrow(/only 1 of 3/);
  });

  it('a value-only note carves GST out of the amount and is capped at what is left', () => {
    const n = buildCreditNote([line()], [{ invoiceLineId: 'L1', amount: 10.5 }], false);
    expect(n.lines[0]).toMatchObject({ quantity: 0, taxableValue: 10, lineTotal: 10.5 });
    expect(() => buildCreditNote([line()], [{ invoiceLineId: 'L1', amount: 106 }], false)).toThrow(/at most ₹105.01/);
  });

  it('rejects quantity and amount together, neither, duplicates and unknown lines', () => {
    expect(() => buildCreditNote([line()], [{ invoiceLineId: 'L1', quantity: 1, amount: 40 }], false)).toThrow(CreditNoteError);
    expect(() => buildCreditNote([line()], [{ invoiceLineId: 'L1' }], false)).toThrow(/a quantity, an amount, or both/);
    expect(() => buildCreditNote([line()], [{ invoiceLineId: 'L1', quantity: 1 }, { invoiceLineId: 'L1', quantity: 1 }], false)).toThrow(/twice/);
    expect(() => buildCreditNote([line()], [{ invoiceLineId: 'X', quantity: 1 }], false)).toThrow(/not on this invoice/);
    expect(() => buildCreditNote([line()], [], false)).toThrow(/at least one line/);
  });

  it('packs back with part of their value kept: quantity recorded, only the amount credited', () => {
    const n = buildCreditNote([line()], [{ invoiceLineId: 'L1', quantity: 1, amount: 21 }], false);
    expect(n.lines[0]).toMatchObject({ quantity: 1, taxableValue: 20, lineTotal: 21 });
    expect(n.grandTotal).toBe(21);
  });

  it('deadline is 30 November after the financial year ends (IST)', () => {
    // Invoice on 15 Oct 2026 -> FY 2026-27 -> last day 30 Nov 2027.
    expect(creditNoteDeadline(new Date('2026-10-15T06:00:00Z')).toISOString()).toBe('2027-11-30T18:30:00.000Z');
    // 31 Mar 2027 23:00 IST still FY 2026-27.
    expect(creditNoteDeadline(new Date('2027-03-31T17:30:00Z')).toISOString()).toBe('2027-11-30T18:30:00.000Z');
    // 1 Apr 2027 00:30 IST is FY 2027-28.
    expect(creditNoteDeadline(new Date('2027-03-31T19:00:00Z')).toISOString()).toBe('2028-11-30T18:30:00.000Z');
  });

  it('cancel instead of credit only in the same IST month and inside the IRN window', () => {
    const now = new Date('2026-10-20T06:00:00Z');
    expect(canCancelInsteadOfCredit({ invoiceDate: new Date('2026-10-02T06:00:00Z'), irnAckDate: null, hasIrn: false }, now)).toBe(true);
    expect(canCancelInsteadOfCredit({ invoiceDate: new Date('2026-09-30T06:00:00Z'), irnAckDate: null, hasIrn: false }, now)).toBe(false);
    // 30 Sep 19:00 UTC is 1 Oct 00:30 IST - same month.
    expect(canCancelInsteadOfCredit({ invoiceDate: new Date('2026-09-30T19:00:00Z'), irnAckDate: null, hasIrn: false }, now)).toBe(true);
    expect(canCancelInsteadOfCredit({ invoiceDate: new Date('2026-10-19T06:00:00Z'), irnAckDate: new Date('2026-10-19T05:00:00Z'), hasIrn: true }, now)).toBe(false);
    expect(canCancelInsteadOfCredit({ invoiceDate: new Date('2026-10-20T01:00:00Z'), irnAckDate: new Date('2026-10-20T01:00:00Z'), hasIrn: true }, now)).toBe(true);
  });
});

describe('gstr1.logic', () => {
  const gl = (rt: number, tx: number, inter: boolean, hsn = '1101') => {
    const tax = Math.round(tx * rt) / 100;
    return {
      hsnSac: hsn, description: 'Atta', uqc: 'PAC', quantity: 1, taxableValue: tx, gstRatePercent: rt,
      cgstAmount: inter ? 0 : Math.ceil((tax * 100) / 2) / 100, sgstAmount: inter ? 0 : tax - Math.ceil((tax * 100) / 2) / 100, igstAmount: inter ? tax : 0,
    };
  };
  const inv = (o: Partial<G1Invoice>): G1Invoice => ({
    number: 'INV/2627-000001', date: new Date('2026-10-05T06:00:00Z'), status: 'ISSUED', supplyType: 'B2C', buyerGstin: null,
    placeOfSupply: '27', isInterState: false, grandTotal: 105, lines: [gl(5, 100, false)], ...o,
  });

  it('formats dates and the return period the portal way', () => {
    expect(portalDate(new Date('2026-10-04T19:00:00Z'))).toBe('05-10-2026'); // 00:30 IST
    expect(returnPeriod('2026-10')).toBe('102026');
  });

  it('routes invoices to B2B, B2CL (over ₹1 lakh inter-state) and B2CS', () => {
    const { gstr1, summary } = buildGstr1({
      gstin: '27AAAAA0000A1Z5',
      month: '2026-10',
      invoices: [
        inv({ number: 'INV/2627-000001', supplyType: 'B2B', buyerGstin: '29BBBBB1111B1Z5', placeOfSupply: '29', isInterState: true, lines: [gl(5, 100, true)] }),
        inv({ number: 'INV/2627-000002', placeOfSupply: '29', isInterState: true, grandTotal: 150_000, lines: [gl(5, 142857.14, true)] }),
        inv({ number: 'INV/2627-000003' }),
        inv({ number: 'INV/2627-000004', status: 'CANCELLED' }),
        inv({ number: 'INV/2627-000005', lines: [gl(0, 50, false), gl(5, 100, false)] }),
      ],
      creditNotes: [],
    });
    expect(gstr1.b2b).toHaveLength(1);
    expect(gstr1.b2b[0].ctin).toBe('29BBBBB1111B1Z5');
    expect(gstr1.b2cl).toHaveLength(1);
    // B2CS: two intra-state invoices at 5% in state 27 (the cancelled one is left out).
    expect(gstr1.b2cs).toEqual([{ sply_ty: 'INTRA', pos: '27', typ: 'OE', rt: 5, txval: 200, iamt: 0, camt: 5, samt: 5, csamt: 0 }]);
    expect(gstr1.nil.inv.find((x) => x.sply_ty === 'INTRAB2C')!.nil_amt).toBe(50);
    expect(gstr1.doc_issue.doc_det[0].docs[0]).toMatchObject({ from: 'INV/2627-000001', to: 'INV/2627-000005', totnum: 5, cancel: 1, net_issue: 4 });
    expect(summary.find((s) => s.section === 'b2b')!.documents).toBe(1);
  });

  it('credit notes: B2B to CDNR, B2CL to CDNUR, B2CS netted, HSN net', () => {
    const b2bInv = inv({ number: 'INV/2627-000001', supplyType: 'B2B', buyerGstin: '29BBBBB1111B1Z5', placeOfSupply: '29', isInterState: true, lines: [gl(5, 100, true)] });
    const b2csInv = inv({ number: 'INV/2627-000002' });
    const { gstr1 } = buildGstr1({
      gstin: '27AAAAA0000A1Z5',
      month: '2026-10',
      invoices: [b2bInv, b2csInv],
      creditNotes: [
        { number: 'CN/2627-000001', date: new Date('2026-10-10T06:00:00Z'), status: 'ISSUED', grandTotal: 52.5, lines: [gl(5, 50, true)], invoice: b2bInv },
        { number: 'CN/2627-000002', date: new Date('2026-10-10T06:00:00Z'), status: 'ISSUED', grandTotal: 42, lines: [gl(5, 40, false)], invoice: b2csInv },
      ],
    });
    expect(gstr1.cdnr[0].ctin).toBe('29BBBBB1111B1Z5');
    expect((gstr1.cdnr[0].nt[0] as { nt_num: string }).nt_num).toBe('CN/2627-000001');
    expect(gstr1.cdnur).toHaveLength(0);
    expect(gstr1.b2cs[0].txval).toBe(60);
    expect(gstr1.hsn.hsn_b2b[0]).toMatchObject({ hsn_sc: '1101', txval: 50, qty: 0 });
    expect(gstr1.hsn.hsn_b2c[0]).toMatchObject({ txval: 60 });
    expect(gstr1.doc_issue.doc_det.find((d) => d.doc_num === 5)!.docs[0]).toMatchObject({ totnum: 2, net_issue: 2 });
  });
});
