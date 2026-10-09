import {
  BuildInput,
  buildEInvoicePayload,
  buildInvoice,
  carveInclusive,
  eInvoiceProblems,
  financialYear,
  hsnSummary,
  invoiceSeries,
  isValidGstin,
  PartySnapshot,
  placeOfSupply,
  splitTax,
  stateCodeFromName,
} from './gst.logic';

// Made-up GSTINs with correct check digits. No real business is implied.
const SELLER_MH = '27AAACS1234A1Z2';
const BUYER_TS = '36AAACS1234A1Z3';

const line = (over: Partial<BuildInput['lines'][number]> = {}): BuildInput['lines'][number] => ({
  productId: 'p1', description: 'Sharbati Atta 10kg', sku: 'ATTA10', hsn: '11010000',
  quantity: 2, unitPrice: 400, lineSubtotal: 800, lineDiscount: 0, lineTax: 40, gstRatePercent: 5, ...over,
});

const input = (over: Partial<BuildInput> = {}): BuildInput => ({
  lines: [line()], deliveryFee: 0, deliveryFeeSac: '996812', deliveryFeeGstRatePercent: 18,
  interState: false, orderTotal: 840, ...over,
});

describe('GSTIN validation', () => {
  it('accepts a GSTIN with a correct check digit and rejects one character off', () => {
    expect(isValidGstin('27AAPFU0939F1ZV')).toBe(true);
    expect(isValidGstin('27aapfu0939f1zv')).toBe(true);
    expect(isValidGstin('27AAPFU0939F1ZW')).toBe(false);
  });

  it('rejects a bad shape or a state code that does not exist', () => {
    expect(isValidGstin('')).toBe(false);
    expect(isValidGstin(null)).toBe(false);
    expect(isValidGstin('27AAPFU0939F1Z')).toBe(false);
    expect(isValidGstin('99AAPFU0939F1ZV')).toBe(false);
  });
});

describe('state and financial year', () => {
  it('maps typed state names, including common old spellings', () => {
    expect(stateCodeFromName('Maharashtra')).toBe('27');
    expect(stateCodeFromName('  telangana ')).toBe('36');
    expect(stateCodeFromName('Orissa')).toBe('21');
    expect(stateCodeFromName('New Delhi')).toBe('07');
    expect(stateCodeFromName('Delhi (NCT)')).toBe('07');
    expect(stateCodeFromName('Chandigarh (UT)')).toBe('04');
    expect(stateCodeFromName('Atlantis')).toBeNull();
    expect(stateCodeFromName(null)).toBeNull();
  });

  it('runs April to March in IST', () => {
    expect(financialYear(new Date('2026-09-29T10:00:00+05:30'))).toBe('2627');
    expect(financialYear(new Date('2027-03-31T23:59:00+05:30'))).toBe('2627');
    // 1 April 00:30 IST is still 31 March in UTC - the IST date must win.
    expect(financialYear(new Date('2027-04-01T00:30:00+05:30'))).toBe('2728');
  });

  it('keeps the longest invoice number within the 16 characters Rule 46 allows', () => {
    expect(`${invoiceSeries('ABCD', '2627')}-999999`.length).toBeLessThanOrEqual(16);
  });
});

describe('tax split', () => {
  it('halves intra-state tax, giving the odd paisa to CGST so it always sums', () => {
    expect(splitTax(4001, false)).toEqual({ cgst: 2001, sgst: 2000, igst: 0 });
    expect(splitTax(4000, false)).toEqual({ cgst: 2000, sgst: 2000, igst: 0 });
  });

  it('puts inter-state tax entirely in IGST', () => {
    expect(splitTax(4001, true)).toEqual({ cgst: 0, sgst: 0, igst: 4001 });
  });

  it('carves tax out of an inclusive amount without changing it', () => {
    const { taxable, tax } = carveInclusive(5900, 18);
    expect(taxable).toBe(5000);
    expect(taxable + tax).toBe(5900);
    const odd = carveInclusive(4999, 18);
    expect(odd.taxable + odd.tax).toBe(4999);
  });
});

describe('placeOfSupply', () => {
  it('uses the delivery state first', () => {
    expect(placeOfSupply(['Telangana', 'Maharashtra'], null, '27')).toEqual({ code: '36', assumed: false });
  });

  it('falls back to the customer state, then the buyer GSTIN', () => {
    expect(placeOfSupply([null, 'Telangana'], null, '27')).toEqual({ code: '36', assumed: false });
    expect(placeOfSupply([null, 'nowhere'], BUYER_TS, '27')).toEqual({ code: '36', assumed: false });
  });

  it('only assumes the seller state when nothing else is known, and says so', () => {
    expect(placeOfSupply([null, undefined], null, '27')).toEqual({ code: '27', assumed: true });
  });
});

