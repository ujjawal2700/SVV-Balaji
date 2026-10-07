import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  Affiliate, AffiliateAttributionStatus, AffiliateCommissionStatus, AffiliatePayoutMethod, AffiliateStatus, OrderStatus, Prisma,
} from '@prisma/client';
import { SequenceService } from '../common/sequence.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { affiliateCode, hashIp, round2 } from './affiliate.logic';
import { AffiliateLedgerService } from './affiliate-ledger.service';
import { AffiliateSettingsService } from './affiliate-settings.service';
import type {
  ApplyAffiliateDto, CreatePayoutDto, ListAffiliatesQueryDto, ListAttributionsQueryDto, ListCommissionsQueryDto,
  TrackClickDto, UpdateMyAffiliateDto,
} from './dto/affiliates.dto';
import { StaffAlertsService } from '../realtime/staff-alerts.service';

const CLICK_DEDUPE_MS = 30 * 60_000;
const n = (d: Prisma.Decimal | number | null | undefined) => Number(d ?? 0);

export interface Balances {
  /** Inside the hold window (net of returns). */
  pending: number;
  /** Matured and unpaid, net of returns. */
  approvedGross: number;
  /** Returns on already-paid commission, not yet recovered. */
  clawbackDue: number;
  /** approvedGross - clawbackDue: what the next payout would send. */
  payable: number;
  paid: number;
  /** Commission taken back by returns, all time. */
  reversed: number;
}

/**
 * The affiliate program: applications and their review, link tracking, the
 * affiliate's own dashboard, the staff ledgers and the manual payout run.
 * Money movements on orders live in AffiliateLedgerService.
 */
