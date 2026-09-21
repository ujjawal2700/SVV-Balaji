import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  CoinTransactionReason,
  CustomerType,
  LoyaltyEligibility,
  LoyaltySettings,
  OrderStatus,
  Prisma,
  SalesChannel,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { maxRedeemablePoints } from '../checkout/checkout.calculator';
import {
  CalcLine,
  EligibilitySetting,
  LoyaltyRules,
  computeEarn,
  resolveEligibility,
  reversalDelta,
} from './loyalty.calculator';
import { UpdateLoyaltySettingsDto } from './dto/loyalty.dto';

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (d: unknown) => (d === null || d === undefined ? null : Number(d));

/** How often the catch-up sweep and the expiry run. Both are idempotent. */
const HOUSEKEEPING_INTERVAL_MS = 60 * 60 * 1000;

const PRODUCT_LOYALTY_SELECT = {
  id: true,
  name: true,
  mrp: true,
  loyaltyEligibility: true,
  category: {
    select: {
      name: true,
      loyaltyEligibility: true,
      parent: { select: { loyaltyEligibility: true } },
    },
  },
} satisfies Prisma.ProductSelect;

type ProductForLoyalty = Prisma.ProductGetPayload<{ select: typeof PRODUCT_LOYALTY_SELECT }>;

/**
 * Loyalty rewards: percentage-based, configured by Super Admin, credited when
 * an order is DELIVERED, reversed when delivered items come back.
 *
 * Points live in the existing coin ledger (`CoinTransaction`,
 * `Customer.coinBalance`). One currency, one balance - a customer's referral
 * coins and loyalty points are the same thing, told apart by the ledger reason.
 * The invariant this project holds everywhere still holds: a balance never
 * moves without a ledger row explaining why, written in the same transaction.
 */
