import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CheckoutSessionStatus,
  Customer,
  CustomerType,
  OrderStatus,
  PaymentMode,
  PaymentStatus,
  PaymentTerms,
  PaymentTransactionStatus,
  Prisma,
  SalesChannel,
} from '@prisma/client';
import { randomInt } from 'node:crypto';
import { SequenceService } from '../common/sequence.service';
import { WalletService } from '../wallet/wallet.service';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrderEventsService } from '../realtime/order-events.service';
import { SalesService } from '../sales/sales.service';
import { AddressesService, type AddressSnapshot } from './addresses.service';
import { deliveryFeeFor, etaWindow, priceCart, type Method } from './checkout.calculator';
import { CheckoutSettingsService, type EffectiveCheckoutSettings } from './checkout-settings.service';
import { CouponsService, type AppliedCoupon } from './coupons.service';
import { FulfillmentRouterService, type Route } from './fulfillment-router.service';
import { ZonesService, type QuickDecision } from '../delivery/zones/zones.service';
import { quickFee } from '../delivery/zones/zone.logic';
import { PAYMENT_GATEWAY, type PaymentGateway } from './payment/payment-gateway';
import { OutOfStockException } from './stock-holds';
import { StockReservationService } from './stock-reservation.service';
import type { CheckoutDto, ConfirmCheckoutDto } from './dto/checkout.dto';

