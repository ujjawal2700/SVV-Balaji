import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  AffiliateAttributionStatus, AffiliateCommissionStatus, AffiliateStatus, OrderStatus, PaymentMode, Prisma, ReturnRequestStatus, SalesChannel,
} from '@prisma/client';
import { createPaymentGateway, type PaymentGateway } from '../checkout/payment/payment-gateway';
import { PrismaService } from '../prisma/prisma.service';
import {
  canMature, commissionBases, commissionFor, deductionFor, releaseDateFor, resolveRate, round2, selfReferralReasons, type CategoryNode,
} from './affiliate.logic';
import { AffiliateSettingsService } from './affiliate-settings.service';

type Tx = Prisma.TransactionClient;

/** The checkout quote frozen on the order - only the fields read here. */
interface FrozenQuote {
  address?: { phone?: string | null };
  lines: Array<{ productId: string; quantity: number; unitPrice: number }>;
  totals: { couponDiscount?: number };
}

const SWEEP_MS = 10 * 60_000;
/** Returns still in flight: the item may yet come back, so its commission waits. */
const OPEN_RETURN: ReturnRequestStatus[] = [
  'REQUESTED', 'APPROVED', 'PICKUP_SCHEDULED', 'PICKED_UP', 'QC', 'REFUND_INITIATED', 'PICKUP_FAILED',
];

/**
 * The affiliate commission ledger: every write that moves an affiliate's money.
 *
 * Hooks, and why each lives where it does:
 *  - `afterOrderPlaced`  - CheckoutService.confirm, AFTER the order transaction
 *    commits. Attribution must never be able to roll an order back, and the
 *    gateway fingerprint lookup is a network call that must not hold row locks.
 *    The sweep re-attributes any order this missed (crash, gateway timeout).
 *  - `onOrderCancelled`  - inside SalesService's cancel transaction.
 *  - `onGoodsReturned`   - inside the transaction that writes the OrderReturn
 *    row (returns workflow and staff "record return"), keyed on that row so a
 *    return is deducted exactly once.
 *  - `matureDue`         - the sweep: PENDING -> APPROVED once the hold is over.
 */
