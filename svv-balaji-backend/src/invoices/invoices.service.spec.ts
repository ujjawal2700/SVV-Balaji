import { BadRequestException } from '@nestjs/common';
import { SequenceService } from '../common/sequence.service';
import { EInvoiceProvider, EInvoiceRejected, MockEInvoiceProvider } from './einvoice-provider';
import { InvoicesService } from './invoices.service';

/**
 * InvoicesService against an in-memory stand-in for the four tables it touches.
 * The arithmetic is proven in gst.logic.spec.ts; this proves the lifecycle:
 * when an invoice is raised, that it is raised once, and how the IRN queue
 * behaves when the GSP says yes, says no, or is not there.
 */

// Made-up GSTINs with correct check digits. No real business is implied.
const SELLER_MH = '27AAACS1234A1Z2';
const BUYER_TS = '36AAACS1234A1Z3';

const COMPLETE = {
  legalName: 'Test Foods Pvt Ltd', gstin: SELLER_MH, addressLine1: '1 Mill Road', city: 'Nagpur', pincode: '440010',
};

function make(opts: { gsp?: EInvoiceProvider; settings?: Record<string, unknown> } = {}) {
  let id = 0;
  const uid = (p: string) => `${p}-${++id}`;
  const db = {
    settings: [] as any[],
    invoices: [] as any[],
    counters: new Map<string, number>(),
    orders: new Map<string, any>(),
    products: new Map<string, any>([['p1', { id: 'p1', name: 'Sharbati Atta 10kg', sku: 'ATTA10', hsnCode: '11010000' }]]),
  };

  const withLines = (inv: any) => inv && { ...inv, lines: [...inv.lines].sort((a: any, b: any) => a.lineNo - b.lineNo) };
  const claimable = (inv: any, where: any) =>
    (!where.id || inv.id === where.id) &&
    (!where.status || inv.status === where.status) &&
    (!where.eInvoiceStatus?.in || where.eInvoiceStatus.in.includes(inv.eInvoiceStatus)) &&
    (!where.eInvoiceNextAttemptAt?.lte || (inv.eInvoiceNextAttemptAt && inv.eInvoiceNextAttemptAt <= where.eInvoiceNextAttemptAt.lte));

  const prisma: any = {
    $queryRaw: async () => [],
    $transaction: async (fn: any) => (typeof fn === 'function' ? fn(prisma) : Promise.all(fn)),
    gstSettings: {
      findFirst: async () => db.settings[0] ?? null,
      create: async () => {
        const s = {
          id: uid('gst'), legalName: null, tradeName: null, gstin: null, addressLine1: null, addressLine2: null,
          city: null, pincode: null, phone: null, email: null, invoicePrefix: 'INV', eInvoiceEnabled: false,
          deliveryFeeSac: '996812', deliveryFeeGstRatePercent: 18, footerNote: null, invoicingStartsAt: null,
          createdAt: new Date(), ...(opts.settings ?? {}),
        };
        db.settings.push(s);
        return s;
      },
      update: async ({ data }: any) => Object.assign(db.settings[0], data),
    },
    sequenceCounter: {
      findUnique: async ({ where }: any) => (db.counters.has(where.key) ? { key: where.key, lastNumber: db.counters.get(where.key) } : null),
      create: async ({ data }: any) => void db.counters.set(data.key, data.lastNumber),
      update: async ({ where }: any) => {
        db.counters.set(where.key, db.counters.get(where.key)! + 1);
        return { key: where.key, lastNumber: db.counters.get(where.key) };
      },
    },
    order: {
      findUnique: async ({ where }: any) => {
        const o = db.orders.get(where.id);
        if (!o) return null;
        return { ...o, items: o.items.map((i: any) => ({ ...i, product: db.products.get(i.productId) })) };
      },
      findMany: async ({ where }: any) =>
        [...db.orders.values()]
          .filter((o) => where.status.in.includes(o.status) && o.dispatchedAt >= where.dispatchedAt.gte)
          .filter((o) => !db.invoices.some((i) => i.orderId === o.id && i.status === 'ISSUED'))
          .map((o) => ({ id: o.id })),
    },
    // Counter sales have their own spec (pos); the sweep only needs to find none here.
    posSale: { findMany: async () => [] },
    product: {
      findMany: async ({ where }: any) => [...db.products.values()].filter((p) => where.id.in.includes(p.id) && p.hsnCode),
    },
    invoice: {
      findFirst: async ({ where }: any) =>
        withLines(db.invoices.find((i) =>
          (!where.orderId || i.orderId === where.orderId) &&
          (!where.status || i.status === where.status) &&
          (!where.customerId || i.customerId === where.customerId) &&
          (!where.order?.orderNumber || db.orders.get(i.orderId)?.orderNumber === where.order.orderNumber),
        ) ?? null),
      findUnique: async ({ where }: any) => withLines(db.invoices.find((i) => i.id === where.id) ?? null),
      findUniqueOrThrow: async ({ where }: any) => withLines(db.invoices.find((i) => i.id === where.id)),
      findMany: async ({ where }: any) => db.invoices.filter((i) => claimable(i, where)).map((i) => ({ id: i.id })),
      create: async ({ data }: any) => {
        const { lines, ...rest } = data;
        const inv = {
          id: uid('inv'), status: 'ISSUED', eInvoiceAttempts: 0, irn: null, ackDate: null, eInvoiceError: null, ...rest,
          lines: lines.create.map((l: any) => ({ id: uid('line'), ...l })),
        };
        db.invoices.push(inv);
        return inv;
      },
      update: async ({ where, data }: any) => Object.assign(db.invoices.find((i) => i.id === where.id), data),
      updateMany: async ({ where, data }: any) => {
        const hits = db.invoices.filter((i) => claimable(i, where));
        for (const i of hits) {
          const { eInvoiceAttempts, ...rest } = data;
          Object.assign(i, rest);
          if (eInvoiceAttempts?.increment) i.eInvoiceAttempts += eInvoiceAttempts.increment;
        }
        return { count: hits.length };
      },
    },
    invoiceLine: {
      updateMany: async ({ where, data }: any) => {
        const inv = db.invoices.find((i) => i.id === where.invoiceId);
        for (const l of inv.lines) if (l.productId === where.productId && l.hsnSac === null) Object.assign(l, data);
        return { count: 1 };
      },
    },
  };

  const gsp = opts.gsp ?? new MockEInvoiceProvider();
  const svc = new InvoicesService(prisma, new SequenceService(), gsp);

  const addOrder = (over: any = {}, customer: any = {}) => {
    const o = {
      id: uid('ord'), orderNumber: `SO-20260929-00${id}`, status: 'DISPATCHED', channel: 'B2B',
      dispatchedAt: new Date(), total: 840, deliveryFee: 0, addressSnapshot: null,
      customer: {
        id: 'cust-1', name: 'Hyderabad Traders', gstin: BUYER_TS, billingAddress: '12 Market St', city: 'Hyderabad',
        state: 'Telangana', pincode: '500001', phone: '9876543210', email: null, ...customer,
      },
      items: [{ productId: 'p1', quantity: 2, unitPrice: 400, lineSubtotal: 800, lineDiscount: 0, lineTax: 40, gstRatePercent: 5, nameSnapshot: null, skuSnapshot: null, createdAt: new Date() }],
      ...over,
    };
    db.orders.set(o.id, o);
    return o;
  };

  const configure = async (extra: any = {}) => svc.updateSettings({ ...COMPLETE, ...extra }, 'admin');
  return { svc, db, addOrder, configure };
}