/** What the server decided, frozen on the session and then on the order. */
export interface StoredQuote {
  channel: SalesChannel;
  address: AddressSnapshot;
  fulfillment: {
    method: Method;
    /** QUICK only when the customer chose it and the zone could promise it. */
    speed: 'STANDARD' | 'QUICK';
    zoneId: string | null;
    zoneName: string | null;
    nodeId: string;
    nodeName: string;
    nodeKind: string;
    branchId: string;
    distanceKm: number | null;
    etaMin: string;
    etaMax: string;
    etaLabel: string;
    reason: string;
  };
  /** Both choices, so the customer can switch. `quick` is null when the option is not shown at all. */
  deliveryOptions: {
    standard: { method: Method; etaLabel: string; fee: number; reason: string };
    quick: { available: boolean; reason: string; etaLabel: string | null; fee: number | null; zoneName: string | null } | null;
  };
  lines: Array<{
    productId: string; name: string; sku: string; image: string | null;
    quantity: number; unitPrice: number; gstRatePercent: number; priceListId: string | null;
    gross: number; discount: number; taxable: number; tax: number; total: number;
  }>;
  totals: {
    subtotal: number; couponDiscount: number; loyaltyDiscount: number; referralDiscount: number; discount: number;
    taxable: number; tax: number; deliveryFee: number; totalPayable: number;
  };
  coupon: { code: string; discount: number } | null;
  loyalty: {
    enabled: boolean; balance: number; pointValueInr: number;
    redeemPoints: number; maxPoints: number; minPoints: number;
  };
  referral: {
    enabled: boolean; balance: number; pointValueInr: number;
    redeemPoints: number; maxPoints: number; minPoints: number;
  };
  /** Which redemption mode this quote was priced under, and the pooled figures when COMBINED. */
  wallet: {
    mode: 'SEPARATE' | 'COMBINED';
    combined: {
      enabled: boolean; balance: number; pointValueInr: number;
      maxPoints: number; minPoints: number; redeemPoints: number;
    } | null;
  };
  payment: {
    mode: PaymentMode;
    allowedModes: PaymentMode[];
    codUnavailableReason: string | null;
    creditUnavailableReason: string | null;
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const MAX_LINES = 50;
const LOCAL_RETRIES = 3;

/**
 * Storefront checkout: quote -> hold stock -> pay -> place the order.
 *
 * The one rule that shapes all of it: NOTHING the client sends is trusted for
 * money or routing. Prices come from the price list, tax from the product,
 * discounts from the coupon/points rules, the fee and the delivery method from
 * the address and settings. The client sends product ids, quantities, an
 * address id, an optional coupon code and a points count - and, optionally, the
 * total it was shown, which is used only to notice that the price moved.
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly pricing: PricingService,
    private readonly settings: CheckoutSettingsService,
    private readonly router: FulfillmentRouterService,
    private readonly addresses: AddressesService,
    private readonly coupons: CouponsService,
    private readonly wallet: WalletService,
    private readonly reservations: StockReservationService,
    private readonly sales: SalesService,
    private readonly events: OrderEventsService,
    private readonly zones: ZonesService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  // ------------------------------------------------------------------- quote

  /**
   * Price, route and validate a cart. Read-only: takes no stock. Anything wrong
   * (unavailable item, quantity limit, bad coupon, ...) is a 400 that says what.
   */
  async quote(customer: Customer, dto: CheckoutDto, opts: { excludeNodeIds?: string[] } = {}): Promise<StoredQuote> {
    const settings = await this.settings.effective();
    const channel = customer.channel;
    const b2b = channel === SalesChannel.B2B;

    if (b2b && !customer.gstin) {
      throw new BadRequestException('A GSTIN is required on your business account before placing bulk orders');
    }

    // 1. Items: merge duplicates, enforce shape.
    const merged = new Map<string, number>();
    for (const i of dto.items) merged.set(i.productId, (merged.get(i.productId) ?? 0) + i.quantity);
    if (merged.size === 0) throw new BadRequestException('Your cart is empty');
    if (merged.size > MAX_LINES) throw new BadRequestException(`A single order can have up to ${MAX_LINES} different products`);
    const items = [...merged].map(([productId, quantity]) => ({ productId, quantity }));

    // 2. Products must be live on the storefront, within the order limits.
    const products = await this.prisma.product.findMany({
      where: { id: { in: items.map((i) => i.productId) } },
      select: {
        id: true, name: true, sku: true, isActive: true, showOnStorefront: true, images: true,
        minOrderQuantity: true, maxOrderQuantity: true, moqB2B: true, maxOrderQuantityB2B: true,
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const i of items) {
      const p = byId.get(i.productId);
      if (!p || !p.isActive || !p.showOnStorefront) throw new BadRequestException('An item in your cart is no longer available');
      const [min, max] = b2b ? [p.moqB2B, p.maxOrderQuantityB2B] : [p.minOrderQuantity, p.maxOrderQuantity];
      if (min && i.quantity < min) throw new BadRequestException(`${p.name}: minimum order is ${min}`);
      if (max && i.quantity > max) throw new BadRequestException(`${p.name}: maximum order is ${max}`);
    }

    // 3. Address (provably the customer's), then WHERE and HOW it ships.
    const address = await this.addresses.mine(customer.id, dto.addressId);
    const snapshot = this.addresses.toSnapshot(address);
    // Quick Delivery is decided by the customer's zone (src/delivery); the
    // normal routing below stays the answer whenever Quick is not chosen or
    // not possible. B2B bulk never goes Quick.
    const quick: QuickDecision | null = b2b
      ? null
      : await this.zones.quickDecision(this.prisma, {
          address: { latitude: snapshot.latitude, longitude: snapshot.longitude, pincode: snapshot.pincode },
          items,
          goodsTotal: null,
          excludeNodeIds: opts.excludeNodeIds,
        });
    const wantQuick = dto.deliverySpeed === 'QUICK';
    if (wantQuick && !quick?.available) {
      throw new ConflictException({ code: 'QUICK_UNAVAILABLE', message: quick?.reason ?? 'Quick Delivery is not available for business orders' });
    }
    const standardRoute = await this.router.resolve(
      this.prisma,
      { b2b, address: snapshot, items, excludeNodeIds: opts.excludeNodeIds, courierOnly: quick?.zone?.fallback === 'COURIER' },
      settings,
    );
    const route: Route = wantQuick
      ? { method: 'LOCAL', node: quick!.node!, distanceKm: quick!.distanceKm, reason: quick!.reason, considered: [] }
      : standardRoute;

    // 4. Prices from the price lists, in this customer's channel.
    const priced = await Promise.all(
      items.map(async (i) => {
        const price = await this.pricing.resolve({ productId: i.productId, channel, customerType: customer.type as CustomerType, quantity: i.quantity });
        return { ...i, unitPrice: price.unitPrice, gstRatePercent: price.gstRatePercent, priceListId: price.priceListId };
      }),
    );
    const grossSubtotal = round2(priced.reduce((n, l) => n + l.unitPrice * l.quantity, 0));

    // 5. Coupon (server-validated against the server's subtotal).
    let coupon: AppliedCoupon | null = null;
    if (dto.couponCode?.trim()) {
      coupon = await this.coupons.validate(this.prisma, { code: dto.couponCode, customerId: customer.id, channel, subtotal: grossSubtotal });
    }
    const couponDiscount = coupon?.discount ?? 0;

    // 6. Wallet coins spent - referral and loyalty, only if their program allows it, never more
    // than their caps. Mode (SEPARATE vs COMBINED) comes from Super Admin's wallet settings.
    const offer = await this.wallet.redemptionOffer(customer.id, grossSubtotal - couponDiscount);
    const loyaltyPool = offer.pools.find((p) => p.source === 'LOYALTY')!;
    const referralPool = offer.pools.find((p) => p.source === 'REFERRAL')!;
    const wantedLoyalty = Math.max(0, Math.floor(dto.redeemPoints ?? 0));
    const wantedReferral = Math.max(0, Math.floor(dto.redeemReferralPoints ?? 0));

    let appliedLoyaltyPoints = 0;
    let appliedReferralPoints = 0;
    let loyaltyDiscount = 0;
    let referralDiscount = 0;

    if (offer.mode === 'SEPARATE') {
      if (wantedLoyalty > 0) {
        if (!loyaltyPool.enabled) throw new BadRequestException('Loyalty points cannot be redeemed right now');
        if (wantedLoyalty > loyaltyPool.balance) throw new BadRequestException('You do not have that many loyalty points');
        if (wantedLoyalty < loyaltyPool.minPoints) throw new BadRequestException(`Redeem at least ${loyaltyPool.minPoints} loyalty points`);
        if (wantedLoyalty > loyaltyPool.maxPoints) throw new BadRequestException(`You can redeem at most ${loyaltyPool.maxPoints} loyalty points on this order`);
        appliedLoyaltyPoints = wantedLoyalty;
        loyaltyDiscount = round2(wantedLoyalty * loyaltyPool.pointValueInr);
      }
      if (wantedReferral > 0) {
        if (!referralPool.enabled) throw new BadRequestException('Referral coins cannot be redeemed right now');
        if (wantedReferral > referralPool.balance) throw new BadRequestException('You do not have that many referral coins');
        if (wantedReferral < referralPool.minPoints) throw new BadRequestException(`Redeem at least ${referralPool.minPoints} referral coins`);
        if (wantedReferral > referralPool.maxPoints) throw new BadRequestException(`You can redeem at most ${referralPool.maxPoints} referral coins on this order`);
        appliedReferralPoints = wantedReferral;
        referralDiscount = round2(wantedReferral * referralPool.pointValueInr);
      }
    } else {
      // COMBINED: one pooled balance and cap - the customer spends a single
      // number (redeemPoints), the server decides how much comes from each pool.
      if (wantedReferral > 0) {
        throw new BadRequestException('The wallet is in combined mode - send the total to spend as redeemPoints');
      }
      const combined = offer.combined!;
      if (wantedLoyalty > 0) {
        if (!combined.enabled) throw new BadRequestException('Wallet coins cannot be redeemed right now');
        if (wantedLoyalty > combined.balance) throw new BadRequestException('You do not have that many wallet coins');
        if (wantedLoyalty < combined.minPoints) throw new BadRequestException(`Redeem at least ${combined.minPoints} wallet coins`);
        if (wantedLoyalty > combined.maxPoints) throw new BadRequestException(`You can redeem at most ${combined.maxPoints} wallet coins on this order`);
        const split = await this.wallet.splitCombinedPoints(customer.id, wantedLoyalty);
        appliedLoyaltyPoints = split.loyaltyPoints;
        appliedReferralPoints = split.referralPoints;
        const totalDiscount = round2(wantedLoyalty * combined.pointValueInr);
        loyaltyDiscount = round2(appliedLoyaltyPoints * combined.pointValueInr);
        referralDiscount = round2(totalDiscount - loyaltyDiscount);
      }
    }
    const walletDiscount = round2(loyaltyDiscount + referralDiscount);

    // 7. Fee depends on the goods total AFTER discounts; then final figures.
    const lineInputs = priced.map((l) => ({ key: l.productId, quantity: l.quantity, unitPrice: l.unitPrice, gstRatePercent: l.gstRatePercent }));
    const goods = priceCart(lineInputs, couponDiscount + walletDiscount, 0);
    const standardFee = deliveryFeeFor(standardRoute.method, b2b, goods.goodsTotal, settings.fees);
    const quickFeeValue = quick?.feeRule ? quickFee(goods.goodsTotal, quick.feeRule.fee, quick.feeRule.freeAbove) : null;
    const fee = wantQuick ? quickFeeValue! : standardFee;
    const cart = priceCart(lineInputs, couponDiscount + walletDiscount, fee);

    // 8. Which payment modes may be used, and which is selected.
    const payment = await this.paymentOptions(customer, cart.totalPayable, settings);
    const mode = dto.paymentMode ?? payment.defaultMode;
    if (!payment.allowedModes.includes(mode)) {
      const why = mode === PaymentMode.COD ? payment.codUnavailableReason : mode === PaymentMode.CREDIT ? payment.creditUnavailableReason : null;
      throw new BadRequestException(why ?? `${mode} is not available for this order`);
    }

    const standardEta = etaWindow(standardRoute.method, standardRoute.distanceKm, new Date(), settings.eta);
    const eta = wantQuick ? quick!.eta! : standardEta;
    const meta = new Map(products.map((p) => [p.id, p]));
    return {
      channel,
      address: snapshot,
      fulfillment: {
        method: route.method,
        speed: wantQuick ? 'QUICK' : 'STANDARD',
        zoneId: wantQuick ? quick!.zone!.id : (quick?.zone?.id ?? null),
        zoneName: wantQuick ? quick!.zone!.name : (quick?.zone?.name ?? null),
        nodeId: route.node.id,
        nodeName: route.node.name,
        nodeKind: route.node.kind,
        branchId: route.node.branchId,
        distanceKm: route.distanceKm,
        etaMin: eta.min.toISOString(),
        etaMax: eta.max.toISOString(),
        etaLabel: eta.label,
        reason: route.reason,
      },
      deliveryOptions: {
        standard: { method: standardRoute.method, etaLabel: standardEta.label, fee: standardFee, reason: standardRoute.reason },
        quick: quick?.offered
          ? { available: quick.available, reason: quick.reason, etaLabel: quick.eta?.label ?? null, fee: quick.available ? quickFeeValue : null, zoneName: quick.zone?.name ?? null }
          : null,
      },
      lines: cart.lines.map((l) => {
        const p = meta.get(l.key)!;
        const src = priced.find((x) => x.productId === l.key)!;
        return {
          productId: l.key, name: p.name, sku: p.sku, image: p.images?.[0] ?? null,
          quantity: l.quantity, unitPrice: l.unitPrice, gstRatePercent: l.gstRatePercent, priceListId: src.priceListId,
          gross: l.gross, discount: l.discount, taxable: l.taxable, tax: l.tax, total: l.total,
        };
      }),
      totals: {
        subtotal: cart.subtotal, couponDiscount, loyaltyDiscount, referralDiscount, discount: cart.discount,
        taxable: cart.taxable, tax: cart.tax, deliveryFee: cart.deliveryFee, totalPayable: cart.totalPayable,
      },
      coupon: coupon ? { code: coupon.code, discount: coupon.discount } : null,
      loyalty: {
        enabled: loyaltyPool.enabled, balance: loyaltyPool.balance, pointValueInr: loyaltyPool.pointValueInr,
        redeemPoints: appliedLoyaltyPoints, maxPoints: loyaltyPool.maxPoints, minPoints: loyaltyPool.minPoints,
      },
      referral: {
        enabled: referralPool.enabled, balance: referralPool.balance, pointValueInr: referralPool.pointValueInr,
        redeemPoints: appliedReferralPoints, maxPoints: referralPool.maxPoints, minPoints: referralPool.minPoints,
      },
      wallet: {
        mode: offer.mode,
        combined: offer.combined
          ? {
              enabled: offer.combined.enabled, balance: offer.combined.balance, pointValueInr: offer.combined.pointValueInr,
              maxPoints: offer.combined.maxPoints, minPoints: offer.combined.minPoints,
              redeemPoints: appliedLoyaltyPoints + appliedReferralPoints,
            }
          : null,
      },
      payment: { mode, allowedModes: payment.allowedModes, codUnavailableReason: payment.codUnavailableReason, creditUnavailableReason: payment.creditUnavailableReason },
    };
  }

  private async paymentOptions(customer: Customer, total: number, s: EffectiveCheckoutSettings) {
    const allowedModes: PaymentMode[] = [PaymentMode.ONLINE];
    let codUnavailableReason: string | null = null;
    let creditUnavailableReason: string | null = null;

    if (customer.channel === SalesChannel.B2C) {
      if (!s.codEnabled) codUnavailableReason = 'Cash on delivery is not available';
      else if (s.codMaxAmount !== null && total > s.codMaxAmount) codUnavailableReason = `Cash on delivery is available up to ₹${s.codMaxAmount}`;
      else allowedModes.push(PaymentMode.COD);
    } else if (customer.paymentTerms === PaymentTerms.PREPAID) {
      creditUnavailableReason = 'Your account is on prepaid terms';
    } else {
      try {
        await this.sales.assertWithinCreditLimit(customer.id, total);
        allowedModes.push(PaymentMode.CREDIT);
      } catch (e) {
        creditUnavailableReason = e instanceof HttpException ? this.messageOf(e) : 'Credit is not available for this order';
      }
    }
    const defaultMode = allowedModes.includes(PaymentMode.CREDIT) ? PaymentMode.CREDIT : PaymentMode.ONLINE;
    return { allowedModes, defaultMode, codUnavailableReason, creditUnavailableReason };
  }

  private messageOf(e: HttpException): string {
    const r = e.getResponse();
    return typeof r === 'string' ? r : ((r as { message?: string | string[] }).message?.toString() ?? e.message);
  }

  // ---------------------------------------------------------------- session

  /**
   * Freeze a quote, hold its stock for the payment window, and (for online
   * payment) open the gateway order. The hold is atomic: rows are locked, the
   * real availability is re-checked, and the reservation is written in one
   * transaction, so the last unit can only ever be promised to one buyer.
   * If a local outlet loses that race, the cart is re-routed to the next node.
   *
   * `idempotencyKey` (the client's `Idempotency-Key` header) makes a retried
   * or double-tapped request return the SAME session rather than opening a
   * second stock hold and a second gateway order. It is scoped per customer
   * (`@@unique([customerId, idempotencyKey])`), and a request with no key
   * behaves exactly as before - every keyless call opens its own session.
   */
  async startSession(customer: Customer, dto: CheckoutDto, idempotencyKey?: string) {
    if (idempotencyKey) {
      const existing = await this.prisma.checkoutSession.findUnique({
        where: { customerId_idempotencyKey: { customerId: customer.id, idempotencyKey } },
      });
      if (existing) {
        if (existing.status !== CheckoutSessionStatus.OPEN) {
          // Aborted, expired, or already completed - that response was final.
          // The client needs a new key to try again, the same way confirm()
          // needs a fresh session once one is no longer OPEN.
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: `This checkout attempt already resolved as ${existing.status}. Use a new Idempotency-Key to start another one.`,
          });
        }
        return this.reopenPayment(existing);
      }
    }

    const settings = await this.settings.effective();
    await this.abortOpenSessions(customer.id);

    const excluded: string[] = [];
    for (let attempt = 0; ; attempt += 1) {
      const quote = await this.quote(customer, dto, { excludeNodeIds: excluded });
      this.assertExpectedTotal(dto.expectedTotal, quote);
      try {
        const session = await this.prisma.$transaction(
          async (tx) => {
            const created = await tx.checkoutSession.create({
              data: {
                customerId: customer.id,
                quote: quote as unknown as Prisma.InputJsonValue,
                paymentMode: quote.payment.mode,
                expiresAt: new Date(Date.now() + settings.reservationTtlMinutes * 60_000),
                idempotencyKey: idempotencyKey ?? null,
              },
            });
            await this.reservations.hold(tx, {
              warehouseId: quote.fulfillment.nodeId,
              items: quote.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
              sessionId: created.id,
              ttlMinutes: settings.reservationTtlMinutes,
            });
            return created;
          },
          { timeout: 20_000 },
        );
        return await this.openPayment(session.id, quote);
      } catch (error) {
        const lostLocalRace = error instanceof OutOfStockException && quote.fulfillment.method === 'LOCAL' && attempt < LOCAL_RETRIES;
        if (!lostLocalRace) throw error;
        excluded.push(quote.fulfillment.nodeId); // someone took the last unit: try the next node
      }
    }
  }

  private assertExpectedTotal(expected: number | undefined, quote: StoredQuote) {
    if (expected !== undefined && Math.abs(expected - quote.totals.totalPayable) > 0.009) {
      throw new ConflictException({
        code: 'PRICE_CHANGED',
        message: `The total changed from ₹${expected.toFixed(2)} to ₹${quote.totals.totalPayable.toFixed(2)}. Please review your order.`,
        quote,
      });
    }
  }

  /**
   * The `Idempotency-Key` replay path: same session, same response shape as
   * `openPayment`, but no second gateway order and no second
   * `PaymentTransaction` row - both were already created the first time.
   */
  private reopenPayment(session: { id: string; expiresAt: Date; quote: unknown; paymentMode: PaymentMode; gatewayOrderId: string | null }) {
    const quote = session.quote as unknown as StoredQuote;
    const mode = session.paymentMode;
    const amount = quote.totals.totalPayable;
    const requiresPayment = mode === PaymentMode.ONLINE && amount > 0;
    const gatewayConfig = requiresPayment && session.gatewayOrderId ? this.gateway.clientConfigFor(session.gatewayOrderId, amount) : null;
    return {
      sessionId: session.id,
      expiresAt: session.expiresAt,
      quote,
      payment: { mode, amount, requiresPayment, gateway: gatewayConfig },
    };
  }

  private async openPayment(sessionId: string, quote: StoredQuote) {
    const session = await this.prisma.checkoutSession.findUniqueOrThrow({ where: { id: sessionId } });
    const mode = quote.payment.mode;
    const amount = quote.totals.totalPayable;
    let gateway: { gatewayOrderId: string; clientConfig: Record<string, unknown> } | null = null;

    if (mode === PaymentMode.ONLINE && amount > 0) {
      try {
        gateway = await this.gateway.createOrder({ amountRupees: amount, receipt: session.id });
      } catch (error) {
        await this.abort(session.customerId, session.id, 'Could not start the payment');
        this.logger.error(`Gateway order failed for session ${session.id}: ${error instanceof Error ? error.message : String(error)}`);
        throw new BadGatewayException('We could not start the payment. Your items were not charged or held - please try again.');
      }
      await this.prisma.checkoutSession.update({
        where: { id: session.id },
        data: { gatewayProvider: this.gateway.provider, gatewayOrderId: gateway.gatewayOrderId },
      });
    }
    await this.prisma.paymentTransaction.create({
      data: {
        sessionId: session.id,
        provider: gateway ? this.gateway.provider : mode.toLowerCase(),
        mode,
        gatewayOrderId: gateway?.gatewayOrderId,
        amount,
        status: mode === PaymentMode.ONLINE ? PaymentTransactionStatus.PENDING : mode === PaymentMode.COD ? PaymentTransactionStatus.COD : PaymentTransactionStatus.CREDIT,
      },
    });
    return {
      sessionId: session.id,
      expiresAt: session.expiresAt,
      quote,
      payment: { mode, amount, requiresPayment: mode === PaymentMode.ONLINE && amount > 0, gateway: gateway?.clientConfig ?? null },
    };
  }

  /** Give the stock back and close the session. Safe to call repeatedly. */
  async abort(customerId: string, sessionId: string, reason = 'Payment cancelled') {
    const session = await this.prisma.checkoutSession.findFirst({ where: { id: sessionId, customerId } });
    if (!session) throw new NotFoundException('Checkout not found');
    if (session.status === CheckoutSessionStatus.COMPLETED) throw new ConflictException('This order has already been placed');

    await this.prisma.$transaction(async (tx) => {
      await this.reservations.releaseSession(tx, session.id);
      await tx.checkoutSession.updateMany({ where: { id: session.id, status: CheckoutSessionStatus.OPEN }, data: { status: CheckoutSessionStatus.ABORTED } });
      await tx.paymentTransaction.updateMany({
        where: { sessionId: session.id, status: PaymentTransactionStatus.PENDING },
        data: { status: PaymentTransactionStatus.FAILED, failureReason: reason },
      });
    });
    return { aborted: true };
  }

  private async abortOpenSessions(customerId: string) {
    const open = await this.prisma.checkoutSession.findMany({ where: { customerId, status: CheckoutSessionStatus.OPEN }, select: { id: true } });
    for (const s of open) await this.abort(customerId, s.id, 'Replaced by a newer checkout').catch(() => undefined);
  }

  // ---------------------------------------------------------------- confirm

  /**
   * Payment done (or COD / credit chosen): place the order. Idempotent on the
   * session - confirming twice, or a webhook racing the browser, returns the
   * same order.
   */
  async confirm(customer: Customer, sessionId: string, dto: ConfirmCheckoutDto, opts: { gatewayVerified?: boolean } = {}) {
    const session = await this.prisma.checkoutSession.findFirst({ where: { id: sessionId, customerId: customer.id } });
    if (!session) throw new NotFoundException('Checkout not found');

    const existing = await this.prisma.order.findUnique({ where: { checkoutSessionId: session.id }, select: { id: true, orderNumber: true } });
    if (existing) return { orderId: existing.id, orderNumber: existing.orderNumber, alreadyPlaced: true };
    if (session.status === CheckoutSessionStatus.ABORTED) throw new ConflictException('This checkout was cancelled - your items were released');

    const quote = session.quote as unknown as StoredQuote;
    const mode = session.paymentMode;
    const online = mode === PaymentMode.ONLINE && quote.totals.totalPayable > 0;

    if (online) {
      if (!dto.gatewayPaymentId || (!dto.signature && !opts.gatewayVerified) || !session.gatewayOrderId) {
        throw new BadRequestException('Payment details are missing');
      }
      // A webhook body was already authenticated as a whole (its own HMAC); a browser callback is checked here.
      const ok = opts.gatewayVerified || this.gateway.verifyPayment({ gatewayOrderId: session.gatewayOrderId, paymentId: dto.gatewayPaymentId, signature: dto.signature ?? "" });
      if (!ok) {
        await this.recordPaymentFailure(session.id, dto.gatewayPaymentId, 'Payment could not be verified');
        await this.abort(customer.id, session.id, 'Payment failed').catch(() => undefined);
        throw new HttpException({ code: 'PAYMENT_FAILED', message: 'Your payment did not go through. Nothing was charged and your items were released - please try again.' }, HttpStatus.PAYMENT_REQUIRED);
      }
    } else if (session.status !== CheckoutSessionStatus.OPEN || session.expiresAt <= new Date()) {
      // Only a PAID online session may outlive its hold (the money is already taken).
      throw new ConflictException('This checkout expired - please start again');
    }

    try {
      const order = await this.prisma.$transaction((tx) => this.placeOrder(tx, customer, session, quote, dto.gatewayPaymentId), { timeout: 30_000 });
      this.events.publish('new', order.id);
      return { orderId: order.id, orderNumber: order.orderNumber, alreadyPlaced: false };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const won = await this.prisma.order.findUnique({ where: { checkoutSessionId: session.id }, select: { id: true, orderNumber: true } });
        if (won) return { orderId: won.id, orderNumber: won.orderNumber, alreadyPlaced: true };
      }
      if (online && error instanceof HttpException) {
        // Paid, but the order cannot be honoured (stock/coupon/points changed). Never lose that fact.
        await this.flagRefund(session.id, dto.gatewayPaymentId!, this.messageOf(error));
        await this.abort(customer.id, session.id, 'Order could not be placed after payment').catch(() => undefined);
        throw new ConflictException({
          code: 'REFUND_REQUIRED',
          message: 'Your payment was received, but the order could not be placed because an item or offer changed. It will be refunded.',
        });
      }
      throw error;
    }
  }

