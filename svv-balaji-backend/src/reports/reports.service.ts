import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AffiliateCommissionStatus,
  CustomerAccountStatus,
  OrderStatus,
  PosSaleStatus,
  Prisma,
  SalesChannel,
  SupportTicketStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { istDate, istRange } from '../pos/pos.logic';
import { ProductsService } from '../products/products.module';
import { ReceivablesService } from '../receivables/receivables.service';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { scopedBranchId } from '../common/branch-scope';
import {
  buildCohorts,
  changePercent,
  csv,
  granularityFor,
  median,
  paise,
  periodOf,
  periodsBetween,
  previousRange,
  ratio,
  reorderCycle,
  rupees,
} from './reports.logic';

export interface ReportFilters {
  from?: string;
  to?: string;
  channel?: SalesChannel;
  branchId?: string;
}

/** An order counts as a sale once placed and until cancelled. */
const SOLD: Prisma.EnumOrderStatusFilter = { notIn: [OrderStatus.DRAFT, OrderStatus.CANCELLED] };

/** Where a sale came from. Storefront vs staff-raised matters to the client; POS is its own till. */
const SOURCE_LABEL: Record<string, string> = {
  B2C_STOREFRONT: 'B2C - storefront',
  B2C_STAFF: 'B2C - staff order',
  B2B_STOREFRONT: 'B2B - retailer storefront',
  B2B_STAFF: 'B2B - staff / sales executive',
  POS: 'Company store counter (POS)',
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receivables: ReceivablesService,
    private readonly products: ProductsService,
  ) {}

  /** Validated IST range; defaults to the last 30 days. */
  range(from?: string, to?: string) {
    for (const [name, v] of [['from', from], ['to', to]] as const) {
      // The regex alone lets "2026-13-01" through; a real date must round-trip.
      if (v && (!DATE_RE.test(v) || Number.isNaN(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v)) {
        throw new BadRequestException(`${name} must be a real date as YYYY-MM-DD`);
      }
    }
    const today = istDate(new Date());
    // Missing `to` means today; missing `from` means the 30 days ending at `to`.
    const end = to ?? today;
    const start = from ?? istDate(new Date(Date.parse(`${end}T00:00:00.000Z`) - 29 * 24 * 3600_000 - 330 * 60_000));
    try {
      return istRange(start, end);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  // ===================================================================== sales

  async sales(user: JwtPayload, f: ReportFilters) {
    const r = this.range(f.from, f.to);
    const branchId = scopedBranchId(user, f.branchId);
    const g = granularityFor(r.from, r.to);
    const prev = previousRange(r.from, r.to);
    const pr = this.range(prev.from, prev.to);
    const includePos = f.channel !== SalesChannel.B2B; // POS counter sales are consumer sales

    const orderWhere = (start: Date, end: Date): Prisma.OrderWhereInput => ({
      orderDate: { gte: start, lt: end },
      ...(f.channel ? { channel: f.channel } : {}),
      ...(branchId ? { branchId } : {}),
    });
    const posWhere = (start: Date, end: Date): Prisma.PosSaleWhereInput => ({
      createdAt: { gte: start, lt: end },
      ...(branchId ? { outlet: { branchId } } : {}),
    });

    const [orders, prevOrders, posSalesOrNull, prevPosOrNull, returnRequests, prevReturnCount] = await Promise.all([
      this.prisma.order.findMany({
        where: orderWhere(r.start, r.end),
        select: {
          id: true, channel: true, source: true, status: true, orderDate: true, total: true, taxTotal: true, customerId: true,
          customer: { select: { state: true, city: true } },
          items: { select: { productId: true, quantity: true, lineTotal: true, nameSnapshot: true, skuSnapshot: true } },
        },
      }),
      this.prisma.order.findMany({
        where: { ...orderWhere(pr.start, pr.end), status: SOLD },
        select: { total: true, customerId: true, items: { select: { quantity: true } } },
      }),
      includePos
        ? this.prisma.posSale.findMany({
            where: posWhere(r.start, r.end),
            select: {
              id: true, status: true, total: true, taxTotal: true, createdAt: true,
              outlet: { select: { state: true, city: true } },
              lines: { select: { productId: true, quantity: true, lineTotal: true, nameSnapshot: true, skuSnapshot: true } },
            },
          })
        : Promise.resolve(null),
      includePos
        ? this.prisma.posSale.findMany({ where: { ...posWhere(pr.start, pr.end), status: PosSaleStatus.COMPLETED }, select: { total: true } })
        : Promise.resolve(null),
      this.prisma.returnRequest.count({
        where: { createdAt: { gte: r.start, lt: r.end }, ...(f.channel ? { channel: f.channel } : {}), ...(branchId ? { order: { branchId } } : {}) },
      }),
      this.prisma.returnRequest.count({
        where: { createdAt: { gte: pr.start, lt: pr.end }, ...(f.channel ? { channel: f.channel } : {}), ...(branchId ? { order: { branchId } } : {}) },
      }),
    ]);

    const posSales = posSalesOrNull ?? [];
    const prevPos = prevPosOrNull ?? [];
    const sold = orders.filter((o) => o.status !== OrderStatus.DRAFT && o.status !== OrderStatus.CANCELLED);
    const cancelled = orders.filter((o) => o.status === OrderStatus.CANCELLED).length;
    const posDone = posSales.filter((s) => s.status === PosSaleStatus.COMPLETED);

    // --- customers: new vs returning, judged against all of their history
    const customerIds = [...new Set(sold.map((o) => o.customerId))];
    const firstOrders = customerIds.length
      ? await this.prisma.order.groupBy({
          by: ['customerId'],
          where: { customerId: { in: customerIds }, status: SOLD },
          _min: { orderDate: true },
        })
      : [];
    const newCustomers = firstOrders.filter((c) => c._min.orderDate && c._min.orderDate >= r.start).length;

    // --- KPIs
    const orderRevenueP = sold.reduce((s, o) => s + paise(o.total), 0);
    const orderTaxP = sold.reduce((s, o) => s + paise(o.taxTotal), 0);
    const posRevenueP = posDone.reduce((s, x) => s + paise(x.total), 0);
    const posTaxP = posDone.reduce((s, x) => s + paise(x.taxTotal), 0);
    const units =
      sold.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0) +
      posDone.reduce((s, x) => s + x.lines.reduce((a, l) => a + l.quantity, 0), 0);
    const revenueP = orderRevenueP + posRevenueP;
    const transactions = sold.length + posDone.length;

    const prevRevenueP = prevOrders.reduce((s, o) => s + paise(o.total), 0) + prevPos.reduce((s, x) => s + paise(x.total), 0);
    const prevTransactions = prevOrders.length + prevPos.length;
    const prevCustomers = new Set(prevOrders.map((o) => o.customerId)).size;
    const prevUnits = prevOrders.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0);

    const kpis = {
      revenue: rupees(revenueP),
      /** Revenue without GST - what the business keeps. */
      netOfTax: rupees(revenueP - orderTaxP - posTaxP),
      orders: sold.length,
      posSales: posDone.length,
      units,
      avgOrderValue: transactions ? rupees(revenueP / transactions) : 0,
      customers: customerIds.length,
      newCustomers,
      returningCustomers: customerIds.length - newCustomers,
      repeatRate: ratio(customerIds.length - newCustomers, customerIds.length),
      cancelledOrders: cancelled,
      cancellationRate: ratio(cancelled, orders.length),
      returnRequests: returnRequests,
      returnRate: ratio(returnRequests, sold.length),
    };
    const changes = {
      revenue: changePercent(revenueP, prevRevenueP),
      orders: changePercent(transactions, prevTransactions),
      avgOrderValue: changePercent(transactions ? revenueP / transactions : 0, prevTransactions ? prevRevenueP / prevTransactions : 0),
      customers: changePercent(customerIds.length, prevCustomers),
      units: changePercent(units, prevUnits),
      returnRequests: changePercent(returnRequests, prevReturnCount),
    };

    // --- trend
    const labels = periodsBetween(r.from, r.to, g);
    const trend = new Map(labels.map((p) => [p, { period: p, b2b: 0, b2c: 0, pos: 0, orders: 0 }]));
    for (const o of sold) {
      const row = trend.get(periodOf(o.orderDate, g));
      if (!row) continue;
      row[o.channel === SalesChannel.B2B ? 'b2b' : 'b2c'] += paise(o.total);
      row.orders += 1;
    }
    for (const s of posDone) {
      const row = trend.get(periodOf(s.createdAt, g));
      if (!row) continue;
      row.pos += paise(s.total);
      row.orders += 1;
    }

    // --- by source
    const bySource = new Map<string, { key: string; label: string; orders: number; revenue: number }>();
    const bump = (key: string, p: number) => {
      const row = bySource.get(key) ?? { key, label: SOURCE_LABEL[key], orders: 0, revenue: 0 };
      row.orders += 1;
      row.revenue += p;
      bySource.set(key, row);
    };
    for (const o of sold) bump(`${o.channel}_${o.source}`, paise(o.total));
    for (const s of posDone) bump('POS', paise(s.total));

    // --- products and categories
    const byProduct = new Map<string, { productId: string; name: string; sku: string | null; units: number; revenue: number; orders: number }>();
    const addLine = (l: { productId: string; quantity: number; lineTotal: Prisma.Decimal; nameSnapshot: string | null; skuSnapshot: string | null }) => {
      const row = byProduct.get(l.productId) ?? { productId: l.productId, name: l.nameSnapshot ?? '', sku: l.skuSnapshot, units: 0, revenue: 0, orders: 0 };
      row.units += l.quantity;
      row.revenue += paise(l.lineTotal);
      row.orders += 1;
      byProduct.set(l.productId, row);
    };
    sold.forEach((o) => o.items.forEach(addLine));
    posDone.forEach((s) => s.lines.forEach(addLine));
    const productIds = [...byProduct.keys()];
    const products = productIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, sku: true, category: { select: { id: true, name: true, parent: { select: { id: true, name: true } } } } },
        })
      : [];
    const productInfo = new Map(products.map((p) => [p.id, p]));
    const byCategory = new Map<string, { categoryId: string | null; name: string; units: number; revenue: number }>();
    for (const row of byProduct.values()) {
      const p = productInfo.get(row.productId);
      if (p) { row.name = row.name || p.name; row.sku = row.sku ?? p.sku; }
      // Roll sub-categories up into their main category - that is how the catalogue is managed.
      const cat = p?.category?.parent ?? p?.category ?? null;
      const key = cat?.id ?? 'none';
      const c = byCategory.get(key) ?? { categoryId: cat?.id ?? null, name: cat?.name ?? 'Uncategorised', units: 0, revenue: 0 };
      c.units += row.units;
      c.revenue += row.revenue;
      byCategory.set(key, c);
    }

    // --- regions (customer billing state; POS by outlet)
    const byRegion = new Map<string, { state: string; orders: number; revenue: number; customers: Set<string> }>();
    const addRegion = (state: string | null | undefined, p: number, customer?: string) => {
      const key = (state ?? '').trim() || 'Not recorded';
      const row = byRegion.get(key) ?? { state: key, orders: 0, revenue: 0, customers: new Set<string>() };
      row.orders += 1;
      row.revenue += p;
      if (customer) row.customers.add(customer);
      byRegion.set(key, row);
    };
    sold.forEach((o) => addRegion(o.customer.state, paise(o.total), o.customerId));
    posDone.forEach((s) => addRegion(s.outlet.state, paise(s.total)));

    // --- order status mix for everything placed in the range
    const statusMix: Record<string, number> = {};
    for (const o of orders) statusMix[o.status] = (statusMix[o.status] ?? 0) + 1;

    const [reorder, cohorts] = await Promise.all([
      f.channel === SalesChannel.B2C ? Promise.resolve(null) : this.reorderCycles(branchId, r.end),
      this.cohorts(f.channel, branchId, r.end),
    ]);

    return {
      range: { from: r.from, to: r.to },
      previousRange: prev,
      granularity: g,
      channel: f.channel ?? null,
      kpis,
      changes,
      trend: [...trend.values()].map((t) => ({ ...t, b2b: rupees(t.b2b), b2c: rupees(t.b2c), pos: rupees(t.pos), total: rupees(t.b2b + t.b2c + t.pos) })),
      bySource: [...bySource.values()].map((s) => ({ ...s, revenue: rupees(s.revenue), share: ratio(s.revenue, revenueP) })).sort((a, b) => b.revenue - a.revenue),
      topProducts: [...byProduct.values()]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 15)
        .map((p) => ({ ...p, revenue: rupees(p.revenue), share: ratio(p.revenue, revenueP) })),
      byCategory: [...byCategory.values()]
        .sort((a, b) => b.revenue - a.revenue)
        .map((c) => ({ ...c, revenue: rupees(c.revenue), share: ratio(c.revenue, revenueP) })),
      byRegion: [...byRegion.values()]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 15)
        .map((x) => ({ state: x.state, orders: x.orders, customers: x.customers.size, revenue: rupees(x.revenue), share: ratio(x.revenue, revenueP) })),
      statusMix,
      reorder,
      cohorts,
      margin: {
        available: false,
        reason:
          'Gross margin needs a cost per product. Production batches carry no cost today - see FRD34 reporting gaps note, ' +
          'question 1 (production cost), which is with the client.',
      },
    };
  }

  /** B2B reorder rhythm per retailer, from all their orders up to the end of the range. */
  private async reorderCycles(branchId: string | undefined, asOfEnd: Date) {
    const orders = await this.prisma.order.findMany({
      where: { channel: SalesChannel.B2B, status: SOLD, orderDate: { lt: asOfEnd }, ...(branchId ? { branchId } : {}) },
      select: { customerId: true, orderDate: true, total: true, customer: { select: { name: true, customerCode: true, phone: true, city: true } } },
    });
    const byCustomer = new Map<string, typeof orders>();
    for (const o of orders) byCustomer.set(o.customerId, [...(byCustomer.get(o.customerId) ?? []), o]);
    const asOf = new Date(Math.min(Date.now(), asOfEnd.getTime() - 1));
    const rows = [...byCustomer.entries()].map(([id, list]) => {
      const cycle = reorderCycle(id, list.map((o) => o.orderDate), asOf)!;
      const c = list[0].customer;
      return {
        ...cycle,
        name: c.name,
        customerCode: c.customerCode,
        phone: c.phone,
        city: c.city,
        lifetimeValue: rupees(list.reduce((s, o) => s + paise(o.total), 0)),
      };
    });
    const order = { OVERDUE: 0, DUE: 1, ON_TRACK: 2, ONE_ORDER: 3 } as const;
    rows.sort((a, b) => order[a.state] - order[b.state] || b.daysSinceLast - a.daysSinceLast);
    const gaps = rows.map((x) => x.avgGapDays).filter((x): x is number => x !== null);
    return {
      medianGapDays: median(gaps),
      counts: {
        overdue: rows.filter((x) => x.state === 'OVERDUE').length,
        due: rows.filter((x) => x.state === 'DUE').length,
        onTrack: rows.filter((x) => x.state === 'ON_TRACK').length,
        oneOrder: rows.filter((x) => x.state === 'ONE_ORDER').length,
      },
      customers: rows.slice(0, 50),
    };
  }

  private async cohorts(channel: SalesChannel | undefined, branchId: string | undefined, asOfEnd: Date) {
    const orders = await this.prisma.order.findMany({
      where: { status: SOLD, orderDate: { lt: asOfEnd }, ...(channel ? { channel } : {}), ...(branchId ? { branchId } : {}) },
      select: { customerId: true, orderDate: true },
    });
    return buildCohorts(orders, new Date(asOfEnd.getTime() - 1));
  }

  async salesCsv(user: JwtPayload, f: ReportFilters) {
    const r = this.range(f.from, f.to);
    const branchId = scopedBranchId(user, f.branchId);
    const rows = await this.prisma.order.findMany({
      where: { orderDate: { gte: r.start, lt: r.end }, ...(f.channel ? { channel: f.channel } : {}), ...(branchId ? { branchId } : {}) },
      orderBy: { orderDate: 'asc' },
      take: 20_000,
      select: {
        orderNumber: true, orderDate: true, channel: true, source: true, status: true, paymentStatus: true, paymentMode: true,
        subtotal: true, discountTotal: true, deliveryFee: true, taxTotal: true, total: true, amountPaid: true,
        customer: { select: { customerCode: true, name: true, city: true, state: true } },
        branch: { select: { name: true } },
        _count: { select: { items: true } },
      },
    });
    return csv([
      ['Order', 'Date (IST)', 'Channel', 'Source', 'Status', 'Customer code', 'Customer', 'City', 'State', 'Branch', 'Items',
        'Subtotal', 'Discount', 'Delivery fee', 'GST', 'Total', 'Paid', 'Payment status', 'Payment mode'],
      ...rows.map((o) => [
        o.orderNumber, istDate(o.orderDate), o.channel, o.source, o.status, o.customer.customerCode, o.customer.name,
        o.customer.city, o.customer.state, o.branch?.name, o._count.items, o.subtotal, o.discountTotal, o.deliveryFee,
        o.taxTotal, o.total, o.amountPaid, o.paymentStatus, o.paymentMode,
      ]),
    ]);
  }

  // =================================================================== finance

  async finance(user: JwtPayload, f: ReportFilters) {
    const r = this.range(f.from, f.to);
    const branchId = scopedBranchId(user, f.branchId);
    const g = granularityFor(r.from, r.to);
    const inRange = { gte: r.start, lt: r.end };
    const orderBranch: Prisma.OrderWhereInput = branchId ? { branchId } : {};

    const [
      orders, posSales, onlinePayments, cod, creditReceipts, refunds, posRefunds, walletPaid, invoices, invoiceLines,
      affiliatePayable, riderEarnings, receivables, creditNotes, undeliveredRefunds,
    ] = await Promise.all([
      this.prisma.order.findMany({
        where: { orderDate: inRange, status: SOLD, ...orderBranch },
        select: { channel: true, orderDate: true, total: true, taxTotal: true, amountPaid: true, paymentStatus: true, discountTotal: true, deliveryFee: true,
          loyaltyRedeemedInr: true, referralRedeemedInr: true, refundWalletPaidInr: true },
      }),
      this.prisma.posSale.findMany({
        where: { createdAt: inRange, ...(branchId ? { outlet: { branchId } } : {}) },
        select: { status: true, total: true, taxTotal: true, paymentMode: true, createdAt: true },
      }),
      this.prisma.paymentTransaction.findMany({
        where: { status: 'PAID', createdAt: inRange, ...(branchId ? { order: { branchId } } : {}) },
        select: { id: true, amount: true, provider: true, gatewayPaymentId: true, createdAt: true,
          order: { select: { orderNumber: true, customer: { select: { name: true } } } } },
      }),
      this.prisma.codCollection.findMany({
        where: { collectedAt: inRange, ...(branchId ? { task: { order: { branchId } } } : {}) },
        select: { id: true, collectedAmount: true, method: true, reference: true, collectedAt: true,
          rider: { select: { fullName: true } }, task: { select: { order: { select: { orderNumber: true, customer: { select: { name: true } } } } } } },
      }),
      this.prisma.creditReceipt.findMany({
        where: { voidedAt: null, receivedOn: { gte: new Date(`${r.from}T00:00:00.000Z`), lte: new Date(`${r.to}T00:00:00.000Z`) },
          ...(branchId ? { customer: { branchId } } : {}) },
        select: { id: true, receiptNumber: true, amount: true, method: true, reference: true, receivedOn: true, createdAt: true,
          customer: { select: { name: true } } },
      }),
      this.prisma.returnRequest.findMany({
        where: { refundedAt: inRange, refundAmount: { gt: 0 }, ...(branchId ? { order: { branchId } } : {}) },
        select: { refundAmount: true, refundMethod: true, channel: true },
      }),
      this.prisma.posSale.findMany({
        where: { status: PosSaleStatus.REFUNDED, refundedAt: inRange, ...(branchId ? { outlet: { branchId } } : {}) },
        select: { total: true },
      }),
      this.prisma.refundWalletTransaction.aggregate({
        where: { reason: 'ORDER_PAYMENT', createdAt: inRange, ...(branchId ? { order: { branchId } } : {}) },
        _sum: { amount: true },
      }),
      this.prisma.invoice.findMany({
        where: {
          invoiceDate: inRange,
          ...(branchId ? { OR: [{ order: { branchId } }, { posSale: { outlet: { branchId } } }] } : {}),
        },
        select: { status: true, supplyType: true, taxableTotal: true, cgstTotal: true, sgstTotal: true, igstTotal: true, taxTotal: true,
          grandTotal: true, eInvoiceStatus: true },
      }),
      this.prisma.invoiceLine.groupBy({
        by: ['gstRatePercent'],
        where: {
          invoice: {
            status: 'ISSUED',
            invoiceDate: inRange,
            ...(branchId ? { OR: [{ order: { branchId } }, { posSale: { outlet: { branchId } } }] } : {}),
          },
        },
        _sum: { taxableValue: true, cgstAmount: true, sgstAmount: true, igstAmount: true },
      }),
      this.prisma.affiliateCommission.aggregate({
        where: { status: AffiliateCommissionStatus.APPROVED, ...(branchId ? { order: { branchId } } : {}) },
        _sum: { commissionAmount: true, refundedAmount: true },
        _count: { _all: true },
      }),
      this.prisma.riderEarning.aggregate({ where: { earnedAt: inRange }, _sum: { amount: true } }),
      this.receivables.list(user, { branchId }),
      this.prisma.creditNote.aggregate({
        where: {
          status: 'ISSUED',
          noteDate: inRange,
          ...(branchId ? { invoice: { OR: [{ order: { branchId } }, { posSale: { outlet: { branchId } } }] } } : {}),
        },
        _sum: { taxableTotal: true, cgstTotal: true, sgstTotal: true, igstTotal: true, taxTotal: true, grandTotal: true },
        _count: { _all: true },
      }),
      // Prepaid orders closed as undelivered: the money went back to the customer's Refund Wallet.
      this.prisma.refundWalletTransaction.findMany({
        where: { reason: 'UNDELIVERED_REFUND', createdAt: inRange, ...(branchId ? { order: { branchId } } : {}) },
        select: { amount: true, order: { select: { channel: true } } },
      }),
    ]);

    // --- per channel (accrual: what was billed in the range, and how much of it is paid)
    type Ch = { key: string; label: string; orders: number; billed: number; tax: number; collected: number; outstanding: number;
      discounts: number; coinsRedeemed: number; refunds: number };
    const blank = (key: string, label: string): Ch => ({ key, label, orders: 0, billed: 0, tax: 0, collected: 0, outstanding: 0,
      discounts: 0, coinsRedeemed: 0, refunds: 0 });
    const ch: Record<string, Ch> = {
      B2C: blank('B2C', 'B2C consumers (storefront & staff)'),
      B2B: blank('B2B', 'B2B retailers & distributors'),
      POS: blank('POS', 'Company store counters (POS)'),
    };
    for (const o of orders) {
      const c = ch[o.channel];
      // amountPaid only tracks B2B credit receipts; an online-paid or COD-collected
      // order is marked PAID without it.
      const paidP = o.paymentStatus === 'PAID' || o.paymentStatus === 'REFUNDED' ? paise(o.total) : Math.min(paise(o.amountPaid), paise(o.total));
      c.orders += 1;
      c.billed += paise(o.total);
      c.tax += paise(o.taxTotal);
      c.collected += paidP;
      c.outstanding += Math.max(0, paise(o.total) - paidP);
      c.discounts += paise(o.discountTotal);
      c.coinsRedeemed += paise(o.loyaltyRedeemedInr) + paise(o.referralRedeemedInr);
    }
    for (const s of posSales) {
      ch.POS.orders += 1;
      ch.POS.billed += paise(s.total);
      ch.POS.tax += paise(s.taxTotal);
      ch.POS.collected += paise(s.total);
    }
    for (const x of refunds) ch[x.channel].refunds += paise(x.refundAmount);
    for (const x of undeliveredRefunds) ch[x.order?.channel ?? 'B2C'].refunds += paise(x.amount);
    ch.POS.refunds += posRefunds.reduce((s, x) => s + paise(x.total), 0);

    const channels = Object.values(ch).map((c) => ({
      key: c.key, label: c.label, orders: c.orders,
      billed: rupees(c.billed), tax: rupees(c.tax), netOfTax: rupees(c.billed - c.tax),
      collected: rupees(c.collected), outstanding: rupees(c.outstanding),
      discounts: rupees(c.discounts), coinsRedeemed: rupees(c.coinsRedeemed), refunds: rupees(c.refunds),
      avgOrderValue: c.orders ? rupees(c.billed / c.orders) : 0,
    }));
    const sum = (k: keyof Ch) => Object.values(ch).reduce((s, c) => s + (c[k] as number), 0);
    const billedP = sum('billed');
    const totals = {
      orders: sum('orders'),
      billed: rupees(billedP),
      tax: rupees(sum('tax')),
      netOfTax: rupees(billedP - sum('tax')),
      collected: rupees(sum('collected')),
      outstanding: rupees(sum('outstanding')),
      refunds: rupees(sum('refunds')),
      netRevenue: rupees(billedP - sum('refunds')),
    };
    const share = channels.map((c) => ({ key: c.key, share: ratio(paise(c.billed), billedP) }));

    // --- collections (cash basis: money that arrived in the range, by how)
    const sumOf = <T>(list: T[], pick: (t: T) => unknown) => list.reduce((s, x) => s + paise(pick(x) as number), 0);
    const posBy = (m: string) => sumOf(posSales.filter((s) => s.paymentMode === m), (s) => s.total);
    const receiptBy = (m: string) => sumOf(creditReceipts.filter((x) => x.method === m), (x) => x.amount);
    const collectionRows = [
      { key: 'ONLINE', label: 'Online payments (gateway)', amount: sumOf(onlinePayments, (p) => p.amount), count: onlinePayments.length },
      { key: 'COD_CASH', label: 'Cash on delivery - cash', amount: sumOf(cod.filter((c) => c.method === 'CASH'), (c) => c.collectedAmount), count: cod.filter((c) => c.method === 'CASH').length },
      { key: 'COD_UPI', label: 'Cash on delivery - UPI', amount: sumOf(cod.filter((c) => c.method === 'UPI'), (c) => c.collectedAmount), count: cod.filter((c) => c.method === 'UPI').length },
      ...(['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'] as const).map((m) => ({
        key: `CREDIT_${m}`, label: `B2B credit receipts - ${m.replace('_', ' ').toLowerCase()}`, amount: receiptBy(m),
        count: creditReceipts.filter((x) => x.method === m).length,
      })),
      ...(['CASH', 'UPI', 'CARD'] as const).map((m) => ({
        key: `POS_${m}`, label: `POS counter - ${m.toLowerCase()}`, amount: posBy(m), count: posSales.filter((s) => s.paymentMode === m).length,
      })),
    ].filter((x) => x.count > 0 || ['ONLINE', 'COD_CASH'].includes(x.key));
    const collectedTotalP = collectionRows.reduce((s, x) => s + x.amount, 0);

    // --- recent money movements, merged
    const recent = [
      ...onlinePayments.map((p) => ({ id: p.id, at: p.createdAt, source: 'Online payment', mode: p.provider, reference: p.gatewayPaymentId,
        party: p.order?.customer.name ?? null, document: p.order?.orderNumber ?? null, amount: rupees(paise(p.amount)) })),
      ...cod.map((c) => ({ id: c.id, at: c.collectedAt, source: 'COD', mode: c.method, reference: c.reference ?? `Rider ${c.rider.fullName}`,
        party: c.task.order?.customer.name ?? null, document: c.task.order?.orderNumber ?? null, amount: rupees(paise(c.collectedAmount)) })),
      ...creditReceipts.map((x) => ({ id: x.id, at: x.createdAt, source: 'Credit receipt', mode: x.method, reference: x.reference,
        party: x.customer.name, document: x.receiptNumber, amount: rupees(paise(x.amount)) })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 50);

    // --- trend: billed (accrual) vs collected (cash)
    const labels = periodsBetween(r.from, r.to, g);
    const trend = new Map(labels.map((p) => [p, { period: p, billed: 0, collected: 0 }]));
    const add = (d: Date, k: 'billed' | 'collected', p: number) => { const row = trend.get(periodOf(d, g)); if (row) row[k] += p; };
    orders.forEach((o) => add(o.orderDate, 'billed', paise(o.total)));
    posSales.forEach((s) => { add(s.createdAt, 'billed', paise(s.total)); add(s.createdAt, 'collected', paise(s.total)); });
    onlinePayments.forEach((p) => add(p.createdAt, 'collected', paise(p.amount)));
    cod.forEach((c) => add(c.collectedAt, 'collected', paise(c.collectedAmount)));
    creditReceipts.forEach((x) => add(x.createdAt, 'collected', paise(x.amount)));

    // --- GST from issued invoices
    const issued = invoices.filter((i) => i.status === 'ISSUED');
    const gstSum = (list: typeof invoices, k: 'taxableTotal' | 'cgstTotal' | 'sgstTotal' | 'igstTotal' | 'taxTotal' | 'grandTotal') =>
      rupees(sumOf(list, (i) => i[k]));
    const bySupply = (t: 'B2B' | 'B2C') => {
      const list = issued.filter((i) => i.supplyType === t);
      return { invoices: list.length, taxable: gstSum(list, 'taxableTotal'), tax: gstSum(list, 'taxTotal'), total: gstSum(list, 'grandTotal') };
    };
    const gst = {
      invoices: issued.length,
      cancelled: invoices.length - issued.length,
      taxable: gstSum(issued, 'taxableTotal'),
      cgst: gstSum(issued, 'cgstTotal'),
      sgst: gstSum(issued, 'sgstTotal'),
      igst: gstSum(issued, 'igstTotal'),
      tax: gstSum(issued, 'taxTotal'),
      total: gstSum(issued, 'grandTotal'),
      bySupply: { B2B: bySupply('B2B'), B2C: bySupply('B2C') },
      byRate: invoiceLines
        .map((l) => ({
          rate: Number(l.gstRatePercent),
          taxable: rupees(paise(l._sum.taxableValue)),
          tax: rupees(paise(l._sum.cgstAmount) + paise(l._sum.sgstAmount) + paise(l._sum.igstAmount)),
        }))
        .sort((a, b) => a.rate - b.rate),
      /** Credit notes issued in the range reduce the tax declared; `net*` is what is actually owed. */
      creditNotes: {
        count: creditNotes._count._all,
        taxable: rupees(paise(creditNotes._sum.taxableTotal)),
        tax: rupees(paise(creditNotes._sum.taxTotal)),
        total: rupees(paise(creditNotes._sum.grandTotal)),
      },
      netTaxable: rupees(sumOf(issued, (i) => i.taxableTotal) - paise(creditNotes._sum.taxableTotal)),
      netCgst: rupees(sumOf(issued, (i) => i.cgstTotal) - paise(creditNotes._sum.cgstTotal)),
      netSgst: rupees(sumOf(issued, (i) => i.sgstTotal) - paise(creditNotes._sum.sgstTotal)),
      netIgst: rupees(sumOf(issued, (i) => i.igstTotal) - paise(creditNotes._sum.igstTotal)),
      netTax: rupees(sumOf(issued, (i) => i.taxTotal) - paise(creditNotes._sum.taxTotal)),
      eInvoice: {
        pending: issued.filter((i) => i.eInvoiceStatus === 'PENDING').length,
        generated: issued.filter((i) => i.eInvoiceStatus === 'GENERATED').length,
        failed: issued.filter((i) => i.eInvoiceStatus === 'FAILED').length,
      },
    };

    const refundsByMethod: Record<string, number> = {};
    for (const x of refunds) {
      const k = x.refundMethod ?? 'UNSPECIFIED';
      refundsByMethod[k] = rupees(paise(refundsByMethod[k] ?? 0) + paise(x.refundAmount));
    }

    return {
      range: { from: r.from, to: r.to },
      granularity: g,
      totals,
      channels: channels.map((c) => ({ ...c, share: share.find((s) => s.key === c.key)!.share })),
      collections: { total: rupees(collectedTotalP), rows: collectionRows.map((x) => ({ ...x, amount: rupees(x.amount) })),
        refundWalletUsed: rupees(Math.abs(paise(walletPaid._sum.amount ?? 0))) },
      refunds: {
        total: totals.refunds,
        returns: { count: refunds.length, byMethod: refundsByMethod },
        undelivered: { count: undeliveredRefunds.length, amount: rupees(sumOf(undeliveredRefunds, (x) => x.amount)) },
        posRefunds: { count: posRefunds.length, amount: rupees(sumOf(posRefunds, (x) => x.total)) },
      },
      gst,
      receivables: {
        creditPeriodStart: receivables.creditPeriodStart,
        outstanding: receivables.totals.outstanding,
        overdue: receivables.totals.overdue,
        ageing: receivables.ageing,
        debtors: receivables.customers.length,
        topDebtors: receivables.customers.slice(0, 10),
      },
      payables: {
        affiliateCommission: {
          amount: rupees(paise(affiliatePayable._sum.commissionAmount) - paise(affiliatePayable._sum.refundedAmount)),
          lines: affiliatePayable._count._all,
        },
        /** Earned by riders in the range (organisation-wide - riders are not branch-scoped). */
        riderEarnings: rupees(paise(riderEarnings._sum.amount)),
      },
      trend: [...trend.values()].map((t) => ({ period: t.period, billed: rupees(t.billed), collected: rupees(t.collected) })),
      recentCollections: recent,
    };
  }

  // ============================================================ commerce dashboard

  /** Live counters for the Customer & Retail dashboard. Today/this month in IST. */
  async commerceDashboard(user: JwtPayload) {
    const branchId = scopedBranchId(user);
    const today = istDate(new Date());
    const todayR = istRange(today, today);
    const monthR = istRange(`${today.slice(0, 8)}01`, today);
    const ob: Prisma.OrderWhereInput = branchId ? { branchId } : {};
    const sumTotal = (where: Prisma.OrderWhereInput) =>
      this.prisma.order.aggregate({ where: { ...where, ...ob, status: SOLD }, _sum: { total: true }, _count: { _all: true } });

    const [todayAll, monthB2b, monthB2c, monthPos, toFulfil, pendingRetailers, openTickets, openReturns, receivables, stock, recentOrders] =
      await Promise.all([
        sumTotal({ orderDate: { gte: todayR.start, lt: todayR.end } }),
        sumTotal({ orderDate: { gte: monthR.start, lt: monthR.end }, channel: SalesChannel.B2B }),
        sumTotal({ orderDate: { gte: monthR.start, lt: monthR.end }, channel: SalesChannel.B2C }),
        this.prisma.posSale.aggregate({
          where: { createdAt: { gte: monthR.start, lt: monthR.end }, status: PosSaleStatus.COMPLETED, ...(branchId ? { outlet: { branchId } } : {}) },
          _sum: { total: true }, _count: { _all: true },
        }),
        this.prisma.order.groupBy({
          by: ['status'],
          where: { ...ob, status: { in: [OrderStatus.PLACED, OrderStatus.CONFIRMED, OrderStatus.ALLOCATED, OrderStatus.PACKED, OrderStatus.DISPATCHED] } },
          _count: { _all: true },
        }),
        this.prisma.customerAccount.count({ where: { status: CustomerAccountStatus.PENDING_APPROVAL } }),
        this.prisma.supportTicket.count({
          where: { status: { in: [SupportTicketStatus.OPEN, SupportTicketStatus.IN_PROGRESS] }, ...(branchId ? { customer: { branchId } } : {}) },
        }),
        this.prisma.returnRequest.count({
          where: { status: { notIn: ['COMPLETED', 'REJECTED', 'CANCELLED'] }, ...(branchId ? { order: { branchId } } : {}) },
        }),
        this.receivables.list(user, {}),
        this.products.stockSummary(),
        this.prisma.order.findMany({
          where: ob,
          orderBy: { createdAt: 'desc' },
          take: 6,
          select: { id: true, orderNumber: true, channel: true, status: true, total: true, createdAt: true, customer: { select: { name: true } } },
        }),
      ]);

    const alerts = stock
      .filter((p) => p.status !== 'OK')
      .sort((a, b) => (a.status === b.status ? a.availableQuantity - b.availableQuantity : a.status === 'CRITICAL' ? -1 : 1));
    const fulfil = Object.fromEntries(toFulfil.map((x) => [x.status, x._count._all]));

    return {
      today: { orders: todayAll._count._all, revenue: rupees(paise(todayAll._sum.total)) },
      month: {
        from: monthR.from,
        b2b: { orders: monthB2b._count._all, revenue: rupees(paise(monthB2b._sum.total)) },
        b2c: { orders: monthB2c._count._all, revenue: rupees(paise(monthB2c._sum.total)) },
        pos: { sales: monthPos._count._all, revenue: rupees(paise(monthPos._sum.total)) },
      },
      toFulfil: {
        total: Object.values(fulfil).reduce((s, n) => s + n, 0),
        byStatus: fulfil,
      },
      pendingRetailerApprovals: pendingRetailers,
      openSupportTickets: openTickets,
      openReturns,
      receivables: { outstanding: receivables.totals.outstanding, overdue: receivables.totals.overdue },
      lowStock: {
        critical: alerts.filter((a) => a.status === 'CRITICAL').length,
        low: alerts.filter((a) => a.status === 'LOW').length,
        items: alerts.slice(0, 8).map((a) => ({ id: a.productId, name: a.name, sku: a.sku, unit: a.unit, available: a.availableQuantity, reorderPoint: a.reorderPoint,
          safetyStock: a.safetyStock, status: a.status })),
      },
      recentOrders: recentOrders.map((o) => ({ ...o, total: rupees(paise(o.total)) })),
    };
  }
}