/** Let the not-awaited IRN submission that issuing kicks off run to completion. */
const flush = () => new Promise((r) => setImmediate(r));

describe('InvoicesService settings', () => {
  it('refuses an invalid GSTIN and reports what is still missing', async () => {
    const { svc } = make();
    await expect(svc.updateSettings({ gstin: '27AAACS1234A1Z9' }, 'admin')).rejects.toThrow(BadRequestException);
    const view = await svc.settingsView();
    expect(view.ready).toBe(false);
    expect(view.missing).toEqual(expect.arrayContaining(['Legal name', 'A valid GSTIN', 'Pincode']));
  });

  it('starts automatic invoicing the first time the details are complete, and never moves that date', async () => {
    const { svc, configure, db } = make();
    await svc.updateSettings({ legalName: 'Test Foods Pvt Ltd' }, 'admin');
    expect(db.settings[0].invoicingStartsAt).toBeNull();
    const view = await configure();
    expect(view.ready).toBe(true);
    expect(view.stateCode).toBe('27');
    const started = db.settings[0].invoicingStartsAt;
    expect(started).toBeInstanceOf(Date);
    await svc.updateSettings({ footerNote: 'Thank you' }, 'admin');
    expect(db.settings[0].invoicingStartsAt).toBe(started);
  });
});