  /**
   * The gateway's own server-to-server "payment captured" call. Covers the customer
   * who paid and then closed the tab before the browser could confirm: the order
   * is placed anyway. Idempotent with the browser path (same session, same order).
   */
  async confirmFromWebhook(gatewayOrderId: string, paymentId: string) {
    const session = await this.prisma.checkoutSession.findFirst({ where: { gatewayOrderId } });
    if (!session) return { ignored: true };
    const customer = await this.prisma.customer.findUnique({ where: { id: session.customerId } });
    if (!customer) return { ignored: true };
    return this.confirm(customer, session.id, { gatewayPaymentId: paymentId }, { gatewayVerified: true });
  }

  /**
   * Called only when the payment could NOT be verified, so `paymentId` is
   * whatever the client claimed. It is kept in the failure note and never
   * written to `gatewayPaymentId`: that column is unique, and storing an
   * unverified id there would let a forged confirm (someone else's real
   * Razorpay id + a bad signature) block the genuine payment from ever being
   * recorded - it failed with a 500 until 26 Sep.
   */
  private async recordPaymentFailure(sessionId: string, paymentId: string | undefined, reason: string) {
    await this.prisma.paymentTransaction.updateMany({
      where: { sessionId, status: PaymentTransactionStatus.PENDING },
      data: {
        status: PaymentTransactionStatus.FAILED,
        failureReason: paymentId ? `${reason} (claimed payment id ${paymentId.slice(0, 80)})` : reason,
      },
    });
  }

