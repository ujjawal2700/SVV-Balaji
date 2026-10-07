import { BadRequestException, Injectable } from '@nestjs/common';
import { CoinSource, CoinTransactionReason, Prisma, SalesChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CoinLedgerFilters {
  reason?: CoinTransactionReason;
  source?: CoinSource;
  channel?: SalesChannel;
  /** YYYY-MM-DD, inclusive, India time. */
  from?: string;
  to?: string;
  /** Customer name / code / phone, or an order number. */
  search?: string;
  customerId?: string;
}

const EARN: CoinTransactionReason[] = ['LOYALTY_EARN', 'REFERRAL_REFERRER_REWARD', 'REFERRAL_REFEREE_REWARD'];
const REDEEM: CoinTransactionReason[] = ['LOYALTY_REDEMPTION', 'REFERRAL_REDEMPTION'];
const REDEEM_REFUND: CoinTransactionReason[] = ['LOYALTY_REDEMPTION_REFUND', 'REFERRAL_REDEMPTION_REFUND'];

export const COIN_REASON_LABEL: Record<CoinTransactionReason, string> = {
  LOYALTY_EARN: 'Loyalty earned (order delivered)',
  LOYALTY_REVERSAL: 'Loyalty taken back (return)',
  LOYALTY_EXPIRY: 'Loyalty expired',
  LOYALTY_REDEMPTION: 'Points used at checkout',
  LOYALTY_REDEMPTION_REFUND: 'Points given back (order cancelled)',
  REFERRAL_REFERRER_REWARD: 'Referral reward - referrer',
  REFERRAL_REFEREE_REWARD: 'Referral reward - new customer',
  REFERRAL_REDEMPTION: 'Referral coins used at checkout',
  REFERRAL_REDEMPTION_REFUND: 'Referral coins given back (order cancelled)',
  MANUAL_ADJUSTMENT: 'Manual adjustment (staff)',
};

/** India midnight for a YYYY-MM-DD date (the dates staff type mean India dates). */
const istDay = (ymd: string, endOfDay = false) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new BadRequestException('Dates must be YYYY-MM-DD');
  const d = new Date(`${ymd}T00:00:00+05:30`);
  return endOfDay ? new Date(d.getTime() + 86_400_000 - 1) : d;
};

/**
 * Super Admin's view of every coin / point movement across all customers:
 * loyalty earned, used, taken back and expired, referral rewards, and staff
 * corrections - with the order, the customer and the staff member behind each.
 * Read-only: every row is written by LoyaltyService / ReferralService / the
 * manual-adjustment endpoint, never here.
 */