@Injectable()
export class AffiliateLedgerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AffiliateLedgerService.name);
  private timer: NodeJS.Timeout | null = null;
  private gateway: PaymentGateway | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AffiliateSettingsService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.sweep().catch((e) => this.logger.error(`Affiliate sweep failed: ${String(e)}`)), SWEEP_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private paymentGateway(): PaymentGateway | null {
    if (!this.gateway) {
      try {
        this.gateway = createPaymentGateway();
      } catch {
        return null;
      }
    }
    return this.gateway;
  }

  // ================================================================ placement

  /**
   * Record the payment's fingerprints (every online order - the affiliate's own
   * purchases are what a later self-referral is matched against), then
   * attribute the order if its checkout carried an affiliate click.
   */
  async afterOrderPlaced(orderId: string, gatewayPaymentId?: string | null) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, paymentMode: true, paymentFingerprints: true, checkoutSession: { select: { affiliateClickId: true } } },
    });
    if (!order) return;
    if (gatewayPaymentId && order.paymentMode === PaymentMode.ONLINE && order.paymentFingerprints.length === 0) {
      const fps = await this.paymentGateway()?.paymentFingerprints(gatewayPaymentId).catch((e) => {
        this.logger.warn(`Payment fingerprint lookup failed for order ${orderId}: ${String(e)}`);
        return [] as string[];
      });
      if (fps?.length) await this.prisma.order.update({ where: { id: orderId }, data: { paymentFingerprints: fps } });
    }
    if (order.checkoutSession?.affiliateClickId) await this.attribute(orderId);
  }

  /**
   * Decide, once, what an order is worth to the affiliate whose click it came
   * through. Idempotent: the unique AffiliateAttribution.orderId means a second
   * call (sweep racing the request) is a no-op.
   */
  async attribute(orderId: string) {
    const existing = await this.prisma.affiliateAttribution.findUnique({ where: { orderId }, select: { id: true } });
    if (existing) return;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { select: { id: true, productId: true, quantity: true, unitPrice: true, nameSnapshot: true, returns: { select: { quantity: true } } } },
        customer: { select: { id: true, phone: true, email: true, account: { select: { phone: true, email: true } } } },
        checkoutSession: { select: { affiliateClickId: true, affiliateClick: { select: { id: true, createdAt: true, affiliateId: true } } } },
      },
    });
    const click = order?.checkoutSession?.affiliateClick;
    if (!order || !click || order.status === OrderStatus.CANCELLED) return;

    const s = await this.settings.effective();
    if (!s.enabled) return;
    if (order.channel === SalesChannel.B2B && !s.applyToB2B) return;
    // The cookie lives cookieDays; a click older than that at checkout time does not count.
    if (click.createdAt.getTime() < order.orderDate.getTime() - s.cookieDays * 24 * 60 * 60_000) return;

    const affiliate = await this.prisma.affiliate.findUnique({ where: { id: click.affiliateId } });
    if (!affiliate || affiliate.status !== AffiliateStatus.APPROVED) return;

    // ---- self-referral
    const quote = (order.pricingSnapshot ?? null) as unknown as FrozenQuote | null;
    const affiliateFingerprints = affiliate.customerId
      ? (await this.prisma.order.findMany({
          where: { customerId: affiliate.customerId, NOT: { paymentFingerprints: { isEmpty: true } } },
          select: { paymentFingerprints: true },
          orderBy: { orderDate: 'desc' },
          take: 200,
        })).flatMap((o) => o.paymentFingerprints)
      : [];
    const affiliateCustomer = affiliate.customerId
      ? await this.prisma.customer.findUnique({ where: { id: affiliate.customerId }, select: { phone: true, email: true } })
      : null;
    const fraud = selfReferralReasons(
      {
        customerId: order.customerId,
        phones: [order.customer.phone, order.customer.account?.phone, quote?.address?.phone],
        emails: [order.customer.email, order.customer.account?.email],
        paymentFingerprints: order.paymentFingerprints,
      },
      {
        customerId: affiliate.customerId,
        phones: [affiliate.phone, affiliateCustomer?.phone],
        emails: [affiliate.email, affiliateCustomer?.email],
        payoutUpiId: affiliate.payoutUpiId,
        paymentFingerprints: affiliateFingerprints,
      },
    );
    if (fraud.reasons.length > 0) {
      await this.prisma.affiliateAttribution
        .create({
          data: {
            orderId, affiliateId: affiliate.id, clickId: click.id, status: AffiliateAttributionStatus.FRAUD,
            fraudReasons: fraud.reasons, fraudDetail: fraud.detail.join('; '),
          },
        })
        .catch((e) => this.ignoreDuplicate(e));
      this.logger.warn(
        `AFFILIATE FRAUD: order ${order.orderNumber} via affiliate ${affiliate.code} flagged as self-referral ` +
          `(${fraud.reasons.join(', ')}: ${fraud.detail.join('; ')}) - no commission generated`,
      );
      return;
    }

    // ---- commission per item, at its category's rate
    const products = await this.prisma.product.findMany({
      where: { id: { in: order.items.map((i) => i.productId) } },
      select: { id: true, name: true, categoryId: true },
    });
    const productById = new Map(products.map((p) => [p.id, p]));
    const [categories, rateRows] = await Promise.all([
      this.prisma.category.findMany({ select: { id: true, name: true, parentId: true } }),
      this.prisma.affiliateCategoryRate.findMany({ select: { categoryId: true, ratePercent: true } }),
    ]);
    const catMap = new Map<string, CategoryNode>(categories.map((c) => [c.id, c]));
    const rates = new Map(rateRows.map((r) => [r.categoryId, Number(r.ratePercent)]));

    // Prices from the frozen quote when there is one (what the customer was charged); else the order lines.
    const unitPriceOf = (productId: string, fallback: number) => quote?.lines.find((l) => l.productId === productId)?.unitPrice ?? fallback;
    const bases = commissionBases(
      order.items.map((i) => ({ key: i.id, quantity: i.quantity, unitPrice: unitPriceOf(i.productId, Number(i.unitPrice)) })),
      quote?.totals.couponDiscount ?? 0,
    );
    const releaseDate = releaseDateFor(order.orderDate, s.holdDays);

    const rows = order.items.map((item, idx) => {
      const product = productById.get(item.productId);
      const categoryId = product?.categoryId ?? null;
      const rate = resolveRate(categoryId, catMap, rates, s.defaultRatePercent);
      const b = bases[idx];
      const commission = commissionFor(b.base, rate.ratePercent);
      // Anything already returned before attribution ran (only possible via the sweep) is taken off up front.
      const returned = item.returns.reduce((n, r) => n + r.quantity, 0);
      const back = returned > 0
        ? deductionFor({ commissionAmount: commission, refundedAmount: 0, quantity: item.quantity, refundedQuantity: 0, returnQty: returned })
        : { quantity: 0, amount: 0, fullyRefunded: false };
      return {
        affiliateId: affiliate.id,
        orderId,
        orderItemId: item.id,
        productId: item.productId,
        productName: item.nameSnapshot ?? product?.name ?? 'Product',
        categoryId,
        categoryName: categoryId ? (catMap.get(categoryId)?.name ?? null) : null,
        quantity: item.quantity,
        unitPrice: unitPriceOf(item.productId, Number(item.unitPrice)),
        grossAmount: b.gross,
        couponShare: b.couponShare,
        baseAmount: b.base,
        ratePercent: rate.ratePercent,
        rateSource: rate.source,
        commissionAmount: commission,
        refundedQuantity: back.quantity,
        refundedAmount: back.amount,
        status: back.fullyRefunded ? AffiliateCommissionStatus.REFUNDED : AffiliateCommissionStatus.PENDING,
        releaseDate,
      };
    });
    const earning = rows.filter((r) => r.commissionAmount > 0);
    const commissionTotal = round2(earning.reduce((n, r) => n + r.commissionAmount, 0));
    const baseTotal = round2(rows.reduce((n, r) => n + r.baseAmount, 0));

    try {
      await this.prisma.$transaction(async (tx) => {
        const attribution = await tx.affiliateAttribution.create({
          data: {
            orderId, affiliateId: affiliate.id, clickId: click.id,
            status: earning.length ? AffiliateAttributionStatus.ATTRIBUTED : AffiliateAttributionStatus.NO_COMMISSION,
            baseTotal, commissionTotal,
          },
        });
        if (earning.length) {
          await tx.affiliateCommission.createMany({ data: earning.map((r) => ({ ...r, attributionId: attribution.id })) });
        }
        // A cancellation that landed between our read and this write wins.
        const now = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
        if (now?.status === OrderStatus.CANCELLED) await this.onOrderCancelled(tx, orderId);
      });
    } catch (e) {
      this.ignoreDuplicate(e);
      return;
    }
    this.logger.log(`Affiliate ${affiliate.code}: order ${order.orderNumber} attributed, ₹${commissionTotal.toFixed(2)} pending`);
  }

  private ignoreDuplicate(e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return; // already attributed
    throw e;
  }

  // ================================================================ order lifecycle

  /** Cancelled before it shipped: nothing was earned. */
  async onOrderCancelled(tx: Tx, orderId: string) {
    await tx.affiliateCommission.updateMany({
      where: { orderId, status: { in: [AffiliateCommissionStatus.PENDING, AffiliateCommissionStatus.APPROVED] } },
      data: { status: AffiliateCommissionStatus.CANCELLED, statusNote: 'Order cancelled' },
    });
  }

  /**
   * Units of one order item came back. Takes back that share of the item's
   * commission: from the pending/approved balance if not yet paid, or as a
   * clawback against the next payout if it was. A fully returned item becomes
   * REFUNDED. Keyed on the OrderReturn row - calling twice deducts once.
   */
  async onGoodsReturned(tx: Tx, ret: { id: string; orderItemId: string; quantity: number }) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM affiliate_commissions WHERE "orderItemId" = ${ret.orderItemId} FOR UPDATE`;
    if (rows.length === 0) return null;
    const c = await tx.affiliateCommission.findUniqueOrThrow({ where: { id: rows[0].id } });
    if (c.status === AffiliateCommissionStatus.CANCELLED || c.status === AffiliateCommissionStatus.REFUNDED) return null;
    if (await tx.affiliateCommissionAdjustment.findUnique({ where: { orderReturnId: ret.id } })) return null;

    const d = deductionFor({
      commissionAmount: Number(c.commissionAmount),
      refundedAmount: Number(c.refundedAmount),
      quantity: c.quantity,
      refundedQuantity: c.refundedQuantity,
      returnQty: ret.quantity,
    });
    if (d.quantity === 0) return null;
    const paid = c.status === AffiliateCommissionStatus.PAID;
    await tx.affiliateCommissionAdjustment.create({
      data: {
        commissionId: c.id, affiliateId: c.affiliateId, kind: 'RETURN', quantity: d.quantity, amount: d.amount, orderReturnId: ret.id,
        clawback: paid && d.amount > 0,
        note: `${d.quantity} of ${c.quantity} returned${paid ? ' after payout - recovered from the next payout' : ''}`,
      },
    });
    await tx.affiliateCommission.update({
      where: { id: c.id },
      data: {
        refundedQuantity: { increment: d.quantity },
        refundedAmount: { increment: d.amount },
        // A paid row stays PAID (the payout happened); the clawback carries the deduction.
        ...(d.fullyRefunded && !paid ? { status: AffiliateCommissionStatus.REFUNDED, statusNote: 'All units returned' } : {}),
      },
    });
    return d;
  }

  // ================================================================ maturity

  /** PENDING -> APPROVED for every commission past its hold. Returns how many matured. */
  async matureDue(now = new Date()) {
    const s = await this.settings.effective();
    const due = await this.prisma.affiliateCommission.findMany({
      where: { status: AffiliateCommissionStatus.PENDING, releaseDate: { lte: now } },
      select: {
        id: true, orderItemId: true, releaseDate: true,
        order: { select: { status: true, deliveredAt: true } },
      },
      take: 2000,
    });
    if (due.length === 0) return 0;
    const open = await this.prisma.returnRequest.findMany({
      where: { orderItemId: { in: due.map((d) => d.orderItemId) }, status: { in: OPEN_RETURN } },
      select: { orderItemId: true },
    });
    const openItems = new Set(open.map((o) => o.orderItemId));

    const cancelled = due.filter((d) => d.order.status === OrderStatus.CANCELLED).map((d) => d.id);
    const ready = due
      .filter((d) => canMature({
        now, releaseDate: d.releaseDate, orderStatus: d.order.status, deliveredAt: d.order.deliveredAt,
        holdFrom: s.holdFrom, holdDays: s.holdDays, openReturn: openItems.has(d.orderItemId),
      }))
      .map((d) => d.id);

    if (cancelled.length) {
      await this.prisma.affiliateCommission.updateMany({
        where: { id: { in: cancelled }, status: AffiliateCommissionStatus.PENDING },
        data: { status: AffiliateCommissionStatus.CANCELLED, statusNote: 'Order cancelled' },
      });
    }
    if (ready.length === 0) return 0;
    const res = await this.prisma.affiliateCommission.updateMany({
      where: { id: { in: ready }, status: AffiliateCommissionStatus.PENDING },
      data: { status: AffiliateCommissionStatus.APPROVED, approvedAt: now },
    });
    return res.count;
  }

  /** Mature what is due, and attribute any affiliate order the request path missed. */
  async sweep() {
    await this.matureDue();
    const missed = await this.prisma.order.findMany({
      where: {
        affiliateAttribution: null,
        status: { not: OrderStatus.CANCELLED },
        checkoutSession: { affiliateClickId: { not: null } },
        orderDate: { gte: new Date(Date.now() - 60 * 24 * 60 * 60_000) },
      },
      select: { id: true },
      take: 100,
    });
    for (const o of missed) {
      await this.attribute(o.id).catch((e) => this.logger.warn(`Affiliate attribution retry failed for ${o.id}: ${String(e)}`));
    }
  }
}