describe('InvoicesService issuing', () => {
  it('refuses to issue before GST settings are complete', async () => {
    const { svc, addOrder } = make();
    await expect(svc.issueForOrder(addOrder().id, 'u1')).rejects.toThrow(/Complete GST Settings/);
  });

  it('issues a B2B inter-state invoice with IGST, numbered in the financial-year series', async () => {
    const { svc, addOrder, configure } = make();
    await configure();
    const inv: any = await svc.issueForOrder(addOrder().id, 'u1');
    expect(inv.invoiceNumber).toMatch(/^INV\/\d{4}-000001$/);
    expect(inv).toMatchObject({ supplyType: 'B2B', placeOfSupply: '36', isInterState: true, igstTotal: 40, cgstTotal: 0, grandTotal: 840, eInvoiceStatus: 'NOT_APPLICABLE' });
    expect(inv.buyer).toMatchObject({ gstin: BUYER_TS, stateCode: '36', legalName: 'Hyderabad Traders' });
    expect(inv.seller).toMatchObject({ gstin: SELLER_MH, stateCode: '27' });
    expect(inv.lines[0]).toMatchObject({ hsnSac: '11010000', description: 'Sharbati Atta 10kg' });
  });

  it('issues a B2C invoice to the delivery address, intra-state, with the delivery fee as a service line', async () => {
    const { svc, addOrder, configure } = make();
    await configure();
    const order = addOrder(
      {
        channel: 'B2C', total: 899, deliveryFee: 59,
        addressSnapshot: { fullName: 'Asha Rao', phone: '9000000000', line1: '4 Civil Lines', line2: null, city: 'Nagpur', state: 'Maharashtra', pincode: '440001' },
      },
      { name: 'Asha', gstin: null, state: null },
    );
    const inv: any = await svc.issueForOrder(order.id, null);
    expect(inv).toMatchObject({ supplyType: 'B2C', placeOfSupply: '27', isInterState: false, igstTotal: 0, grandTotal: 899, roundOff: 0 });
    expect(inv.buyer).toMatchObject({ legalName: 'Asha Rao', gstin: null, city: 'Nagpur' });
    expect(inv.lines).toHaveLength(2);
    expect(inv.lines[1]).toMatchObject({ description: 'Delivery charges', isService: true, lineTotal: 59 });
  });

  it('is idempotent: a second issue returns the same invoice and uses no new number', async () => {
    const { svc, addOrder, configure, db } = make();
    await configure();
    const order = addOrder();
    const a: any = await svc.issueForOrder(order.id, 'u1');
    const b: any = await svc.issueForOrder(order.id, 'u1');
    expect(b.id).toBe(a.id);
    expect(db.invoices).toHaveLength(1);
    const next: any = await svc.issueForOrder(addOrder().id, 'u1');
    expect(next.invoiceNumber.endsWith('-000002')).toBe(true);
  });

  it('refuses an order whose goods have not been supplied', async () => {
    const { svc, addOrder, configure } = make();
    await configure();
    await expect(svc.issueForOrder(addOrder({ status: 'PACKED' }).id, 'u1')).rejects.toThrow(/raised when goods are dispatched/);
  });

  it('marks the place of supply as assumed when no state is known anywhere', async () => {
    const { svc, addOrder, configure } = make();
    await configure();
    const inv: any = await svc.issueForOrder(addOrder({}, { gstin: null, state: null }).id, null);
    expect(inv).toMatchObject({ placeOfSupply: '27', placeOfSupplyAssumed: true, isInterState: false });
  });
});