@Injectable()
export class CoinLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  private where(f: CoinLedgerFilters, opts: { withReason: boolean }): Prisma.CoinTransactionWhereInput {
    const and: Prisma.CoinTransactionWhereInput[] = [];
    if (opts.withReason && f.reason) and.push({ reason: f.reason });
    if (f.source) and.push({ source: f.source });
    if (f.channel) and.push({ customer: { channel: f.channel } });
    if (f.customerId) and.push({ customerId: f.customerId });
    if (f.from || f.to) {
      and.push({ createdAt: { ...(f.from ? { gte: istDay(f.from) } : {}), ...(f.to ? { lte: istDay(f.to, true) } : {}) } });
    }
    const q = f.search?.trim();
    if (q) {
      and.push({
        OR: [
          { customer: { name: { contains: q, mode: 'insensitive' } } },
          { customer: { customerCode: { contains: q, mode: 'insensitive' } } },
          { customer: { phone: { contains: q } } },
          { order: { orderNumber: { contains: q, mode: 'insensitive' } } },
        ],
      });
    }
    return and.length ? { AND: and } : {};
  }

  private readonly select = {
    id: true, createdAt: true, amount: true, reason: true, source: true, note: true, expiresAt: true, remainingAmount: true,
    customer: { select: { id: true, name: true, customerCode: true, channel: true, phone: true } },
    order: { select: { id: true, orderNumber: true, channel: true } },
    performedBy: { select: { fullName: true } },
    referral: { select: { referrer: { select: { name: true, customerCode: true } }, referee: { select: { name: true, customerCode: true } } } },
  } satisfies Prisma.CoinTransactionSelect;

  async list(f: CoinLedgerFilters, page = 1, limit = 50) {
    const where = this.where(f, { withReason: true });
    const [total, rows] = await Promise.all([
      this.prisma.coinTransaction.count({ where }),
      this.prisma.coinTransaction.findMany({ where, select: this.select, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    ]);
    return { data: rows.map((r) => this.row(r)), meta: { total, page, limit }, summary: await this.summary(f) };
  }

  /**
   * Totals for the same filters (except the type filter, so the cards always show the full picture):
   * issued, used at checkout, taken back, expired, staff +/-, and what customers hold right now.
   */
  async summary(f: CoinLedgerFilters) {
    const where = this.where(f, { withReason: false });
    const [byReason, manualPlus, manualMinus, held, customers] = await Promise.all([
      this.prisma.coinTransaction.groupBy({ by: ['reason'], where, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.coinTransaction.aggregate({ where: { AND: [where, { reason: 'MANUAL_ADJUSTMENT', amount: { gt: 0 } }] }, _sum: { amount: true } }),
      this.prisma.coinTransaction.aggregate({ where: { AND: [where, { reason: 'MANUAL_ADJUSTMENT', amount: { lt: 0 } }] }, _sum: { amount: true } }),
      this.prisma.customer.aggregate({ where: f.channel ? { channel: f.channel } : {}, _sum: { coinBalance: true } }),
      this.prisma.coinTransaction.findMany({ where, distinct: ['customerId'], select: { customerId: true } }),
    ]);
    const sum = (reasons: CoinTransactionReason[]) => byReason.filter((r) => reasons.includes(r.reason)).reduce((n, r) => n + (r._sum.amount ?? 0), 0);
    return {
      issued: sum(EARN),
      redeemed: -(sum(REDEEM) + sum(REDEEM_REFUND)),
      reversed: -sum(['LOYALTY_REVERSAL']),
      expired: -sum(['LOYALTY_EXPIRY']),
      manualAdded: manualPlus._sum.amount ?? 0,
      manualRemoved: -(manualMinus._sum.amount ?? 0),
      /** Current balance of every customer in the channel (not limited by the date / search filters). */
      outstanding: held._sum.coinBalance ?? 0,
      customers: customers.length,
      transactions: byReason.reduce((n, r) => n + r._count._all, 0),
      byReason: byReason
        .map((r) => ({ reason: r.reason, label: COIN_REASON_LABEL[r.reason], count: r._count._all, amount: r._sum.amount ?? 0 }))
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
    };
  }

  /** CSV of every row matching the filters (newest first, capped). */
  async csv(f: CoinLedgerFilters, cap = 20_000) {
    const rows = await this.prisma.coinTransaction.findMany({
      where: this.where(f, { withReason: true }), select: this.select, orderBy: { createdAt: 'desc' }, take: cap,
    });
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = ['Date (IST)', 'Customer code', 'Customer', 'Channel', 'Phone', 'Type', 'Pool', 'Coins', 'Order', 'Referral', 'By staff', 'Expires', 'Note'];
    const lines = rows.map((r0) => {
      const r = this.row(r0);
      return [
        new Date(r.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), r.customer.customerCode, r.customer.name, r.customer.channel,
        r.customer.phone, r.reasonLabel, r.source, r.amount, r.order?.orderNumber ?? '', r.referralText ?? '', r.performedBy ?? '',
        r.expiresAt ? new Date(r.expiresAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : '', r.note ?? '',
      ].map(esc).join(',');
    });
    return [head.join(','), ...lines].join('\n');
  }

  private row(r: Prisma.CoinTransactionGetPayload<{ select: CoinLedgerService['select'] }>) {
    const ref = r.referral;
    return {
      id: r.id,
      createdAt: r.createdAt,
      amount: r.amount,
      reason: r.reason,
      reasonLabel: COIN_REASON_LABEL[r.reason],
      source: r.source,
      note: r.note,
      expiresAt: r.expiresAt,
      remainingAmount: r.remainingAmount,
      customer: r.customer,
      order: r.order,
      performedBy: r.performedBy?.fullName ?? null,
      referralText: ref ? `${ref.referrer.name} (${ref.referrer.customerCode}) referred ${ref.referee.name} (${ref.referee.customerCode})` : null,
    };
  }
}