  private async flagRefund(sessionId: string, paymentId: string, reason: string) {
    await this.prisma.paymentTransaction.updateMany({
      where: { sessionId, status: PaymentTransactionStatus.PENDING },
      data: { status: PaymentTransactionStatus.PAID, gatewayPaymentId: paymentId, failureReason: `REFUND REQUIRED: ${reason}` },
    });
    this.logger.error(`REFUND REQUIRED for checkout session ${sessionId} (payment ${paymentId}): ${reason}`);
  }

  /** Everything that makes an order real, in ONE transaction: all of it, or none of it. */
  private async placeOrder(
    tx: Prisma.TransactionClient,
    customer: Customer,
    session: { id: string; gatewayOrderId: string | null; paymentMode: PaymentMode },
    quote: StoredQuote,
    paymentId?: string,
  ) {
    const now = new Date();
    const mode = session.paymentMode;
    const t = quote.totals;
    const online = mode === PaymentMode.ONLINE;
    const settings = await this.settings.effective();

    if (mode === PaymentMode.CREDIT) await this.sales.assertWithinCreditLimit(customer.id, t.totalPayable, tx);

    const orderNumber = await this.sequence.next(tx, 'SO', now);
    const a = quote.address;
    const order = await tx.order.create({
      data: {
        orderNumber,
        channel: quote.channel,
        customerId: customer.id,
        status: OrderStatus.PLACED,
        source: 'STOREFRONT',
        orderDate: now,
        warehouseId: quote.fulfillment.nodeId,
        branchId: quote.fulfillment.branchId,
        subtotal: t.subtotal,
        taxTotal: t.tax,
        total: t.totalPayable,
        discountTotal: t.discount,
        deliveryFee: t.deliveryFee,
        couponCode: quote.coupon?.code,
        loyaltyRedeemedPoints: quote.loyalty.redeemPoints,
        loyaltyRedeemedInr: t.loyaltyDiscount,
        referralRedeemedPoints: quote.referral.redeemPoints,
        referralRedeemedInr: t.referralDiscount,
        paymentMode: mode,
        paymentStatus: online ? PaymentStatus.PAID : PaymentStatus.PENDING,
        paymentTerms: quote.channel === SalesChannel.B2C ? PaymentTerms.PREPAID : customer.paymentTerms,
        gatewayOrderId: session.gatewayOrderId,
        gatewayPaymentId: paymentId,
        fulfillmentMethod: quote.fulfillment.method,
        deliverySpeed: quote.fulfillment.speed === 'QUICK' ? 'QUICK' : 'STANDARD',
        deliveryZoneId: quote.fulfillment.zoneId ?? undefined,
        addressSnapshot: a as unknown as Prisma.InputJsonValue,
        pricingSnapshot: quote as unknown as Prisma.InputJsonValue,
        deliveryAddress: [a.fullName, a.line1, a.line2, a.landmark, `${a.city}, ${a.state} ${a.pincode}`, `Ph ${a.phone}`].filter(Boolean).join(', '),
        distanceKm: quote.fulfillment.distanceKm,
        etaMin: new Date(quote.fulfillment.etaMin),
        etaMax: new Date(quote.fulfillment.etaMax),
        deliveryOtp: String(randomInt(10 ** (settings.deliveryOtpDigits - 1), 10 ** settings.deliveryOtpDigits)),
        checkoutSessionId: session.id,
        items: {
          create: quote.lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            priceListId: l.priceListId,
            gstRatePercent: l.gstRatePercent,
            lineSubtotal: l.gross,
            lineDiscount: l.discount,
            lineTax: l.tax,
            lineTotal: l.total,
            skuSnapshot: l.sku,
            nameSnapshot: l.name,
          })),
        },
      },
    });

    await this.reservations.commit(tx, { sessionId: session.id, orderId: order.id, warehouseId: quote.fulfillment.nodeId, now });

    if (quote.coupon) {
      const applied = await this.coupons.validate(tx, { code: quote.coupon.code, customerId: customer.id, channel: quote.channel, subtotal: t.subtotal, now });
      const row = await tx.coupon.findUniqueOrThrow({ where: { id: applied.id } });
      await this.coupons.redeem(tx, { coupon: { ...applied, discount: quote.coupon.discount }, customerId: customer.id, orderId: order.id, limit: row.usageLimit });
    }
    if (quote.loyalty.redeemPoints > 0 || quote.referral.redeemPoints > 0) {
      await this.wallet.redeemForOrder(tx, {
        customerId: customer.id,
        orderId: order.id,
        loyaltyPoints: quote.loyalty.redeemPoints,
        loyaltyValueInr: t.loyaltyDiscount,
        referralPoints: quote.referral.redeemPoints,
        referralValueInr: t.referralDiscount,
      });
    }

    await tx.paymentTransaction.updateMany({
      where: { sessionId: session.id },
      data: {
        orderId: order.id,
        gatewayPaymentId: paymentId,
        ...(online ? { status: PaymentTransactionStatus.PAID } : {}),
      },
    });
    await tx.checkoutSession.update({ where: { id: session.id }, data: { status: CheckoutSessionStatus.COMPLETED, orderId: order.id } });
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        type: 'PLACED',
        note:
          quote.fulfillment.speed === 'QUICK'
            ? `Quick Delivery (${quote.fulfillment.etaLabel})`
            : quote.fulfillment.method === 'LOCAL'
              ? 'Express Local Delivery'
              : 'Standard Courier Delivery',
      },
    });
    return order;
  }
}