describe('InvoicesService at dispatch and in the sweep', () => {
  it('onDispatched does nothing and never throws while settings are incomplete', async () => {
    const { svc, addOrder, db } = make();
    await expect(svc.onDispatched(addOrder().id, 'u1')).resolves.toBeUndefined();
    expect(db.invoices).toHaveLength(0);
  });

  it('onDispatched swallows a failure so dispatch is never undone', async () => {
    const { svc, configure } = make();
    await configure();
    await expect(svc.onDispatched('no-such-order', 'u1')).resolves.toBeUndefined();
  });

  it('the sweep invoices orders the hook missed, but never ones dispatched before invoicing started', async () => {
    const { svc, addOrder, configure, db } = make();
    const old = addOrder({ dispatchedAt: new Date('2026-01-01') });
    await configure();
    const missed = addOrder({ dispatchedAt: new Date(Date.now() + 1000) });
    const r = await svc.sweep();
    expect(r.issued).toBe(1);
    expect(db.invoices.map((i) => i.orderId)).toEqual([missed.id]);
    expect(db.invoices.some((i) => i.orderId === old.id)).toBe(false);
  });
});

describe('InvoicesService e-invoicing', () => {
  it('queues a B2B invoice and gets an IRN from the GSP, off the request path', async () => {
    const { svc, addOrder, configure, db } = make();
    await configure({ eInvoiceEnabled: true });
    const inv: any = await svc.issueForOrder(addOrder().id, 'u1');
    expect(inv.eInvoiceStatus).toBe('PENDING');
    await flush();
    const stored = db.invoices[0];
    expect(stored).toMatchObject({ eInvoiceStatus: 'GENERATED', eInvoiceProvider: 'mock', eInvoiceError: null });
    expect(stored.irn).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.signedQrCode).toBeTruthy();
  });

  it('never e-invoices a B2C invoice', async () => {
    const { svc, addOrder, configure } = make();
    await configure({ eInvoiceEnabled: true });
    const inv: any = await svc.issueForOrder(addOrder({ channel: 'B2C' }, { gstin: null }).id, null);
    expect(inv.eInvoiceStatus).toBe('NOT_APPLICABLE');
  });

  it('holds an invoice with no HSN for a person, then submits once the product has one', async () => {
    const { svc, addOrder, configure, db } = make();
    db.products.get('p1').hsnCode = null;
    await configure({ eInvoiceEnabled: true });
    await svc.issueForOrder(addOrder().id, 'u1');
    await flush();
    expect(db.invoices[0]).toMatchObject({ eInvoiceStatus: 'FAILED', eInvoiceNextAttemptAt: null });
    expect(db.invoices[0].eInvoiceError).toMatch(/no valid HSN/);

    // The sweep leaves it alone - retrying unchanged data would fail the same way.
    expect((await svc.sweep()).submitted).toBe(0);

    db.products.get('p1').hsnCode = '11010000';
    const after: any = await svc.retryIrn(db.invoices[0].id);
    expect(after.eInvoiceStatus).toBe('GENERATED');
    expect(after.lines[0].hsnSac).toBe('11010000');
  });

  it('backs off and retries when the GSP is unreachable', async () => {
    let fail = true;
    const mock = new MockEInvoiceProvider();
    const flaky: EInvoiceProvider = {
      provider: 'mock',
      generateIrn: async (p) => {
        if (fail) throw new Error('ETIMEDOUT');
        return mock.generateIrn(p);
      },
      cancelIrn: async () => undefined,
    };
    const { svc, addOrder, configure, db } = make({ gsp: flaky });
    await configure({ eInvoiceEnabled: true });
    await svc.issueForOrder(addOrder().id, 'u1');
    await flush();
    const inv = db.invoices[0];
    expect(inv).toMatchObject({ eInvoiceStatus: 'FAILED', eInvoiceError: 'ETIMEDOUT', eInvoiceAttempts: 1 });
    expect(inv.eInvoiceNextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    fail = false;
    inv.eInvoiceNextAttemptAt = new Date(Date.now() - 1);
    expect((await svc.sweep()).submitted).toBe(1);
    expect(inv.eInvoiceStatus).toBe('GENERATED');
  });

  it('does not auto-retry an outright rejection', async () => {
    const rejecting: EInvoiceProvider = {
      provider: 'mock',
      generateIrn: async () => { throw new EInvoiceRejected('2150: Duplicate IRN'); },
      cancelIrn: async () => undefined,
    };
    const { svc, addOrder, configure, db } = make({ gsp: rejecting });
    await configure({ eInvoiceEnabled: true });
    await svc.issueForOrder(addOrder().id, 'u1');
    await flush();
    expect(db.invoices[0]).toMatchObject({ eInvoiceStatus: 'FAILED', eInvoiceNextAttemptAt: null });
  });
});