@Injectable()
export class LoyaltyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LoyaltyService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Create the settings row NOW so `earningStartsAt` is the deploy moment:
    // the catch-up sweep must never retro-pay orders delivered before this existed.
    await this.getSettings();
    const run = () =>
      this.housekeeping().catch((err) =>
        this.logger.error(`Loyalty housekeeping failed: ${err instanceof Error ? err.message : String(err)}`),
      );
    setTimeout(run, 15_000).unref();
    this.timer = setInterval(run, HOUSEKEEPING_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // --- Settings ---------------------------------------------------------------

  async getSettings(client: Prisma.TransactionClient | PrismaService = this.prisma): Promise<LoyaltySettings> {
    const existing = await client.loyaltySettings.findFirst({ orderBy: { createdAt: 'asc' } });
    return existing ?? client.loyaltySettings.create({ data: {} });
  }

  async updateSettings(dto: UpdateLoyaltySettingsDto, updatedById: string): Promise<LoyaltySettings> {
    const current = await this.getSettings();

    for (const [label, value] of [
      ['B2C percentage', dto.earnPercentB2C],
      ['B2B percentage', dto.earnPercentB2B],
    ] as const) {
      if (value !== undefined && (value < 0 || value > 100)) {
        throw new BadRequestException(`${label} must be between 0 and 100`);
      }
    }
    if (dto.pointValueInr !== undefined && dto.pointValueInr <= 0) {
      throw new BadRequestException('One point must be worth more than Rs 0');
    }

    return this.prisma.loyaltySettings.update({
      where: { id: current.id },
      data: { ...dto, pointsExpiryMonths: dto.pointsExpiryMonths === 0 ? null : dto.pointsExpiryMonths, updatedById },
    });
  }

  rulesFor(settings: LoyaltySettings, channel: SalesChannel): LoyaltyRules {
    return {
      isActive: settings.isActive,
      earnPercent: Number(channel === SalesChannel.B2B ? settings.earnPercentB2B : settings.earnPercentB2C),
      pointValueInr: Number(settings.pointValueInr),
      calculationBase: settings.calculationBase,
      defaultEligible: settings.defaultEligible,
      appliesToDiscountedProducts: settings.appliesToDiscountedProducts,
      minEligibleItemAmount: num(settings.minEligibleItemAmount),
      minEligibleOrderAmount: num(settings.minEligibleOrderAmount),
      maxRewardPerOrderInr: num(settings.maxRewardPerOrderInr),
    };
  }

  private eligibilityInputs(product: ProductForLoyalty) {
    return {
      productEligibility: product.loyaltyEligibility as EligibilitySetting,
      categoryEligibility: (product.category?.loyaltyEligibility ?? null) as EligibilitySetting | null,
      parentCategoryEligibility: (product.category?.parent?.loyaltyEligibility ?? null) as EligibilitySetting | null,
    };
  }

  // --- Earning (order DELIVERED) ------------------------------------------------

  /**
   * Credit the points for a delivered order. Idempotent: `LoyaltyOrderEarn` is
   * unique on `orderId`, so calling this twice (the delivery hook AND the
   * catch-up sweep, or two API instances) can never pay twice.
   *
   * Always records an earn row - even for an order that earns nothing - so
   * "why no points on my order?" has a stored answer (`skipReason`, or the
   * ineligible reason on each line).
   */
  async creditForDeliveredOrder(orderId: string): Promise<{ credited: boolean; points: number }> {
    const already = await this.prisma.loyaltyOrderEarn.findUnique({ where: { orderId } });
    if (already) return { credited: false, points: already.points };

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { product: { select: PRODUCT_LOYALTY_SELECT }, returns: { select: { quantity: true } } } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('Loyalty points are only credited once an order is delivered');
    }

    const settings = await this.getSettings();
    const rules = this.rulesFor(settings, order.channel);

    // An item returned before its points were ever credited (possible if the
    // hook and the return race) must not earn for the returned quantity.
    const lines: CalcLine[] = order.items
      .map((item) => {
        const returned = item.returns.reduce((n, r) => n + r.quantity, 0);
        const kept = Math.max(0, item.quantity - returned);
        if (kept === 0) return null;
        const scale = kept / item.quantity;
        return {
          key: item.id,
          quantity: kept,
          unitPrice: Number(item.unitPrice),
          gstRatePercent: Number(item.gstRatePercent),
          // Net of the coupon / points discount: rewards are earned on what was actually paid for the goods.
          lineSubtotal: round2((Number(item.lineSubtotal) - Number(item.lineDiscount ?? 0)) * scale),
          lineTotal: round2(Number(item.lineTotal) * scale),
          mrp: num(item.product.mrp),
          ...this.eligibilityInputs(item.product),
        };
      })
      .filter((l): l is CalcLine => l !== null);

    const result = computeEarn(rules, lines);
    const itemById = new Map(order.items.map((i) => [i.id, i]));
    const expiresAt =
      settings.pointsExpiryMonths && settings.pointsExpiryMonths > 0
        ? addMonths(order.deliveredAt ?? new Date(), settings.pointsExpiryMonths)
        : null;

    try {
      await this.prisma.$transaction(async (tx) => {
        const earn = await tx.loyaltyOrderEarn.create({
          data: {
            orderId: order.id,
            customerId: order.customerId,
            eligibleAmount: result.eligibleAmount,
            percentApplied: rules.earnPercent,
            pointValueApplied: rules.pointValueInr,
            calculationBase: rules.calculationBase,
            rewardInr: result.rewardInr,
            points: result.points,
            cappedByMax: result.cappedByMax,
            skipReason: result.skipReason,
            lines: {
              create: result.lines.map((l) => ({
                orderItemId: l.key,
                productId: itemById.get(l.key)!.productId,
                quantity: lines.find((x) => x.key === l.key)!.quantity,
                baseAmount: l.baseAmount,
                eligible: l.eligible,
                ineligibleReason: l.ineligibleReason,
                eligibilitySource: l.eligibilitySource,
                points: l.points,
              })),
            },
          },
        });

        if (result.points > 0) {
          const coin = await tx.coinTransaction.create({
            data: {
              customerId: order.customerId,
              amount: result.points,
              reason: CoinTransactionReason.LOYALTY_EARN,
              orderId: order.id,
              expiresAt,
              remainingAmount: result.points,
              note: `${rules.earnPercent}% of Rs ${result.eligibleAmount.toFixed(2)} eligible on ${order.orderNumber}`,
            },
          });
          await tx.customer.update({
            where: { id: order.customerId },
            data: { coinBalance: { increment: result.points } },
          });
          await tx.loyaltyOrderEarn.update({ where: { id: earn.id }, data: { coinTransactionId: coin.id } });
        }
      });
    } catch (error) {
      // A concurrent credit won the unique(orderId) race: that is the correct outcome.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { credited: false, points: 0 };
      }
      throw error;
    }

    return { credited: true, points: result.points };
  }

  // --- Reversal (delivered items returned/refunded) -------------------------------

  /**
   * Take back the points earned by returned items. Called by SalesService inside
   * the same transaction that records the return, so a return and its reversal
   * are all-or-nothing.
   *
   * Proportional to the quantity returned (`reversalDelta`). Points that have
   * already EXPIRED are not debited a second time - `remainingAmount` on the
   * earn row is what is actually still live - though the line still records the
   * full reversal so it can never be reversed again.
   */
  async reverseForReturn(
    tx: Prisma.TransactionClient,
    orderId: string,
    orderItemIds: string[],
  ): Promise<{ pointsReversed: number }> {
    const earn = await tx.loyaltyOrderEarn.findUnique({
      where: { orderId },
      include: { lines: { where: { orderItemId: { in: orderItemIds } } } },
    });
    if (!earn) return { pointsReversed: 0 }; // not credited yet; the credit itself nets returns out

    let pointsReversed = 0;
    for (const line of earn.lines) {
      const returned = await tx.orderReturn.aggregate({
        where: { orderItemId: line.orderItemId },
        _sum: { quantity: true },
      });
      const delta = reversalDelta(line.points, line.quantity, returned._sum.quantity ?? 0, line.reversedPoints);
      if (delta <= 0) continue;

      await tx.loyaltyOrderEarnLine.update({
        where: { id: line.id },
        data: { reversedPoints: { increment: delta } },
      });

      if (!earn.coinTransactionId) continue;
      const source = await tx.coinTransaction.findUnique({ where: { id: earn.coinTransactionId } });
      const debit = Math.min(delta, source?.remainingAmount ?? 0);
      if (debit <= 0) continue;

      await tx.coinTransaction.update({
        where: { id: earn.coinTransactionId },
        data: { remainingAmount: { decrement: debit } },
      });
      await tx.coinTransaction.create({
        data: {
          customerId: earn.customerId,
          amount: -debit,
          reason: CoinTransactionReason.LOYALTY_REVERSAL,
          orderId,
          note: 'Eligible item returned/refunded',
        },
      });
      await tx.customer.update({ where: { id: earn.customerId }, data: { coinBalance: { decrement: debit } } });
      pointsReversed += debit;
    }
    return { pointsReversed };
  }

  // --- Redemption (points spent at checkout) ----------------------------------------

  /** What a customer could spend on an order worth `payableBase` (rupees, goods after coupon). */
  async redemptionOffer(customerId: string, payableBase: number) {
    const settings = await this.getSettings();
    const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id: customerId }, select: { coinBalance: true } });
    const pointValueInr = Number(settings.pointValueInr);
    const enabled = settings.isActive && settings.redemptionEnabled;
    return {
      enabled,
      balance: customer.coinBalance,
      pointValueInr,
      minPoints: settings.minRedeemPoints,
      maxPercent: settings.maxRedemptionPercent,
      maxPoints: enabled
        ? maxRedeemablePoints({
            balance: customer.coinBalance,
            payableBase,
            maxPercent: settings.maxRedemptionPercent,
            pointValueInr,
            minPoints: settings.minRedeemPoints,
          })
        : 0,
    };
  }

  /**
   * Spend points on an order, inside the order's transaction. The conditional
   * balance update is the race guard (two checkouts cannot both spend the same
   * points), and the points are drawn from the soonest-expiring earned lots
   * first so a redeemed point can never be "expired" a second time later.
   */
  async redeemForOrder(tx: Prisma.TransactionClient, input: { customerId: string; orderId: string; points: number; valueInr: number }) {
    if (input.points <= 0) return;
    const res = await tx.customer.updateMany({
      where: { id: input.customerId, coinBalance: { gte: input.points } },
      data: { coinBalance: { decrement: input.points } },
    });
    if (res.count === 0) throw new BadRequestException('You no longer have enough loyalty points for this redemption');

    let left = input.points;
    const lots = await tx.coinTransaction.findMany({
      where: { customerId: input.customerId, reason: CoinTransactionReason.LOYALTY_EARN, remainingAmount: { gt: 0 } },
      orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    });
    for (const lot of lots) {
      if (left <= 0) break;
      const take = Math.min(left, lot.remainingAmount ?? 0);
      await tx.coinTransaction.update({ where: { id: lot.id }, data: { remainingAmount: { decrement: take } } });
      left -= take;
    }

    await tx.coinTransaction.create({
      data: {
        customerId: input.customerId,
        amount: -input.points,
        reason: CoinTransactionReason.LOYALTY_REDEMPTION,
        orderId: input.orderId,
        note: `Redeemed ${input.points} points (Rs ${input.valueInr.toFixed(2)}) at checkout`,
      },
    });
  }

  /** Cancelled before delivery: hand the spent points back (once). */
  async refundRedemptionForOrder(tx: Prisma.TransactionClient, orderId: string): Promise<number> {
    const rows = await tx.coinTransaction.findMany({
      where: { orderId, reason: { in: [CoinTransactionReason.LOYALTY_REDEMPTION, CoinTransactionReason.LOYALTY_REDEMPTION_REFUND] } },
    });
    const spent = -rows.filter((r) => r.reason === CoinTransactionReason.LOYALTY_REDEMPTION).reduce((n, r) => n + r.amount, 0);
    const refunded = rows.filter((r) => r.reason === CoinTransactionReason.LOYALTY_REDEMPTION_REFUND).reduce((n, r) => n + r.amount, 0);
    const owed = spent - refunded;
    if (owed <= 0) return 0;
    const customerId = rows[0].customerId;
    await tx.coinTransaction.create({
      data: {
        customerId,
        amount: owed,
        reason: CoinTransactionReason.LOYALTY_REDEMPTION_REFUND,
        orderId,
        note: 'Order cancelled - redeemed points returned',
      },
    });
    await tx.customer.update({ where: { id: customerId }, data: { coinBalance: { increment: owed } } });
    return owed;
  }

  // --- Expiry & catch-up ------------------------------------------------------------

  /**
   * Lapse earned points past their `expiresAt`. Never takes a balance below
   * zero (referral coins and manual adjustments share it), and marks the earn
   * row's `remainingAmount` 0 either way so it is processed exactly once.
   */
  async expireDue(customerId?: string, now = new Date()): Promise<number> {
    const due = await this.prisma.coinTransaction.findMany({
      where: {
        reason: CoinTransactionReason.LOYALTY_EARN,
        expiresAt: { lte: now },
        remainingAmount: { gt: 0 },
        ...(customerId ? { customerId } : {}),
      },
      orderBy: { expiresAt: 'asc' },
      take: 500,
    });

    let total = 0;
    for (const row of due) {
      await this.prisma.$transaction(async (tx) => {
        const fresh = await tx.coinTransaction.findUnique({ where: { id: row.id } });
        if (!fresh || !fresh.remainingAmount || fresh.remainingAmount <= 0) return;
        const customer = await tx.customer.findUniqueOrThrow({ where: { id: fresh.customerId } });
        const lapse = Math.min(fresh.remainingAmount, Math.max(0, customer.coinBalance));

        await tx.coinTransaction.update({ where: { id: fresh.id }, data: { remainingAmount: 0 } });
        if (lapse > 0) {
          await tx.coinTransaction.create({
            data: {
              customerId: fresh.customerId,
              amount: -lapse,
              reason: CoinTransactionReason.LOYALTY_EXPIRY,
              orderId: fresh.orderId,
              note: 'Points expired',
            },
          });
          await tx.customer.update({ where: { id: fresh.customerId }, data: { coinBalance: { decrement: lapse } } });
          total += lapse;
        }
      });
    }
    return total;
  }

  /** Credit delivered orders whose hook call failed. Only orders delivered since the program started. */
  async sweepDelivered(limit = 200): Promise<number> {
    const settings = await this.getSettings();
    const missing = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.DELIVERED,
        deliveredAt: { gte: settings.earningStartsAt },
        loyaltyEarn: null,
      },
      select: { id: true, orderNumber: true },
      orderBy: { deliveredAt: 'asc' },
      take: limit,
    });

    let credited = 0;
    for (const order of missing) {
      try {
        const res = await this.creditForDeliveredOrder(order.id);
        if (res.credited) credited += 1;
      } catch (error) {
        this.logger.warn(`Sweep could not credit ${order.orderNumber}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return credited;
  }

  async housekeeping(): Promise<{ credited: number; expired: number }> {
    const credited = await this.sweepDelivered();
    const expired = await this.expireDue();
    if (credited || expired) this.logger.log(`Loyalty housekeeping: ${credited} order(s) credited, ${expired} point(s) expired`);
    return { credited, expired };
  }

  // --- Customer view -----------------------------------------------------------------

  async summaryForCustomer(customerId: string, channel: SalesChannel) {
    await this.expireDue(customerId); // so the balance shown is the balance held
    const settings = await this.getSettings();
    const rules = this.rulesFor(settings, channel);
    const customer = await this.prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      select: { coinBalance: true },
    });

    const soonCutoff = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const [history, lifetime, expiring] = await Promise.all([
      this.prisma.coinTransaction.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { order: { select: { orderNumber: true } } },
      }),
      this.prisma.coinTransaction.aggregate({
        where: { customerId, amount: { gt: 0 } },
        _sum: { amount: true },
      }),
      this.prisma.coinTransaction.aggregate({
        where: {
          customerId,
          reason: CoinTransactionReason.LOYALTY_EARN,
          remainingAmount: { gt: 0 },
          expiresAt: { gt: new Date(), lte: soonCutoff },
        },
        _sum: { remainingAmount: true },
        _min: { expiresAt: true },
      }),
    ]);

    return {
      enabled: settings.isActive && rules.earnPercent > 0,
      balance: customer.coinBalance,
      balanceValueInr: round2(customer.coinBalance * rules.pointValueInr),
      lifetimeEarned: lifetime._sum.amount ?? 0,
      program: {
        earnPercent: rules.earnPercent,
        pointValueInr: rules.pointValueInr,
        expiryMonths: settings.pointsExpiryMonths ?? null,
        minEligibleOrderAmount: rules.minEligibleOrderAmount,
        maxRewardPerOrderInr: rules.maxRewardPerOrderInr,
        appliesToDiscountedProducts: rules.appliesToDiscountedProducts,
        calculationBase: rules.calculationBase,
      },
      expiringSoon: expiring._sum.remainingAmount
        ? { points: expiring._sum.remainingAmount, on: expiring._min.expiresAt }
        : null,
      history: history.map((h) => ({
        id: h.id,
        type: h.reason,
        points: h.amount,
        orderNumber: h.order?.orderNumber ?? null,
        note: h.note,
        expiresAt: h.expiresAt,
        createdAt: h.createdAt,
      })),
    };
  }

  // --- Preview (product page / cart / checkout) --------------------------------------

  /**
   * What a basket would earn RIGHT NOW, priced exactly as the order engine will
   * price it. The customer app shows this instead of doing any arithmetic of
   * its own, so a change made in the admin panel shows up on the next request.
   */
  async estimate(
    input: Array<{ productId: string; quantity: number }>,
    channel: SalesChannel,
    customerType?: CustomerType,
  ) {
    const settings = await this.getSettings();
    const rules = this.rulesFor(settings, channel);
    // Price rules can be channel-wide (no customer type) or specific to one.
    // Naming a type matches BOTH kinds; naming none matches only the channel-wide
    // ones - so default to the storefront's own audience for the channel.
    const priceAs = customerType ?? (channel === SalesChannel.B2B ? CustomerType.RETAILER : CustomerType.CONSUMER);
    const products = await this.prisma.product.findMany({
      where: { id: { in: input.map((i) => i.productId) } },
      select: PRODUCT_LOYALTY_SELECT,
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    const lines: CalcLine[] = [];
    const unpriced: string[] = [];
    for (const item of input) {
      const product = byId.get(item.productId);
      if (!product || item.quantity <= 0) continue;
      try {
        const price = await this.pricing.resolve({
          productId: item.productId,
          channel,
          customerType: priceAs,
          quantity: item.quantity,
        });
        const subtotal = round2(price.unitPrice * item.quantity);
        const tax = round2((subtotal * price.gstRatePercent) / 100);
        lines.push({
          key: item.productId,
          quantity: item.quantity,
          unitPrice: price.unitPrice,
          gstRatePercent: price.gstRatePercent,
          lineSubtotal: subtotal,
          lineTotal: round2(subtotal + tax),
          mrp: num(product.mrp),
          ...this.eligibilityInputs(product),
        });
      } catch {
        unpriced.push(item.productId);
      }
    }

    const result = computeEarn(rules, lines);
    return {
      enabled: settings.isActive && rules.earnPercent > 0,
      earnPercent: rules.earnPercent,
      pointValueInr: rules.pointValueInr,
      points: result.points,
      rewardInr: result.rewardInr,
      eligibleAmount: result.eligibleAmount,
      skipReason: result.skipReason,
      cappedByMax: result.cappedByMax,
      lines: result.lines.map((l) => ({
        productId: l.key,
        eligible: l.eligible,
        reason: l.ineligibleReason,
        points: l.points,
      })),
      unpriced,
    };
  }

  // --- Admin views -------------------------------------------------------------------

  /** Resolve eligibility for a product form: what will a product with this setting in this category actually do? */
  async previewEligibility(productEligibility: LoyaltyEligibility, categoryId?: string) {
    const settings = await this.getSettings();
    const category = categoryId
      ? await this.prisma.category.findUnique({
          where: { id: categoryId },
          select: { name: true, loyaltyEligibility: true, parent: { select: { name: true, loyaltyEligibility: true } } },
        })
      : null;
    const resolved = resolveEligibility(
      productEligibility,
      (category?.loyaltyEligibility ?? null) as EligibilitySetting | null,
      (category?.parent?.loyaltyEligibility ?? null) as EligibilitySetting | null,
      settings.defaultEligible,
    );
    return { eligible: resolved.eligible, source: resolved.source, programActive: settings.isActive };
  }

  /** The stored, frozen explanation of what an order earned (or why it earned nothing). */
  async orderBreakdown(orderNumber: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      select: { id: true, orderNumber: true, status: true, deliveredAt: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    const earn = await this.prisma.loyaltyOrderEarn.findUnique({
      where: { orderId: order.id },
      include: { lines: { include: { orderItem: { select: { product: { select: { name: true, sku: true } } } } } } },
    });
    const returns = await this.prisma.orderReturn.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: 'asc' },
      include: { orderItem: { select: { product: { select: { name: true } } } }, recordedBy: { select: { fullName: true } } },
    });
    const ledger = await this.prisma.coinTransaction.findMany({
      where: { orderId: order.id, reason: { in: ['LOYALTY_EARN', 'LOYALTY_REVERSAL', 'LOYALTY_EXPIRY'] } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, reason: true, amount: true, note: true, createdAt: true },
    });

    return {
      orderNumber: order.orderNumber,
      status: order.status,
      credited: earn !== null,
      earn: earn && {
        eligibleAmount: Number(earn.eligibleAmount),
        percentApplied: Number(earn.percentApplied),
        pointValueApplied: Number(earn.pointValueApplied),
        calculationBase: earn.calculationBase,
        rewardInr: Number(earn.rewardInr),
        points: earn.points,
        cappedByMax: earn.cappedByMax,
        skipReason: earn.skipReason,
        lines: earn.lines.map((l) => ({
          product: l.orderItem.product.name,
          sku: l.orderItem.product.sku,
          quantity: l.quantity,
          baseAmount: Number(l.baseAmount),
          eligible: l.eligible,
          ineligibleReason: l.ineligibleReason,
          eligibilitySource: l.eligibilitySource,
          points: l.points,
          reversedPoints: l.reversedPoints,
        })),
      },
      returns: returns.map((r) => ({
        product: r.orderItem.product.name,
        quantity: r.quantity,
        reason: r.reason,
        refundAmount: num(r.refundAmount),
        recordedBy: r.recordedBy.fullName,
        createdAt: r.createdAt,
      })),
      ledger,
    };
  }
}

function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d;
}