describe('buildInvoice', () => {
  it('re-presents the order line without re-pricing it and lands on the order total', () => {
    const inv = buildInvoice(input());
    expect(inv.lines).toHaveLength(1);
    expect(inv.lines[0]).toMatchObject({ taxableValue: 800, cgstAmount: 20, sgstAmount: 20, igstAmount: 0, lineTotal: 840, uqc: 'PAC' });
    expect(inv).toMatchObject({ taxableTotal: 800, taxTotal: 40, roundOff: 0, grandTotal: 840 });
  });

  it('charges tax on the value after the line discount, as frozen at checkout', () => {
    const inv = buildInvoice(input({ lines: [line({ lineDiscount: 100, lineTax: 35 })], orderTotal: 735 }));
    expect(inv.lines[0]).toMatchObject({ gross: 800, discount: 100, taxableValue: 700, lineTotal: 735 });
    expect(inv.discountTotal).toBe(100);
    expect(inv.roundOff).toBe(0);
  });

  it('uses IGST for an inter-state supply', () => {
    const inv = buildInvoice(input({ interState: true }));
    expect(inv).toMatchObject({ cgstTotal: 0, sgstTotal: 0, igstTotal: 40 });
  });

  it('shows the inclusive delivery fee as a service line whose total is unchanged', () => {
    const inv = buildInvoice(input({ deliveryFee: 59, orderTotal: 899 }));
    const fee = inv.lines[1];
    expect(fee).toMatchObject({ description: 'Delivery charges', hsnSac: '996812', isService: true, taxableValue: 50, lineTotal: 59 });
    expect(fee.cgstAmount + fee.sgstAmount).toBeCloseTo(9, 2);
    expect(inv.grandTotal).toBe(899);
    expect(inv.roundOff).toBe(0);
  });

  it('reports any gap to the order total as round-off instead of hiding it', () => {
    const inv = buildInvoice(input({ orderTotal: 840.01 }));
    expect(inv.roundOff).toBe(0.01);
    expect(inv.grandTotal).toBe(840.01);
  });

  it('adds up across many lines to the paisa', () => {
    const lines = Array.from({ length: 7 }, (_, i) =>
      line({ productId: `p${i}`, lineSubtotal: 33.33, lineDiscount: 1.11, lineTax: 1.61, gstRatePercent: 5 }),
    );
    const inv = buildInvoice(input({ lines, orderTotal: 7 * (33.33 - 1.11 + 1.61) }));
    expect(inv.taxableTotal).toBeCloseTo(7 * 32.22, 2);
    expect(inv.cgstTotal + inv.sgstTotal).toBeCloseTo(7 * 1.61, 2);
    expect(Math.abs(inv.roundOff)).toBeLessThan(0.01);
  });

  it('summarises tax by HSN and rate', () => {
    const inv = buildInvoice(input({
      lines: [line(), line({ productId: 'p2', lineSubtotal: 200, lineTax: 10 }), line({ productId: 'p3', hsn: '19041090', lineSubtotal: 100, lineTax: 12, gstRatePercent: 12 })],
      deliveryFee: 0, orderTotal: 1162,
    }));
    const rows = hsnSummary(inv.lines);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.hsnSac === '11010000')).toMatchObject({ taxableValue: 1000, cgst: 25, sgst: 25 });
  });
});

describe('e-invoice payload', () => {
  const party = (gstin: string | null, over: Partial<PartySnapshot> = {}): PartySnapshot => ({
    legalName: 'Test Traders', tradeName: null, gstin, addressLine1: '1 Market Road', addressLine2: null,
    city: 'Nagpur', pincode: '440010', stateCode: gstin?.slice(0, 2) ?? null, stateName: null, phone: '+91 98765 43210', email: null, ...over,
  });
  const src = (over = {}) => {
    const inv = buildInvoice(input({ interState: true }));
    return {
      invoiceNumber: 'INV/2627-000001',
      invoiceDate: new Date('2026-09-29T10:00:00+05:30'),
      seller: party(SELLER_MH),
      buyer: party(BUYER_TS, { city: 'Hyderabad', pincode: '500001' }),
      placeOfSupply: '36',
      lines: inv.lines,
      totals: inv,
      ...over,
    };
  };

  it('builds the NIC schema 1.1 body the GSP forwards', () => {
    const p = buildEInvoicePayload(src());
    expect(p.Version).toBe('1.1');
    expect(p.TranDtls.SupTyp).toBe('B2B');
    expect(p.DocDtls).toEqual({ Typ: 'INV', No: 'INV/2627-000001', Dt: '29/09/2026' });
    expect(p.SellerDtls).toMatchObject({ Gstin: SELLER_MH, Pin: 440010, Stcd: '27', Ph: '919876543210' });
    expect(p.BuyerDtls).toMatchObject({ Gstin: BUYER_TS, Pos: '36', Stcd: '36' });
    expect(p.ItemList[0]).toMatchObject({ SlNo: '1', HsnCd: '11010000', IsServc: 'N', AssAmt: 800, GstRt: 5, IgstAmt: 40, TotItemVal: 840 });
    expect(p.ValDtls).toMatchObject({ AssVal: 800, IgstVal: 40, TotInvVal: 840 });
  });

  it('lists what the IRP would refuse, in words staff can act on', () => {
    const inv = buildInvoice(input({ lines: [line({ hsn: null })] }));
    const problems = eInvoiceProblems(src({ buyer: party(null), lines: inv.lines }));
    expect(problems).toEqual(expect.arrayContaining([
      'Buyer GSTIN is missing or invalid',
      expect.stringMatching(/Sharbati Atta 10kg" has no valid HSN/),
    ]));
    expect(eInvoiceProblems(src())).toEqual([]);
  });
});