describe('InvoicesService cancelling', () => {
  it('cancels, and the order can then be invoiced again under a new number', async () => {
    const { svc, addOrder, configure } = make();
    await configure();
    const order = addOrder();
    const first: any = await svc.issueForOrder(order.id, 'u1');
    const cancelled: any = await svc.cancel(first.id, { reasonCode: '2', remark: 'Wrong buyer address' }, 'admin');
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancelReason: 'Wrong buyer address' });
    const again: any = await svc.issueForOrder(order.id, 'u1');
    expect(again.id).not.toBe(first.id);
    expect(again.invoiceNumber).not.toBe(first.invoiceNumber);
  });

  it('refuses to cancel an IRN older than 24 hours - that needs a credit note', async () => {
    const { svc, addOrder, configure, db } = make();
    await configure({ eInvoiceEnabled: true });
    await svc.issueForOrder(addOrder().id, 'u1');
    await flush();
    db.invoices[0].ackDate = new Date(Date.now() - 25 * 3600_000);
    await expect(svc.cancel(db.invoices[0].id, { reasonCode: '4', remark: 'Late' }, 'admin')).rejects.toThrow(/credit note/);
  });

  it('cancels a fresh IRN with the GSP', async () => {
    const { svc, addOrder, configure, db } = make();
    await configure({ eInvoiceEnabled: true });
    await svc.issueForOrder(addOrder().id, 'u1');
    await flush();
    const res: any = await svc.cancel(db.invoices[0].id, { reasonCode: '2', remark: 'Data entry mistake' }, 'admin');
    expect(res).toMatchObject({ status: 'CANCELLED', eInvoiceStatus: 'CANCELLED' });
  });
});

describe('InvoicesService storefront', () => {
  it("returns a customer's own invoice without staff-only fields, and nobody else's", async () => {
    const { svc, addOrder, configure } = make();
    await configure();
    const order = addOrder();
    await svc.issueForOrder(order.id, 'u1');
    const mine: any = await svc.forStorefront('cust-1', order.orderNumber);
    expect(mine.invoiceNumber).toBeDefined();
    expect(mine.issuedById).toBeUndefined();
    expect(mine.eInvoiceError).toBeUndefined();
    await expect(svc.forStorefront('someone-else', order.orderNumber)).rejects.toThrow(/No invoice/);
  });
});