@Injectable()
export class AffiliatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly settings: AffiliateSettingsService,
    private readonly ledger: AffiliateLedgerService,
    private readonly notifications: NotificationsService,
    @Optional() private readonly staffAlerts?: StaffAlertsService,
  ) {}

  // ================================================================ public program page

  /**
   * What the public landing page shows: the program rules and the commission
   * each category earns. Only categories that are active, have products and
   * earn more than 0% are listed - the page must never advertise a rate that
   * no product actually pays.
   */
  async programInfo() {
    const s = await this.settings.effective();
    const matrix = await this.settings.categoryMatrix();
    const rates = matrix.categories
      .filter((c) => c.isActive && c.productCount > 0 && c.effectiveRatePercent > 0)
      .map((c) => ({ category: c.name, parentCategory: c.parentName, ratePercent: c.effectiveRatePercent }))
      .sort((a, b) => b.ratePercent - a.ratePercent || a.category.localeCompare(b.category));
    const [affiliates, paid] = await Promise.all([
      this.prisma.affiliate.count({ where: { status: AffiliateStatus.APPROVED } }),
      this.prisma.affiliatePayout.aggregate({ _sum: { netAmount: true } }),
    ]);
    return {
      enabled: s.enabled,
      cookieDays: s.cookieDays,
      holdDays: s.holdDays,
      holdFrom: s.holdFrom,
      minPayoutAmount: s.minPayoutAmount,
      termsText: s.termsText,
      maxRatePercent: rates.length ? rates[0].ratePercent : 0,
      rates,
      stats: { activeAffiliates: affiliates, totalPaidOut: round2(n(paid._sum.netAmount)) },
    };
  }

  private async tell(affiliateId: string, title: string, body: string, link = '/affiliate') {
    const a = await this.prisma.affiliate.findUnique({ where: { id: affiliateId }, select: { customerAccountId: true } });
    if (a) await this.notifications.notifyCustomerAccount(a.customerAccountId, { title, body, link });
  }

  // ================================================================ tracking

  /**
   * A visit through ?aff=CODE. Returns the click to put in the cookie, or null
   * when the code does not belong to an active affiliate (the visitor browses
   * on, nothing is set - and any older cookie is left alone).
   */
  async trackClick(dto: TrackClickDto, meta: { ip?: string; userAgent?: string }) {
    const s = await this.settings.effective();
    if (!s.enabled) return null;
    const affiliate = await this.prisma.affiliate.findUnique({ where: { code: dto.code.trim().toUpperCase() } });
    if (!affiliate || affiliate.status !== AffiliateStatus.APPROVED) return null;

    const ipHash = hashIp(meta.ip);
    // A refresh or a second tab is not a second click.
    const recent = ipHash
      ? await this.prisma.affiliateClick.findFirst({
          where: { affiliateId: affiliate.id, ipHash, createdAt: { gte: new Date(Date.now() - CLICK_DEDUPE_MS) } },
          orderBy: { createdAt: 'desc' },
        })
      : null;
    const click = recent ?? await this.prisma.affiliateClick.create({
      data: {
        affiliateId: affiliate.id, ipHash, userAgent: meta.userAgent?.slice(0, 300) ?? null,
        landingPath: dto.landingPath?.slice(0, 300) ?? null, referrer: dto.referrer?.slice(0, 300) ?? null,
      },
    });
    return { clickId: click.id, affiliateCode: affiliate.code, cookieDays: s.cookieDays };
  }

  /** The click behind a cookie, if it is still live and its affiliate still active. */
  async liveClickId(clickId: string | null): Promise<string | null> {
    if (!clickId) return null;
    const s = await this.settings.effective();
    if (!s.enabled) return null;
    const click = await this.prisma.affiliateClick.findUnique({ where: { id: clickId }, include: { affiliate: { select: { status: true } } } });
    if (!click || click.affiliate.status !== AffiliateStatus.APPROVED) return null;
    if (click.createdAt.getTime() < Date.now() - s.cookieDays * 24 * 60 * 60_000) return null;
    return click.id;
  }

  // ================================================================ applying (storefront)

  private assertPayout(
    method: AffiliatePayoutMethod,
    d: { [K in 'payoutUpiId' | 'payoutAccountName' | 'payoutAccountNumber' | 'payoutIfsc' | 'payoutBankName']?: string | null },
  ) {
    if (method === AffiliatePayoutMethod.UPI && !d.payoutUpiId) throw new BadRequestException('Enter the UPI id your commission should be paid to');
    if (method === AffiliatePayoutMethod.BANK) {
      if (!d.payoutAccountName || !d.payoutAccountNumber || !d.payoutIfsc || !d.payoutBankName) {
        throw new BadRequestException('Enter the account holder name, account number, IFSC and bank name for bank payouts');
      }
      if (!/^[a-zA-Z\s]+$/.test(d.payoutAccountName.trim())) {
        throw new BadRequestException('Account holder name must contain only letters and spaces');
      }
      if (d.payoutAccountName.trim().length < 2 || d.payoutAccountName.trim().length > 100) {
        throw new BadRequestException('Account holder name must be between 2 and 100 characters');
      }
      if (!/^\d{9,18}$/.test(d.payoutAccountNumber.trim())) {
        throw new BadRequestException('Account number must be 9 to 18 digits (numbers only)');
      }
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(d.payoutIfsc.trim().toUpperCase())) {
        throw new BadRequestException('Enter a valid 11-character IFSC code (e.g. HDFC0001234)');
      }
      if (/\d/.test(d.payoutBankName) || d.payoutBankName.trim().length < 2 || d.payoutBankName.trim().length > 100) {
        throw new BadRequestException('Bank name cannot contain numbers and must be between 2 and 100 characters');
      }
    }
  }

  async apply(accountId: string, dto: ApplyAffiliateDto) {
    if (!dto.acceptTerms) throw new BadRequestException('Please accept the affiliate program terms');
    const s = await this.settings.effective();
    if (!s.enabled) throw new ConflictException('The affiliate program is not accepting applications right now');
    const account = await this.prisma.customerAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Account not found');

    const method = dto.payoutMethod ?? AffiliatePayoutMethod.UPI;
    this.assertPayout(method, dto);
    const data = {
      fullName: dto.fullName.trim(),
      phone: account.phone,
      email: dto.email?.trim().toLowerCase() || account.email || null,
      customerId: account.customerId,
      promotionUrl: dto.promotionUrl?.trim() || null,
      audienceSize: dto.audienceSize?.trim() || null,
      promotionPlan: dto.promotionPlan?.trim() || null,
      pan: dto.pan ?? null,
      payoutMethod: method,
      payoutUpiId: dto.payoutUpiId?.trim().toLowerCase() || null,
      payoutAccountName: dto.payoutAccountName?.trim() || null,
      payoutAccountNumber: dto.payoutAccountNumber ?? null,
      payoutIfsc: dto.payoutIfsc ?? null,
      payoutBankName: dto.payoutBankName?.trim() || null,
    };

    const existing = await this.prisma.affiliate.findUnique({ where: { customerAccountId: accountId } });
    if (existing) {
      if (existing.status !== AffiliateStatus.REJECTED) {
        throw new ConflictException(`You have already applied - your application is ${existing.status.toLowerCase()}`);
      }
      // Re-applying after a rejection: same row and code, back in the queue.
      await this.prisma.affiliate.update({
        where: { id: existing.id },
        data: { ...data, status: AffiliateStatus.PENDING, rejectionReason: null, reviewedAt: null, reviewedById: null },
      });
      this.alertApplication(existing.id, data.fullName, true);
      return this.mine(accountId);
    }

    let createdId = '';
    for (let attempt = 0; ; attempt += 1) {
      try {
        createdId = (await this.prisma.affiliate.create({ data: { ...data, customerAccountId: accountId, code: affiliateCode(data.fullName) }, select: { id: true } })).id;
        break;
      } catch (e) {
        const codeClash = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && String(e.meta?.target ?? '').includes('code');
        if (!codeClash || attempt >= 5) throw e;
      }
    }
    this.alertApplication(createdId, data.fullName, false);
    return this.mine(accountId);
  }

  private alertApplication(affiliateId: string, name: string, again: boolean) {
    void this.staffAlerts?.notify({
      type: 'AFFILIATE_APPLICATION',
      title: again ? 'Affiliate re-applied' : 'New affiliate application',
      body: `${name} is waiting for approval.`,
      link: `/affiliates/${affiliateId}`,
      permission: 'affiliates.review',
    });
  }

  async updateMine(accountId: string, dto: UpdateMyAffiliateDto) {
    const a = await this.prisma.affiliate.findUnique({ where: { customerAccountId: accountId } });
    if (!a) throw new NotFoundException('You have not applied to the affiliate program');
    const merged = { ...a, ...Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)) } as Affiliate;
    this.assertPayout(merged.payoutMethod, merged);
    await this.prisma.affiliate.update({
      where: { id: a.id },
      data: {
        email: dto.email?.trim().toLowerCase(),
        promotionUrl: dto.promotionUrl?.trim(),
        payoutMethod: dto.payoutMethod,
        payoutUpiId: dto.payoutUpiId?.trim().toLowerCase(),
        payoutAccountName: dto.payoutAccountName?.trim(),
        payoutAccountNumber: dto.payoutAccountNumber,
        payoutIfsc: dto.payoutIfsc,
        payoutBankName: dto.payoutBankName?.trim(),
      },
    });
    return this.mine(accountId);
  }

  /** The affiliate's own view: their application and, once approved, the dashboard. */
  async mine(accountId: string) {
    const s = await this.settings.effective();
    const a = await this.prisma.affiliate.findUnique({ where: { customerAccountId: accountId } });
    const program = { enabled: s.enabled, cookieDays: s.cookieDays, holdDays: s.holdDays, termsText: s.termsText };
    if (!a) return { program, affiliate: null, dashboard: null };
    const profile = {
      id: a.id, code: a.code, status: a.status, fullName: a.fullName, phone: a.phone, email: a.email, promotionUrl: a.promotionUrl,
      audienceSize: a.audienceSize, promotionPlan: a.promotionPlan, payoutMethod: a.payoutMethod, payoutUpiId: a.payoutUpiId,
      payoutAccountName: a.payoutAccountName, payoutAccountNumber: a.payoutAccountNumber ? mask(a.payoutAccountNumber) : null,
      payoutIfsc: a.payoutIfsc, payoutBankName: a.payoutBankName, rejectionReason: a.rejectionReason, suspendedReason: a.suspendedReason,
      appliedAt: a.createdAt, reviewedAt: a.reviewedAt,
    };
    if (a.status === AffiliateStatus.PENDING || a.status === AffiliateStatus.REJECTED) return { program, affiliate: profile, dashboard: null };
    return { program, affiliate: profile, dashboard: await this.dashboard(a.id) };
  }

  private async requireMine(accountId: string) {
    const a = await this.prisma.affiliate.findUnique({ where: { customerAccountId: accountId } });
    if (!a) throw new NotFoundException('You have not applied to the affiliate program');
    if (a.status === AffiliateStatus.PENDING || a.status === AffiliateStatus.REJECTED) throw new ForbiddenException('Your affiliate account is not active');
    return a;
  }

  async myCommissions(accountId: string, q: ListCommissionsQueryDto) {
    const a = await this.requireMine(accountId);
    return this.commissions({ ...q, affiliateId: a.id }, { forAffiliate: true });
  }

  async myPayouts(accountId: string) {
    const a = await this.requireMine(accountId);
    return this.payoutHistory(a.id);
  }

  // ================================================================ dashboards & balances

  async balances(affiliateIds: string[]): Promise<Map<string, Balances>> {
    const out = new Map<string, Balances>(affiliateIds.map((id) => [id, { pending: 0, approvedGross: 0, clawbackDue: 0, payable: 0, paid: 0, reversed: 0 }]));
    if (affiliateIds.length === 0) return out;
    const [byStatus, clawbacks, reversed, paid] = await Promise.all([
      this.prisma.affiliateCommission.groupBy({
        by: ['affiliateId', 'status'],
        where: { affiliateId: { in: affiliateIds }, status: { in: [AffiliateCommissionStatus.PENDING, AffiliateCommissionStatus.APPROVED] } },
        _sum: { commissionAmount: true, refundedAmount: true },
      }),
      this.prisma.affiliateCommissionAdjustment.groupBy({
        by: ['affiliateId'],
        where: { affiliateId: { in: affiliateIds }, clawback: true, recoveredInPayoutId: null },
        _sum: { amount: true },
      }),
      this.prisma.affiliateCommissionAdjustment.groupBy({ by: ['affiliateId'], where: { affiliateId: { in: affiliateIds } }, _sum: { amount: true } }),
      this.prisma.affiliatePayout.groupBy({ by: ['affiliateId'], where: { affiliateId: { in: affiliateIds } }, _sum: { netAmount: true } }),
    ]);
    for (const r of byStatus) {
      const b = out.get(r.affiliateId)!;
      const net = round2(n(r._sum.commissionAmount) - n(r._sum.refundedAmount));
      if (r.status === AffiliateCommissionStatus.PENDING) b.pending = net;
      else b.approvedGross = net;
    }
    for (const r of clawbacks) out.get(r.affiliateId)!.clawbackDue = round2(n(r._sum.amount));
    for (const r of reversed) out.get(r.affiliateId)!.reversed = round2(n(r._sum.amount));
    for (const r of paid) out.get(r.affiliateId)!.paid = round2(n(r._sum.netAmount));
    for (const b of out.values()) b.payable = round2(b.approvedGross - b.clawbackDue);
    return out;
  }

  private async orderStats(affiliateIds: string[]) {
    const rows = await this.prisma.affiliateAttribution.groupBy({
      by: ['affiliateId', 'status'],
      where: { affiliateId: { in: affiliateIds }, order: { status: { not: OrderStatus.CANCELLED } } },
      _count: { _all: true },
    });
    const out = new Map<string, { successfulOrders: number; flaggedOrders: number }>();
    for (const id of affiliateIds) out.set(id, { successfulOrders: 0, flaggedOrders: 0 });
    for (const r of rows) {
      const s = out.get(r.affiliateId)!;
      if (r.status === AffiliateAttributionStatus.FRAUD) s.flaggedOrders += r._count._all;
      else s.successfulOrders += r._count._all;
    }
    return out;
  }

  async dashboard(affiliateId: string) {
    await this.ledger.matureDue();
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60_000);
    const [clicks, clicks30, balances, orders, recent, s] = await Promise.all([
      this.prisma.affiliateClick.count({ where: { affiliateId } }),
      this.prisma.affiliateClick.count({ where: { affiliateId, createdAt: { gte: since30 } } }),
      this.balances([affiliateId]),
      this.orderStats([affiliateId]),
      this.commissions({ affiliateId, page: 1, pageSize: 10 }, { forAffiliate: true }),
      this.settings.effective(),
    ]);
    const b = balances.get(affiliateId)!;
    const o = orders.get(affiliateId)!;
    return {
      clicks,
      clicksLast30Days: clicks30,
      successfulOrders: o.successfulOrders,
      conversionRatePercent: clicks > 0 ? round2((o.successfulOrders / clicks) * 100) : 0,
      totalEarnings: round2(b.pending + b.approvedGross + b.paid - b.clawbackDue),
      balances: b,
      holdDays: s.holdDays,
      recentCommissions: recent.data,
    };
  }

  // ================================================================ staff: affiliates

  async list(q: ListAffiliatesQueryDto) {
    const search = q.search?.trim();
    const rows = await this.prisma.affiliate.findMany({
      where: {
        status: q.status,
        ...(search ? { OR: [
          { fullName: { contains: search, mode: 'insensitive' } }, { code: { contains: search.toUpperCase() } },
          { phone: { contains: search } }, { email: { contains: search, mode: 'insensitive' } },
        ] } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 500,
    });
    const ids = rows.map((r) => r.id);
    const [balances, orders, clicks] = await Promise.all([
      this.balances(ids),
      this.orderStats(ids),
      this.prisma.affiliateClick.groupBy({ by: ['affiliateId'], where: { affiliateId: { in: ids } }, _count: { _all: true } }),
    ]);
    const clickMap = new Map(clicks.map((c) => [c.affiliateId, c._count._all]));
    return rows.map((a) => ({
      ...this.staffProfile(a),
      clicks: clickMap.get(a.id) ?? 0,
      ...orders.get(a.id)!,
      balances: balances.get(a.id)!,
    }));
  }

  async detail(id: string) {
    await this.ledger.matureDue();
    const a = await this.prisma.affiliate.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Affiliate not found');
    return { ...this.staffProfile(a), dashboard: await this.dashboard(id) };
  }

  private staffProfile(a: Affiliate) {
    return {
      id: a.id, code: a.code, status: a.status, fullName: a.fullName, phone: a.phone, email: a.email, customerId: a.customerId,
      promotionUrl: a.promotionUrl, audienceSize: a.audienceSize, promotionPlan: a.promotionPlan, pan: a.pan,
      payoutMethod: a.payoutMethod, payoutUpiId: a.payoutUpiId, payoutAccountName: a.payoutAccountName,
      payoutAccountNumber: a.payoutAccountNumber, payoutIfsc: a.payoutIfsc, payoutBankName: a.payoutBankName,
      rejectionReason: a.rejectionReason, suspendedReason: a.suspendedReason, reviewedAt: a.reviewedAt, appliedAt: a.createdAt,
    };
  }

  private async transition(id: string, from: AffiliateStatus[], data: Prisma.AffiliateUpdateManyMutationInput, verb: string) {
    const res = await this.prisma.affiliate.updateMany({ where: { id, status: { in: from } }, data });
    if (res.count !== 1) {
      const a = await this.prisma.affiliate.findUnique({ where: { id }, select: { status: true } });
      if (!a) throw new NotFoundException('Affiliate not found');
      throw new ConflictException(`Cannot ${verb} an affiliate who is ${a.status.toLowerCase()}`);
    }
    return this.detail(id);
  }

  async approve(id: string, userId: string) {
    const out = await this.transition(id, [AffiliateStatus.PENDING], { status: AffiliateStatus.APPROVED, reviewedById: userId, reviewedAt: new Date(), rejectionReason: null }, 'approve');
    await this.tell(id, 'You are now a Desi Tokri affiliate', `Your code is ${out.code}. Share your links and earn on every item your audience buys.`);
    return out;
  }

  async reject(id: string, reason: string, userId: string) {
    const out = await this.transition(id, [AffiliateStatus.PENDING], { status: AffiliateStatus.REJECTED, reviewedById: userId, reviewedAt: new Date(), rejectionReason: reason.trim() }, 'reject');
    await this.tell(id, 'Affiliate application not approved', `${reason.trim()} You can update your details and apply again.`);
    return out;
  }

  /** Links stop tracking and new orders stop earning. Commission already earned is still owed. */
  async suspend(id: string, reason: string) {
    const out = await this.transition(id, [AffiliateStatus.APPROVED], { status: AffiliateStatus.SUSPENDED, suspendedReason: reason.trim() }, 'suspend');
    await this.tell(id, 'Affiliate account suspended', `${reason.trim()} Commission you already earned will still be paid.`);
    return out;
  }

  async reactivate(id: string) {
    const out = await this.transition(id, [AffiliateStatus.SUSPENDED], { status: AffiliateStatus.APPROVED, suspendedReason: null }, 'reactivate');
    await this.tell(id, 'Affiliate account reactivated', 'Your links are tracking again.');
    return out;
  }

  // ================================================================ ledgers

  async commissions(q: ListCommissionsQueryDto, opts: { forAffiliate?: boolean } = {}) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;
    const where: Prisma.AffiliateCommissionWhereInput = { affiliateId: q.affiliateId, status: q.status };
    const [total, rows] = await Promise.all([
      this.prisma.affiliateCommission.count({ where }),
      this.prisma.affiliateCommission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          order: { select: { orderNumber: true, orderDate: true, status: true, deliveredAt: true } },
          affiliate: { select: { code: true, fullName: true } },
          payout: { select: { payoutNumber: true } },
          adjustments: { select: { quantity: true, amount: true, clawback: true, createdAt: true, note: true }, orderBy: { createdAt: 'asc' } },
        },
      }),
    ]);
    return {
      total, page, pageSize,
      data: rows.map((c) => ({
        id: c.id,
        orderNumber: c.order.orderNumber,
        orderDate: c.order.orderDate,
        orderStatus: c.order.status,
        ...(opts.forAffiliate ? {} : { affiliateId: c.affiliateId, affiliateCode: c.affiliate.code, affiliateName: c.affiliate.fullName }),
        productName: c.productName,
        categoryName: c.categoryName,
        quantity: c.quantity,
        grossAmount: n(c.grossAmount),
        couponShare: n(c.couponShare),
        baseAmount: n(c.baseAmount),
        ratePercent: n(c.ratePercent),
        rateSource: c.rateSource,
        commissionAmount: n(c.commissionAmount),
        refundedQuantity: c.refundedQuantity,
        refundedAmount: n(c.refundedAmount),
        netAmount: round2(n(c.commissionAmount) - n(c.refundedAmount)),
        status: c.status,
        statusNote: c.statusNote,
        releaseDate: c.releaseDate,
        approvedAt: c.approvedAt,
        paidAt: c.paidAt,
        payoutNumber: c.payout?.payoutNumber ?? null,
        adjustments: c.adjustments.map((a) => ({ ...a, amount: n(a.amount) })),
      })),
    };
  }

  async attributions(q: ListAttributionsQueryDto) {
    const rows = await this.prisma.affiliateAttribution.findMany({
      where: { status: q.status as AffiliateAttributionStatus | undefined, affiliateId: q.affiliateId },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        order: { select: { orderNumber: true, total: true, status: true, customer: { select: { name: true, customerCode: true } } } },
        affiliate: { select: { code: true, fullName: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id, status: r.status, fraudReasons: r.fraudReasons, fraudDetail: r.fraudDetail, createdAt: r.createdAt,
      baseTotal: n(r.baseTotal), commissionTotal: n(r.commissionTotal),
      orderId: r.orderId, orderNumber: r.order.orderNumber, orderTotal: n(r.order.total), orderStatus: r.order.status,
      customerName: r.order.customer.name, customerCode: r.order.customer.customerCode,
      affiliateId: r.affiliateId, affiliateCode: r.affiliate.code, affiliateName: r.affiliate.fullName,
    }));
  }

  // ================================================================ payouts

  /** Affiliates with matured, unpaid commission at or above the minimum payout. */
  async payoutsDue() {
    await this.ledger.matureDue();
    const s = await this.settings.effective();
    const withMoney = await this.prisma.affiliateCommission.findMany({
      where: { status: AffiliateCommissionStatus.APPROVED },
      distinct: ['affiliateId'],
      select: { affiliateId: true },
    });
    const ids = withMoney.map((r) => r.affiliateId);
    const [balances, affiliates, counts] = await Promise.all([
      this.balances(ids),
      this.prisma.affiliate.findMany({ where: { id: { in: ids } } }),
      this.prisma.affiliateCommission.groupBy({
        by: ['affiliateId'], where: { affiliateId: { in: ids }, status: AffiliateCommissionStatus.APPROVED }, _count: { _all: true }, _min: { approvedAt: true },
      }),
    ]);
    const countMap = new Map(counts.map((c) => [c.affiliateId, c]));
    return {
      minPayoutAmount: s.minPayoutAmount,
      data: affiliates
        .map((a) => {
          const b = balances.get(a.id)!;
          return {
            ...this.staffProfile(a),
            commissionCount: countMap.get(a.id)?._count._all ?? 0,
            oldestApprovedAt: countMap.get(a.id)?._min.approvedAt ?? null,
            balances: b,
            payoutDetailsComplete: a.payoutMethod === 'UPI' ? !!a.payoutUpiId : !!(a.payoutAccountNumber && a.payoutIfsc && a.payoutAccountName),
          };
        })
        .filter((r) => r.balances.payable > 0 && r.balances.payable >= s.minPayoutAmount)
        .sort((x, y) => y.balances.payable - x.balances.payable),
    };
  }

  /**
   * Record a payout Super Admin made outside the system (UPI / bank). Every
   * APPROVED commission of the affiliate is included and every unrecovered
   * clawback deducted, under row locks, so a return landing at the same moment
   * is either in this payout or clawed back from the next - never lost. The
   * amount shown on screen must still be the amount owed (expectedNetAmount).
   */
  async pay(dto: CreatePayoutDto, userId: string) {
    await this.ledger.matureDue();
    const payout = await this.payInTx(dto, userId);
    await this.tell(payout.affiliateId, 'Affiliate payout sent', `₹${payout.netAmount.toFixed(2)} sent to ${payout.paidTo} (ref ${payout.reference}).`);
    return payout;
  }

  private payInTx(dto: CreatePayoutDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM affiliates WHERE id = ${dto.affiliateId} FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException('Affiliate not found');
      const a = await tx.affiliate.findUniqueOrThrow({ where: { id: dto.affiliateId } });
      const rows = await tx.$queryRaw<Array<{ id: string; commissionAmount: Prisma.Decimal; refundedAmount: Prisma.Decimal }>>`
        SELECT id, "commissionAmount", "refundedAmount" FROM affiliate_commissions
        WHERE "affiliateId" = ${a.id} AND status = 'APPROVED'::"AffiliateCommissionStatus" FOR UPDATE`;
      const clawbacks = await tx.affiliateCommissionAdjustment.findMany({ where: { affiliateId: a.id, clawback: true, recoveredInPayoutId: null } });
      const gross = round2(rows.reduce((s, r) => s + n(r.commissionAmount) - n(r.refundedAmount), 0));
      const clawback = round2(clawbacks.reduce((s, c) => s + n(c.amount), 0));
      const net = round2(gross - clawback);
      if (rows.length === 0 || net <= 0) throw new ConflictException('Nothing is payable to this affiliate right now');
      if (Math.abs(net - dto.expectedNetAmount) > 0.009) {
        throw new ConflictException({ code: 'BALANCE_CHANGED', message: `The payable amount is now ₹${net.toFixed(2)} (you were shown ₹${dto.expectedNetAmount.toFixed(2)}). Refresh and check before paying.` });
      }
      const paidTo = a.payoutMethod === AffiliatePayoutMethod.UPI ? a.payoutUpiId : a.payoutAccountNumber ? `${a.payoutBankName ?? 'Bank'} ${mask(a.payoutAccountNumber)} (${a.payoutIfsc})` : null;
      if (!paidTo) throw new BadRequestException('This affiliate has no payout details on file');

      const now = new Date();
      const payout = await tx.affiliatePayout.create({
        data: {
          payoutNumber: await this.sequence.next(tx, 'AFP', now),
          affiliateId: a.id, grossAmount: gross, clawbackAmount: clawback, netAmount: net, commissionCount: rows.length,
          method: a.payoutMethod, paidTo, reference: dto.reference.trim(), note: dto.note?.trim() || null, paidById: userId, paidAt: now,
        },
      });
      await tx.affiliateCommission.updateMany({
        where: { id: { in: rows.map((r) => r.id) }, status: AffiliateCommissionStatus.APPROVED },
        data: { status: AffiliateCommissionStatus.PAID, payoutId: payout.id, paidAt: now },
      });
      if (clawbacks.length) {
        await tx.affiliateCommissionAdjustment.updateMany({ where: { id: { in: clawbacks.map((c) => c.id) } }, data: { recoveredInPayoutId: payout.id } });
      }
      return { ...payout, grossAmount: gross, clawbackAmount: clawback, netAmount: net };
    }, { timeout: 20_000 });
  }

  async payoutHistory(affiliateId?: string) {
    const rows = await this.prisma.affiliatePayout.findMany({
      where: { affiliateId },
      orderBy: { paidAt: 'desc' },
      take: 500,
      include: { affiliate: { select: { code: true, fullName: true } } },
    });
    return rows.map((p) => ({
      id: p.id, payoutNumber: p.payoutNumber, affiliateId: p.affiliateId, affiliateCode: p.affiliate.code, affiliateName: p.affiliate.fullName,
      grossAmount: n(p.grossAmount), clawbackAmount: n(p.clawbackAmount), netAmount: n(p.netAmount), commissionCount: p.commissionCount,
      method: p.method, paidTo: p.paidTo, reference: p.reference, note: p.note, paidAt: p.paidAt,
    }));
  }
}

const mask = (acct: string) => `XXXX${acct.slice(-4)}`;
