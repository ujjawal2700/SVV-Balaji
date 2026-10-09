import { BadGatewayException, BadRequestException, ConflictException, ForbiddenException, HttpException, Inject, Injectable, Logger, NotFoundException, OnModuleInit, Optional } from '@nestjs/common';
import {
  CoinSource, CoinTransactionReason, Customer, CustomerType, ExchangeDifferenceStatus, OrderStatus, PaymentStatus, Prisma, QcDecision,
  RefundMethod, RefundWalletReason, ReturnLogistics, ReturnRequest, ReturnRequestStatus as S, ReturnRequestType, ReturnSettings,
  ReturnShipmentDirection, SalesChannel,
} from '@prisma/client';
import { randomInt } from 'node:crypto';
import { SequenceService } from '../common/sequence.service';
import { AffiliateLedgerService } from '../affiliates/affiliate-ledger.service';
import { ShipmentWebhookRouter } from '../common/shipment-webhook-router';
import { PAYMENT_GATEWAY, type PaymentGateway } from '../checkout/payment/payment-gateway';
import { SHIPPING_PROVIDER, type ShippingProvider } from '../checkout/shipping/shipping-provider';
import { availableByProduct, OutOfStockException } from '../checkout/stock-holds';
import { DispatchService, LIVE_STATUSES } from '../delivery/dispatch/dispatch.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PricingService } from '../pricing/pricing.service';
import { CreditNotesService } from '../invoices/credit-notes.service';
import { PrismaService } from '../prisma/prisma.service';
import { statusAfter } from '../receivables/receivables.logic';
import { SalesService } from '../sales/sales.service';
import { RefundWalletService } from '../wallet/refund-wallet.service';
import type {
  ApproveDto, CompleteRefundDto, ConfirmDifferenceDto, CreateReturnRequestDto, ListReturnsQueryDto, QcDto, StaffCreateReturnRequestDto,
} from './dto/returns.dto';
import { ReturnSettingsService } from './return-settings.service';
import {
  dispatchReplacementStock, receiveReturnedStock, releaseReplacement, replacementBackInStock, reserveReplacement,
} from './returns-inventory';
import {
  canTransition, coinsForLine, exchangeDifference, inclusiveTotal, logisticsFor, OPEN_STATUSES, paidValue, refundFor, remainingQuantity,
  round2, STATUS_LABEL, typeLabel, windowCheck, lineWindowHours, NOT_RETURNABLE,
} from './returns.logic';
import { StaffAlertsService } from '../realtime/staff-alerts.service';

type Tx = Prisma.TransactionClient;
type Actor = { kind: 'STAFF' | 'CUSTOMER' | 'RIDER' | 'COURIER' | 'SYSTEM'; id?: string | null };

/** Everything the workflow reads about a request in one go. */
const FULL = {
  order: {
    select: {
      id: true, orderNumber: true, channel: true, status: true, deliveredAt: true, orderDate: true, fulfillmentMethod: true,
      paymentMode: true, paymentTerms: true, paymentStatus: true, total: true, amountPaid: true, addressSnapshot: true,
      deliveryAddress: true, deliveryZoneId: true, deliverySpeed: true, distanceKm: true, warehouseId: true,
    },
  },
  orderItem: { select: { id: true, productId: true, quantity: true, unitPrice: true, lineTotal: true, nameSnapshot: true, skuSnapshot: true, product: { select: { name: true, sku: true, images: true } } } },
  customer: { select: { id: true, name: true, phone: true, email: true, customerCode: true, channel: true, type: true, shippingAddress: true, billingAddress: true } },
  warehouse: { select: { id: true, name: true, kind: true } },
  reason: true,
  replacementProduct: { select: { id: true, name: true, sku: true, images: true } },
} satisfies Prisma.ReturnRequestInclude;
type Loaded = Prisma.ReturnRequestGetPayload<{ include: typeof FULL }>;

const otp4 = () => String(randomInt(1000, 10000));

/**
 * The return & exchange workflow, at ORDER ITEM level, for both channels and
 * both logistics paths. Every status change goes through `move()`, which only
 * allows the transitions in returns.logic.ts and is a conditional update
 * (`WHERE status = <expected>`), so two people acting at once can never both
 * succeed - the loser gets a 409 and re-reads.
 *
 * Money and stock are never moved by a status change on its own: each one is
 * written in the same transaction as the status it belongs to (refund with
 * COMPLETED, restock with QC, stock-out with SHIPPED), so the two cannot drift.
 */
@Injectable()
export class ReturnsService implements OnModuleInit {
  private readonly logger = new Logger(ReturnsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly settings: ReturnSettingsService,
    private readonly pricing: PricingService,
    private readonly sales: SalesService,
    private readonly loyalty: LoyaltyService,
    private readonly wallet: RefundWalletService,
    private readonly dispatch: DispatchService,
    private readonly webhookRouter: ShipmentWebhookRouter,
    @Inject(SHIPPING_PROVIDER) private readonly shipping: ShippingProvider,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly affiliates: AffiliateLedgerService,
    private readonly creditNotes: CreditNotesService,
    @Optional() private readonly staffAlerts?: StaffAlertsService,
  ) {}

  onModuleInit() {
    this.webhookRouter.register((awb, status, payload) => this.onCourierUpdate(awb, status, payload));
  }

  // ================================================================ helpers

  async load(id: string): Promise<Loaded> {
    const r = await this.prisma.returnRequest.findUnique({ where: { id }, include: FULL });
    if (!r) throw new NotFoundException('Return / exchange request not found');
    return r;
  }

  /** Staff screens are split per channel: a request is invisible from the other channel's queue. */
  async forChannel(channel: SalesChannel, id: string): Promise<Loaded> {
    const r = await this.load(id);
    if (r.channel !== channel) throw new NotFoundException('Return / exchange request not found');
    return r;
  }

  /**
   * The one way a status changes. Conditional on the status we read, so a
   * concurrent change makes this throw instead of silently overwriting it.
   */
  async move(
    tx: Tx, req: Pick<ReturnRequest, 'id' | 'status'>, to: S, actor: Actor,
    opts: { data?: Prisma.ReturnRequestUpdateManyMutationInput; note?: string; type?: string } = {},
  ) {
    if (!canTransition(req.status, to)) {
      throw new ConflictException({ code: 'INVALID_TRANSITION', message: `A request that is ${STATUS_LABEL[req.status].toLowerCase()} cannot move to ${STATUS_LABEL[to].toLowerCase()}` });
    }
    const res = await tx.returnRequest.updateMany({ where: { id: req.id, status: req.status }, data: { ...opts.data, status: to } });
    if (res.count !== 1) throw new ConflictException({ code: 'STALE', message: 'This request was just updated by someone else - refresh and try again' });
    await tx.returnRequestEvent.create({
      data: { requestId: req.id, type: opts.type ?? to, fromStatus: req.status, toStatus: to, note: opts.note, actorKind: actor.kind, actorId: actor.id ?? null },
    });
    req.status = to;
  }

  async log(requestId: string, type: string, actor: Actor, note?: string, client: Tx | PrismaService = this.prisma) {
    await client.returnRequestEvent.create({ data: { requestId, type, note, actorKind: actor.kind, actorId: actor.id ?? null } });
  }

  /** Customer-facing: lands on the order timeline, which is what drives their inbox + push. */
  async notify(req: { orderId: string; requestNumber: string; type: ReturnRequestType }, status: S, actor?: Actor, extra?: string) {
    const note = `${typeLabel(req.type)} ${req.requestNumber}: ${STATUS_LABEL[status]}${extra ? ` - ${extra}` : ''}`;
    await this.sales.record(req.orderId, 'RETURN_UPDATE', actor?.kind === 'STAFF' ? actor.id ?? undefined : undefined, note);
  }

  /** The ledger tables need a staff user; automatic steps are recorded against the first Super Admin. */
  async systemUserId(): Promise<string> {
    const admin = await this.prisma.user.findFirst({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (!admin) throw new ConflictException('No active Super Admin to record this automatic step against');
    return admin.id;
  }

  private isCreditOrder(o: { paymentMode: string | null; paymentTerms: string }) {
    return o.paymentMode === 'CREDIT' || (o.paymentMode === null && o.paymentTerms !== 'PREPAID');
  }

  private outstanding(o: { total: Prisma.Decimal; amountPaid: Prisma.Decimal; paymentStatus: PaymentStatus }) {
    if (o.paymentStatus === PaymentStatus.PAID || o.paymentStatus === PaymentStatus.REFUNDED) return 0;
    return round2(Math.max(0, Number(o.total) - Number(o.amountPaid)));
  }

  /**
   * Refund methods that make sense for THIS order. A credit-terms bill that is
   * still unpaid settles only by credit note - handing out cash for goods that
   * were never paid for is never right. Credit notes are for credit orders only.
   */
  refundMethodsFor(
    order: { paymentMode: string | null; paymentTerms: string; total: Prisma.Decimal; amountPaid: Prisma.Decimal; paymentStatus: PaymentStatus },
    s: ReturnSettings,
  ): RefundMethod[] {
    if (this.isCreditOrder(order)) {
      if (this.outstanding(order) > 0) return [RefundMethod.CREDIT_NOTE];
      return s.allowedRefundMethods.length ? s.allowedRefundMethods : [RefundMethod.WALLET];
    }
    const m = s.allowedRefundMethods.filter((x) => x !== RefundMethod.CREDIT_NOTE);
    return m.length ? m : [RefundMethod.WALLET];
  }

  private itemBlocked(
    type: ReturnRequestType,
    s: ReturnSettings,
    product: { id: string; categoryId: string | null; category: { parentId: string | null } | null },
  ): string | null {
    const ret = type === ReturnRequestType.RETURN;
    if (ret ? !s.returnEnabled : !s.exchangeEnabled) return ret ? 'Returns are not available right now' : 'Exchanges are not available right now';
    const products = ret ? s.nonReturnableProductIds : s.nonExchangeableProductIds;
    const categories = ret ? s.nonReturnableCategoryIds : s.nonExchangeableCategoryIds;
    const cats = [product.categoryId, product.category?.parentId].filter(Boolean) as string[];
    if (products.includes(product.id) || cats.some((c) => categories.includes(c))) {
      return ret ? 'This product cannot be returned' : 'This product cannot be exchanged';
    }
    return null;
  }

  private orderBlocked(o: { status: OrderStatus }): string | null {
    if (o.status === OrderStatus.CANCELLED) return 'Cancelled orders cannot be returned or exchanged';
    if (o.status !== OrderStatus.DELIVERED) return 'Returns and exchanges open once the order is delivered';
    return null;
  }

  /** Units of the line that legacy staff-recorded returns (no request) already took back. */
  private async legacyReturned(client: Tx | PrismaService, orderItemId: string) {
    const agg = await client.orderReturn.aggregate({ where: { orderItemId, returnRequestId: null }, _sum: { quantity: true } });
    return agg._sum.quantity ?? 0;
  }

  // ================================================================ customer: eligibility

  async eligibility(customer: Customer, orderNumber: string) {
    const order = await this.prisma.order.findFirst({
      where: { orderNumber, customerId: customer.id },
      include: {
        warehouse: { select: { kind: true } },
        items: { include: { product: { select: { id: true, name: true, images: true, categoryId: true, category: { select: { parentId: true } } } } } },
        returnRequests: { select: { id: true, requestNumber: true, orderItemId: true, quantity: true, status: true, type: true, createdAt: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    const s = await this.settings.get(order.channel);
    const reasons = await this.settings.reasons({ channel: order.channel, activeOnly: true });
    const blocked = this.orderBlocked(order);
    const now = new Date();
    const items = await Promise.all(order.items.map(async (i) => {
      // Per line: the product's own window (frozen at placement) or the channel default.
      const retHours = lineWindowHours(i.returnWindowDays, s.returnWindowHours);
      const excHours = lineWindowHours(i.returnWindowDays, s.exchangeWindowHours);
      const closed = { ok: false, closesAt: null, reason: NOT_RETURNABLE };
      const retWin = retHours === null ? closed : windowCheck(order.deliveredAt, retHours, now);
      const excWin = excHours === null ? closed : windowCheck(order.deliveredAt, excHours, now);
      const reqs = order.returnRequests.filter((r) => r.orderItemId === i.id);
      const remaining = Math.max(0, remainingQuantity(i.quantity, reqs) - (await this.legacyReturned(this.prisma, i.id)));
      const check = (type: ReturnRequestType, win: typeof retWin) => {
        const why = blocked ?? this.itemBlocked(type, s, i.product) ?? (win.ok ? null : win.reason) ??
          (remaining <= 0 ? (reqs.some((r) => OPEN_STATUSES.includes(r.status)) ? 'A request is already open for this item' : 'Already returned or exchanged') : null);
        return { eligible: why === null, reason: why, closesAt: win.closesAt };
      };
      return {
        orderItemId: i.id,
        productId: i.productId,
        name: i.nameSnapshot ?? i.product.name,
        imageUrl: i.product.images?.[0] ?? null,
        quantity: i.quantity,
        remainingQuantity: remaining,
        unitPaid: paidValue({ quantity: i.quantity, lineTotal: Number(i.lineTotal), lineSubtotal: Number(i.lineSubtotal) }, 1).unitPaid,
        returnWindowDays: retHours === null ? 0 : retHours / 24,
        return: check(ReturnRequestType.RETURN, retWin),
        exchange: check(ReturnRequestType.EXCHANGE, excWin),
        requests: reqs.map((r) => ({ requestNumber: r.requestNumber, type: r.type, quantity: r.quantity, status: r.status, createdAt: r.createdAt })),
      };
    }));

    return {
      orderNumber: order.orderNumber,
      status: order.status,
      deliveredAt: order.deliveredAt,
      logistics: logisticsFor(order.fulfillmentMethod, order.warehouse.kind),
      policy: {
        returnWindowHours: s.returnWindowHours,
        exchangeWindowHours: s.exchangeWindowHours,
        mediaRequired: s.mediaRequired,
        minMediaCount: s.minMediaCount,
        maxMediaCount: s.maxMediaCount,
        exchangeSameProductOnly: s.exchangeSameProductOnly,
        exchangeSameCategoryOnly: s.exchangeSameCategoryOnly,
        refundMethods: this.refundMethodsFor(order, s),
        defaultRefundMethod: this.refundMethodsFor(order, s).includes(s.defaultRefundMethod) ? s.defaultRefundMethod : this.refundMethodsFor(order, s)[0],
        returnShippingFee: s.returnShippingPayer === 'CUSTOMER' ? Number(s.returnShippingFee) : 0,
        restockingFeePercent: Number(s.restockingFeePercent),
        policyText: s.policyText,
      },
      reasons: reasons.map((r) => ({ id: r.id, code: r.code, label: r.label, forReturn: r.forReturn, forExchange: r.forExchange, requiresMedia: r.requiresMedia, companyFault: r.companyFault })),
      items,
    };
  }

  /** What an item could be exchanged for, priced for this customer, with live availability at the order's node. */
  async replacementOptions(customer: Customer, orderNumber: string, orderItemId: string) {
    const order = await this.prisma.order.findFirst({
      where: { orderNumber, customerId: customer.id },
      include: { items: { where: { id: orderItemId }, include: { product: { select: { id: true, categoryId: true } } } } },
    });
    const item = order?.items[0];
    if (!order || !item) throw new NotFoundException('Order item not found');
    const s = await this.settings.get(order.channel);
    const where: Prisma.ProductWhereInput = s.exchangeSameProductOnly
      ? { id: item.productId }
      : s.exchangeSameCategoryOnly
        ? { categoryId: item.product.categoryId ?? '__none__', isActive: true, showOnStorefront: true }
        : { isActive: true, showOnStorefront: true };
    const products = await this.prisma.product.findMany({ where, select: { id: true, name: true, sku: true, images: true, packLabel: true }, take: 60, orderBy: { name: 'asc' } });
    const available = await availableByProduct(this.prisma as unknown as Tx, order.warehouseId, products.map((p) => p.id));
    const paidUnit = paidValue({ quantity: item.quantity, lineTotal: Number(item.lineTotal), lineSubtotal: Number(item.lineSubtotal) }, 1).unitPaid;
    return Promise.all(products.map(async (p) => {
      let unitPrice: number | null = null;
      if (p.id === item.productId) unitPrice = paidUnit;
      else {
        try {
          const price = await this.pricing.resolve({ productId: p.id, channel: order.channel, customerType: customer.type as CustomerType, quantity: 1 });
          unitPrice = inclusiveTotal(price.unitPrice, price.gstRatePercent, 1);
        } catch {
          unitPrice = null; // no live price: cannot be offered
        }
      }
      return {
        productId: p.id, name: p.name, sku: p.sku, imageUrl: p.images?.[0] ?? null, packLabel: p.packLabel,
        sameProduct: p.id === item.productId, unitPrice, available: available.get(p.id) ?? 0,
      };
    })).then((rows) => rows.filter((r) => r.unitPrice !== null));
  }

  // ================================================================ create

  async create(
    customer: Customer,
    dto: CreateReturnRequestDto | StaffCreateReturnRequestDto,
    opts: { idempotencyKey?: string; staffId?: string } = {},
  ) {
    if (opts.idempotencyKey) {
      const existing = await this.prisma.returnRequest.findUnique({ where: { customerId_idempotencyKey: { customerId: customer.id, idempotencyKey: opts.idempotencyKey } } });
      if (existing) return this.customerView(await this.load(existing.id));
    }
    const staff = Boolean(opts.staffId);
    const override = staff && (dto as StaffCreateReturnRequestDto).overrideWindow === true;
    if (override && !(dto as StaffCreateReturnRequestDto).note?.trim()) throw new BadRequestException('Say why the window is being overridden');

    const order = await this.prisma.order.findFirst({
      where: { orderNumber: dto.orderNumber, customerId: customer.id },
      include: {
        warehouse: { select: { kind: true } },
        items: { where: { id: dto.orderItemId }, include: { product: { select: { id: true, name: true, sku: true, categoryId: true, category: { select: { parentId: true } } } } } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    const item = order.items[0];
    if (!item) throw new BadRequestException('That item is not part of this order');

    const blocked = this.orderBlocked(order);
    if (blocked) throw new BadRequestException({ code: 'ORDER_NOT_ELIGIBLE', message: blocked });
    const s = await this.settings.get(order.channel);
    const itemBlock = this.itemBlocked(dto.type, s, item.product);
    if (itemBlock) throw new BadRequestException({ code: 'ITEM_NOT_ELIGIBLE', message: itemBlock });

    const hours = lineWindowHours(item.returnWindowDays, dto.type === ReturnRequestType.RETURN ? s.returnWindowHours : s.exchangeWindowHours);
    if (hours === null && !override) throw new BadRequestException({ code: 'ITEM_NOT_ELIGIBLE', message: NOT_RETURNABLE });
    const win = windowCheck(order.deliveredAt, hours ?? 0);
    if (!win.ok && !override) throw new BadRequestException({ code: 'WINDOW_CLOSED', message: win.reason, closesAt: win.closesAt });

    const reason = await this.prisma.returnReason.findUnique({ where: { id: dto.reasonId } });
    if (!reason || !reason.isActive || (reason.channel && reason.channel !== order.channel)) throw new BadRequestException('Choose one of the listed reasons');
    if (dto.type === ReturnRequestType.RETURN ? !reason.forReturn : !reason.forExchange) {
      throw new BadRequestException(`"${reason.label}" is not a reason for ${dto.type === ReturnRequestType.RETURN ? 'a return' : 'an exchange'}`);
    }

    const media = [...new Set(dto.mediaUrls ?? [])];
    const needMedia = !staff && (s.mediaRequired || reason.requiresMedia);
    const minMedia = needMedia ? Math.max(1, s.minMediaCount) : 0;
    if (media.length < minMedia) throw new BadRequestException({ code: 'MEDIA_REQUIRED', message: `Add at least ${minMedia} photo${minMedia > 1 ? 's' : ''} or video${minMedia > 1 ? 's' : ''} of the product` });
    if (media.length > s.maxMediaCount) throw new BadRequestException(`Attach at most ${s.maxMediaCount} photos/videos`);

    // Refund method + payout details.
    const methods = this.refundMethodsFor(order, s);
    const method = dto.refundMethod ?? (methods.includes(s.defaultRefundMethod) ? s.defaultRefundMethod : methods[0]);
    if (!methods.includes(method)) throw new BadRequestException(`Refund by ${method} is not available for this order (${methods.join(', ')})`);
    if (dto.type === ReturnRequestType.RETURN && !staff) {
      if (method === RefundMethod.UPI && !dto.upiId) throw new BadRequestException('Enter the UPI id to refund to');
      if (method === RefundMethod.BANK && (!dto.accountNumber || !dto.ifsc || !dto.accountName)) {
        throw new BadRequestException('Enter the account holder name, account number and IFSC to refund to');
      }
    }

    // Money, frozen now from what was actually paid.
    const line = { quantity: item.quantity, lineTotal: Number(item.lineTotal), lineSubtotal: Number(item.lineSubtotal) };
    const qty = dto.quantity;
    if (qty > item.quantity) throw new BadRequestException(`Only ${item.quantity} were ordered`);
    const { unitPaid, itemValue } = paidValue(line, qty);
    const logistics = logisticsFor(order.fulfillmentMethod, order.warehouse.kind);

    let money: Partial<Prisma.ReturnRequestUncheckedCreateInput> = {};
    if (dto.type === ReturnRequestType.RETURN) {
      const r = refundFor(itemValue, reason.companyFault, {
        shippingPayer: s.returnShippingPayer, shippingFee: Number(s.returnShippingFee), restockingFeePercent: Number(s.restockingFeePercent),
      });
      const coins = coinsForLine(
        { subtotal: Number(order.subtotal), loyaltyRedeemedPoints: order.loyaltyRedeemedPoints, referralRedeemedPoints: order.referralRedeemedPoints }, line, qty,
      );
      money = { ...r, loyaltyPointsToRestore: coins.loyalty, referralPointsToRestore: coins.referral };
    } else {
      const replacementId = dto.replacementProductId ?? item.productId;
      const same = replacementId === item.productId;
      if (!same && s.exchangeSameProductOnly) throw new BadRequestException('Exchanges are for the same product only');
      const rp = await this.prisma.product.findUnique({ where: { id: replacementId }, select: { id: true, name: true, isActive: true, showOnStorefront: true, categoryId: true } });
      if (!rp || !rp.isActive || (!same && !rp.showOnStorefront)) throw new BadRequestException('That replacement product is not available');
      if (!same && s.exchangeSameCategoryOnly && rp.categoryId !== item.product.categoryId) throw new BadRequestException('Exchanges must be for a product in the same category');

      let unit = round2(itemValue / qty);
      let gst = Number(item.gstRatePercent);
      let total = itemValue;
      if (!same) {
        const price = await this.pricing.resolve({ productId: rp.id, channel: order.channel, customerType: customer.type as CustomerType, quantity: qty });
        unit = price.unitPrice;
        gst = price.gstRatePercent;
        total = inclusiveTotal(price.unitPrice, price.gstRatePercent, qty);
      }
      const available = await availableByProduct(this.prisma as unknown as Tx, order.warehouseId, [rp.id]);
      if ((available.get(rp.id) ?? 0) < qty) {
        throw new ConflictException({
          code: 'REPLACEMENT_OUT_OF_STOCK',
          message: `${rp.name} is out of stock for an exchange right now. You can request a return instead.`,
          available: available.get(rp.id) ?? 0,
        });
      }
      const diff = exchangeDifference({ sameProduct: same, itemValue, replacementTotal: total });
      money = {
        replacementProductId: rp.id, replacementName: rp.name, replacementUnitPrice: unit, replacementGstRate: gst, replacementTotal: total,
        priceDifference: diff,
        differenceStatus: diff > 0 ? ExchangeDifferenceStatus.PENDING : ExchangeDifferenceStatus.NONE,
        refundAmount: diff < 0 && s.exchangeLowerPriceAction === 'REFUND_TO_WALLET' ? -diff : 0,
      };
    }

    const actor: Actor = staff ? { kind: 'STAFF', id: opts.staffId } : { kind: 'CUSTOMER', id: customer.id };
    let created: ReturnRequest;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        // Serialise every request on this line: two taps, two tabs or two
        // staff members can never both pass the quantity check below.
        await tx.$queryRaw`SELECT id FROM order_items WHERE id = ${item.id} FOR UPDATE`;
        const existing = await tx.returnRequest.findMany({ where: { orderItemId: item.id }, select: { quantity: true, status: true, requestNumber: true } });
        const remaining = Math.max(0, remainingQuantity(item.quantity, existing) - (await this.legacyReturned(tx, item.id)));
        if (qty > remaining) {
          const open = existing.filter((e) => OPEN_STATUSES.includes(e.status));
          throw new ConflictException({
            code: remaining === 0 ? 'DUPLICATE_REQUEST' : 'QUANTITY_EXCEEDED',
            message: remaining === 0
              ? open.length ? `A request (${open.map((o) => o.requestNumber).join(', ')}) is already open for this item` : 'This item has already been returned or exchanged'
              : `Only ${remaining} of this item can still be returned or exchanged`,
            remaining,
          });
        }
        const now = new Date();
        const requestNumber = await this.sequence.next(tx, dto.type === ReturnRequestType.RETURN ? 'RET' : 'EXC', now);
        const row = await tx.returnRequest.create({
          data: {
            requestNumber, type: dto.type, channel: order.channel, logistics,
            orderId: order.id, orderItemId: item.id, customerId: customer.id, quantity: qty,
            reasonId: reason.id, reasonLabel: reason.label, companyFault: reason.companyFault,
            description: dto.description?.trim() || null, mediaUrls: media,
            raisedBy: staff ? 'STAFF' : 'STOREFRONT', raisedById: opts.staffId ?? null,
            unitPaid, itemValue, ...money,
            refundMethod: method, refundUpiId: dto.upiId ?? null, refundAccountName: dto.accountName ?? null,
            refundAccountNumber: dto.accountNumber ?? null, refundIfsc: dto.ifsc ?? null, refundBankName: dto.bankName ?? null,
            warehouseId: order.warehouseId,
            adminNote: staff ? (dto as StaffCreateReturnRequestDto).note?.trim() || null : null,
            idempotencyKey: opts.idempotencyKey ?? null,
          },
        });
        await tx.returnRequestEvent.create({
          data: {
            requestId: row.id, type: 'REQUESTED', toStatus: S.REQUESTED, actorKind: actor.kind, actorId: actor.id ?? null,
            note: override ? `Raised by staff outside the window: ${(dto as StaffCreateReturnRequestDto).note}` : staff ? 'Raised by staff on the customer\'s behalf' : undefined,
          },
        });
        return row;
      }, { timeout: 20_000 });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && opts.idempotencyKey) {
        const won = await this.prisma.returnRequest.findUnique({ where: { customerId_idempotencyKey: { customerId: customer.id, idempotencyKey: opts.idempotencyKey } } });
        if (won) return this.customerView(await this.load(won.id));
      }
      throw e;
    }

    await this.notify(created, S.REQUESTED, actor);
    const b2b = order.channel === 'B2B';
    void this.staffAlerts?.notify({
      type: 'RETURN_REQUEST',
      title: `New ${b2b ? 'retailer ' : ''}${created.type === 'EXCHANGE' ? 'exchange' : 'return'} request`,
      body: `${created.requestNumber} · order ${order.orderNumber} · ${customer.name}${s.autoApprove ? ' (auto-approved)' : ' - waiting for review'}`,
      link: b2b ? '/returns/retailers' : '/returns/customers',
      permission: b2b ? 'returns.b2b.manage' : 'returns.b2c.manage',
    });
    if (s.autoApprove) {
      await this.approve(order.channel, created.id, { note: 'Auto-approved by policy' }, { kind: 'SYSTEM' }).catch(async (e) => {
        await this.log(created.id, 'AUTO_APPROVE_FAILED', { kind: 'SYSTEM' }, e instanceof HttpException ? this.messageOf(e) : String(e));
      });
    }
    return this.customerView(await this.load(created.id));
  }

  private messageOf(e: HttpException) {
    const r = e.getResponse();
    return typeof r === 'string' ? r : ((r as { message?: string | string[] }).message?.toString() ?? e.message);
  }

  // ================================================================ approve / reject / cancel

  async approve(channel: SalesChannel, id: string, dto: ApproveDto, actor: Actor) {
    const req = await this.forChannel(channel, id);
    if (req.status !== S.REQUESTED) throw new ConflictException(`This request is already ${STATUS_LABEL[req.status].toLowerCase()}`);
    const logistics = dto.logistics ?? req.logistics;
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.move(tx, req, S.APPROVED, actor, {
          note: dto.note,
          data: { approvedAt: new Date(), approvedById: actor.id ?? null, logistics, adminNote: dto.note?.trim() || req.adminNote },
        });
        if (req.type === ReturnRequestType.EXCHANGE) {
          const picked = await reserveReplacement(tx, { requestId: req.id, warehouseId: req.warehouseId, productId: req.replacementProductId!, quantity: req.quantity });
          await tx.returnRequest.update({ where: { id: req.id }, data: { replacementReservedAt: new Date() } });
          await this.log(req.id, 'REPLACEMENT_RESERVED', actor, picked.map((p) => `${p.fgBatchNumber} x${p.quantity}`).join(', '), tx);
        }
      }, { timeout: 20_000 });
    } catch (e) {
      if (e instanceof OutOfStockException) {
        throw new ConflictException({
          code: 'REPLACEMENT_OUT_OF_STOCK',
          message: 'The replacement is out of stock at this node - reject the exchange, wait for stock, or convert it to a return.',
        });
      }
      throw e;
    }
    await this.notify(req, S.APPROVED, actor);
    if (dto.schedulePickup !== false) {
      try {
        await this.schedulePickup(channel, id, actor);
      } catch (e) {
        const why = e instanceof HttpException ? this.messageOf(e) : String(e);
        await this.log(req.id, 'PICKUP_NOT_SCHEDULED', { kind: 'SYSTEM' }, why);
        return { ...(await this.staffView(await this.load(id))), warning: `Approved, but the pickup could not be scheduled: ${why}` };
      }
    }
    return this.staffView(await this.load(id));
  }

  async reject(channel: SalesChannel, id: string, reason: string, actor: Actor) {
    const req = await this.forChannel(channel, id);
    await this.prisma.$transaction((tx) => this.move(tx, req, S.REJECTED, actor, { note: reason, data: { rejectedReason: reason } }));
    await this.notify(req, S.REJECTED, actor, reason);
    return this.staffView(await this.load(id));
  }

  /** Before the item is collected. Gives back reserved stock and any difference already paid. */
  async cancel(req: Loaded, reason: string, actor: Actor) {
    const allowed: S[] = actor.kind === 'CUSTOMER'
      ? [S.REQUESTED, S.APPROVED, S.PICKUP_SCHEDULED]
      : [S.REQUESTED, S.APPROVED, S.PICKUP_SCHEDULED, S.PICKUP_FAILED];
    if (!allowed.includes(req.status)) {
      throw new ConflictException(actor.kind === 'CUSTOMER' ? 'This request can no longer be cancelled - the item has been collected' : `A request that is ${STATUS_LABEL[req.status].toLowerCase()} cannot be cancelled`);
    }
    await this.prisma.$transaction(async (tx) => {
      await this.move(tx, req, S.CANCELLED, actor, { note: reason, data: { cancelledAt: new Date(), cancelReason: reason } });
      await releaseReplacement(tx, req.id, 'Request cancelled');
      await this.giveBackDifference(tx, req, 'Exchange cancelled');
      await tx.returnShipment.updateMany({ where: { requestId: req.id, isActive: true }, data: { isActive: false } });
    });
    await this.cancelLiveTasks(req.id, `Request ${req.requestNumber} cancelled`, actor);
    await this.notify(req, S.CANCELLED, actor, reason);
  }

  /** Money the customer paid towards an exchange's difference goes back to their Refund Wallet. */
  private async giveBackDifference(tx: Tx, req: Loaded, note: string) {
    if (req.differenceStatus !== ExchangeDifferenceStatus.PAID) return;
    const paid = round2(Number(req.priceDifference));
    if (paid <= 0) return;
    await this.wallet.credit(tx, {
      customerId: req.customerId, amount: paid, reason: RefundWalletReason.EXCHANGE_DIFFERENCE_REVERSAL, returnRequestId: req.id, orderId: req.orderId,
      note: `${note} - price difference returned`,
    });
    await tx.returnRequest.update({ where: { id: req.id }, data: { differenceStatus: ExchangeDifferenceStatus.WAIVED } });
  }

  private async cancelLiveTasks(requestId: string, reason: string, actor: Actor) {
    const tasks = await this.prisma.deliveryTask.findMany({ where: { returnRequestId: requestId, status: { in: LIVE_STATUSES } }, select: { id: true } });
    for (const t of tasks) await this.dispatch.cancelTask(t.id, reason, actor.kind === 'STAFF' ? actor.id ?? undefined : undefined);
  }

  // ================================================================ pickup

  private dropFor(req: Loaded) {
    const a = (req.order.addressSnapshot ?? {}) as Record<string, unknown>;
    const hasSnapshot = typeof a.line1 === 'string';
    return {
      fullName: String(a.fullName ?? req.customer.name),
      phone: String(a.phone ?? req.customer.phone),
      line1: hasSnapshot ? String(a.line1) : (req.order.deliveryAddress ?? req.customer.shippingAddress ?? req.customer.billingAddress),
      line2: (a.line2 as string | null) ?? null,
      landmark: (a.landmark as string | null) ?? null,
      city: String(a.city ?? ''),
      state: String(a.state ?? ''),
      pincode: String(a.pincode ?? ''),
      latitude: typeof a.latitude === 'number' ? a.latitude : null,
      longitude: typeof a.longitude === 'number' ? a.longitude : null,
    };
  }

  /**
   * Book the collection: a rider task (Quick) or a Shiprocket reverse pickup.
   * Also the reschedule after a failure.
   *
   * Safe to call twice. The request row is locked for the whole booking, so a
   * double click, a second tab or a client retry waits for the first call and
   * then finds the pickup already booked - it gets the current state back
   * (`alreadyScheduled`) instead of a second rider trip or a second courier
   * AWB. The courier call sits inside the lock for the same reason.
   */
  async schedulePickup(channel: SalesChannel, id: string, actor: Actor) {
    const req = await this.forChannel(channel, id);
    const drop = this.dropFor(req);

    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM return_requests WHERE id = ${req.id} FOR UPDATE`;
      const fresh = await tx.returnRequest.findUniqueOrThrow({ where: { id: req.id }, select: { status: true, logistics: true, pickupOtp: true } });
      if (fresh.status === S.PICKUP_SCHEDULED) return { replay: true as const };
      if (fresh.status !== S.APPROVED && fresh.status !== S.PICKUP_FAILED) {
        throw new ConflictException(`A pickup can be scheduled for an approved request (this one is ${STATUS_LABEL[fresh.status].toLowerCase()})`);
      }
      req.status = fresh.status;

      if (fresh.logistics === ReturnLogistics.QUICK_DELIVERY) {
        const prior = await tx.deliveryTask.count({ where: { returnRequestId: req.id, kind: 'RETURN_PICKUP' } });
        const t = await tx.deliveryTask.create({
          data: {
            taskNumber: await this.sequence.next(tx, 'DT', new Date()),
            kind: 'RETURN_PICKUP',
            returnRequestId: req.id,
            attempt: prior + 1,
            speed: req.order.deliverySpeed,
            warehouseId: req.warehouseId,
            zoneId: req.order.deliveryZoneId,
            dropName: drop.fullName,
            dropPhone: drop.phone,
            dropAddress: [drop.line1, drop.line2, drop.landmark, drop.city, drop.state, drop.pincode].filter(Boolean).join(', '),
            dropLatitude: drop.latitude,
            dropLongitude: drop.longitude,
            distanceKm: req.order.distanceKm,
            codAmount: 0,
          },
        });
        await this.dispatch.log(t.id, 'READY', { note: `Return pickup for ${req.requestNumber} (attempt ${t.attempt})`, actorUserId: actor.kind === 'STAFF' ? actor.id : null }, tx);
        await this.move(tx, req, S.PICKUP_SCHEDULED, actor, {
          note: `Rider pickup ${t.taskNumber} - offered to the nearest riders`,
          data: { pickupScheduledAt: new Date(), pickupOtp: fresh.pickupOtp ?? otp4(), pickupOtpAttempts: 0, failureReason: null },
        });
        return { task: t };
      }

      const prior = await tx.returnShipment.count({ where: { requestId: req.id, direction: ReturnShipmentDirection.REVERSE } });
      const item = req.orderItem;
      let booked;
      try {
        booked = await this.shipping.createReturnShipment({
          returnNumber: prior === 0 ? req.requestNumber : `${req.requestNumber}-${prior + 1}`,
          orderDate: new Date(),
          pickup: { fullName: drop.fullName, phone: drop.phone, line1: drop.line1, line2: drop.line2, city: drop.city, state: drop.state, pincode: drop.pincode },
          items: [{ name: item.nameSnapshot ?? item.product.name, sku: item.skuSnapshot ?? item.product.sku, units: req.quantity, sellingPrice: Number(req.unitPaid) }],
          subtotal: Number(req.itemValue),
          reason: req.reasonLabel,
        });
      } catch (e) {
        throw new BadGatewayException(`The courier could not book the pickup: ${e instanceof Error ? e.message : String(e)}`);
      }
      await tx.returnShipment.updateMany({ where: { requestId: req.id, direction: ReturnShipmentDirection.REVERSE, isActive: true }, data: { isActive: false } });
      await tx.returnShipment.create({
        data: {
          requestId: req.id, direction: ReturnShipmentDirection.REVERSE, provider: booked.provider, awb: booked.awb, courier: booked.courier,
          trackingUrl: booked.trackingUrl, labelUrl: booked.labelUrl, providerRef: booked.providerRef,
          events: [{ at: new Date().toISOString(), status: 'CREATED', note: `${booked.courier} reverse AWB ${booked.awb}` }],
        },
      });
      await this.move(tx, req, S.PICKUP_SCHEDULED, actor, {
        note: `${booked.courier} reverse pickup, AWB ${booked.awb}`,
        data: { pickupScheduledAt: new Date(), failureReason: null },
      });
      return { task: null };
    }, { timeout: 45_000 });

    if ('replay' in outcome) return { ...(await this.staffView(await this.load(id))), alreadyScheduled: true };
    if (outcome.task) {
      // Broadcast after commit, exactly as for an order: the outlet's nearest
      // free riders get it at once, first to accept wins; nobody -> staff assign.
      this.dispatch.changed(outcome.task);
      await this.dispatch.dispatch(outcome.task.id).catch((e) => this.logger.warn(`dispatch ${outcome.task.taskNumber}: ${String(e)}`));
    }
    await this.notify(req, S.PICKUP_SCHEDULED, actor);
    return this.staffView(await this.load(id));
  }

  /** Staff record that the courier (or a walk-in at the store) collected it. */
  async markPickedUp(channel: SalesChannel, id: string, actor: Actor, note?: string) {
    const req = await this.forChannel(channel, id);
    const live = await this.prisma.deliveryTask.count({ where: { returnRequestId: id, kind: 'RETURN_PICKUP', status: { in: LIVE_STATUSES } } });
    if (live > 0) throw new ConflictException('A rider is on this pickup - it is recorded from the rider app (or cancel the task first)');
    await this.prisma.$transaction((tx) => this.move(tx, req, S.PICKED_UP, actor, { note, data: { pickedUpAt: new Date() } }));
    await this.notify(req, S.PICKED_UP, actor);
    return this.staffView(await this.load(id));
  }

  async markPickupFailed(channel: SalesChannel, id: string, reason: string, actor: Actor) {
    const req = await this.forChannel(channel, id);
    await this.prisma.$transaction(async (tx) => {
      await this.move(tx, req, S.PICKUP_FAILED, actor, { note: reason, data: { failureReason: reason } });
      await tx.returnShipment.updateMany({ where: { requestId: id, direction: ReturnShipmentDirection.REVERSE, isActive: true }, data: { isActive: false } });
    });
    await this.cancelLiveTasks(id, `Pickup failed: ${reason}`, actor);
    await this.notify(req, S.PICKUP_FAILED, actor, reason);
    return this.staffView(await this.load(id));
  }

  /**
   * The goods are at the warehouse. With QC switched off for the channel this
   * IS the inspection: everything is accepted as good, per the inventory rule.
   */
  async receive(req: Loaded, actor: Actor, note?: string) {
    const receivable: S[] = [S.PICKED_UP, S.PICKUP_SCHEDULED, S.APPROVED, S.PICKUP_FAILED];
    if (!receivable.includes(req.status)) {
      throw new ConflictException(`Only an approved or collected item can be received (this one is ${STATUS_LABEL[req.status].toLowerCase()})`);
    }
    await this.prisma.$transaction(async (tx) => {
      if (req.status !== S.PICKED_UP) {
        await this.move(tx, req, S.PICKED_UP, actor, { note: 'Handed in directly', data: { pickedUpAt: new Date() } });
      }
      await this.move(tx, req, S.QC, actor, { note, data: { receivedAt: new Date() } });
      await tx.returnShipment.updateMany({ where: { requestId: req.id, direction: ReturnShipmentDirection.REVERSE, isActive: true }, data: { externalStatus: 'RECEIVED' } });
    });
    await this.cancelLiveTasks(req.id, 'Item received at the store', actor);
    await this.notify(req, S.QC, actor);
    const s = await this.settings.get(req.channel);
    if (!s.qcRequired) {
      const fresh = await this.load(req.id);
      await this.qc(fresh, { decision: QcDecision.ACCEPT, goodQuantity: req.quantity, damagedQuantity: 0, notes: 'QC not required by policy' },
        actor.kind === 'STAFF' && actor.id ? actor : { kind: 'SYSTEM', id: await this.systemUserId() });
    }
  }

  // ================================================================ QC

  async qc(req: Loaded, dto: QcDto, actor: Actor) {
    if (req.status !== S.QC) throw new ConflictException(`Quality check is for received items (this one is ${STATUS_LABEL[req.status].toLowerCase()})`);
    if (dto.goodQuantity + dto.damagedQuantity !== req.quantity) {
      throw new BadRequestException(`Good + damaged must add up to the ${req.quantity} pack${req.quantity > 1 ? 's' : ''} returned`);
    }
    const s = await this.settings.get(req.channel);
    const performer = actor.id && actor.kind !== 'CUSTOMER' && actor.kind !== 'RIDER' ? actor.id : await this.systemUserId();
    await this.prisma.$transaction(async (tx) => {
      const moved = await receiveReturnedStock(tx, {
        requestId: req.id, requestNumber: req.requestNumber, orderItemId: req.orderItemId, warehouseId: req.warehouseId,
        good: dto.goodQuantity, damaged: dto.damagedQuantity, restockGood: s.restockOnQcPass, performedById: performer,
      });
      await tx.returnRequest.update({
        where: { id: req.id },
        data: { qcDecision: dto.decision, qcGoodQuantity: dto.goodQuantity, qcDamagedQuantity: dto.damagedQuantity, qcNotes: dto.notes?.trim() || null, qcAt: new Date(), qcById: performer },
      });
      const stockNote = moved.map((m) => `${m.quantity} ${m.disposition === 'GOOD' ? 'to stock' : 'to damaged'}`).join(', ');
      if (dto.decision === QcDecision.REJECT) {
        await this.move(tx, req, S.QC_FAILED, actor, { note: [dto.notes, stockNote].filter(Boolean).join(' | ') });
        await releaseReplacement(tx, req.id, 'Exchange failed QC');
        await this.giveBackDifference(tx, req, 'Exchange failed QC');
        return;
      }
      if (req.type === ReturnRequestType.RETURN) {
        await this.recordGoodsBack(tx, req, performer);
        await this.move(tx, req, S.REFUND_INITIATED, actor, { note: [dto.notes, stockNote].filter(Boolean).join(' | ') });
      } else {
        await this.move(tx, req, S.REPLACEMENT_PROCESSING, actor, { note: [dto.notes, stockNote].filter(Boolean).join(' | ') });
      }
    }, { timeout: 20_000 });
    const after = dto.decision === QcDecision.REJECT ? S.QC_FAILED : req.type === ReturnRequestType.RETURN ? S.REFUND_INITIATED : S.REPLACEMENT_PROCESSING;
    await this.notify(req, after, actor, dto.decision === QcDecision.REJECT ? dto.notes : undefined);
  }

  /**
   * The goods are back for good (or lost by the courier after the customer
   * handed them over): write the OrderReturn row and take back the loyalty
   * points those units earned - the existing reversal machinery, unchanged -
   * and the affiliate commission on those units (per item, pro-rata).
   */
  private async recordGoodsBack(tx: Tx, req: Loaded, performerId: string) {
    const exists = await tx.orderReturn.findUnique({ where: { returnRequestId: req.id } });
    if (exists) return;
    const created = await tx.orderReturn.create({
      data: {
        orderId: req.orderId, orderItemId: req.orderItemId, quantity: req.quantity, returnRequestId: req.id,
        reason: `${req.requestNumber}: ${req.reasonLabel}`, refundAmount: req.refundAmount, recordedById: performerId,
      },
    });
    await this.loyalty.reverseForReturn(tx, req.orderId, [req.orderItemId]);
    await this.affiliates.onGoodsReturned(tx, created);
  }

  /** A courier lost / destroyed the parcel after collecting it: settle without receipt. */
  async markLostInTransit(channel: SalesChannel, id: string, reason: string, actor: Actor) {
    const req = await this.forChannel(channel, id);
    if (req.status !== S.PICKED_UP) throw new ConflictException('Only a collected parcel can be lost in transit (before collection, record a failed pickup)');
    const performer = actor.id ?? (await this.systemUserId());
    await this.prisma.$transaction(async (tx) => {
      await tx.returnRequest.update({ where: { id }, data: { lostInTransit: true } });
      if (req.type === ReturnRequestType.RETURN) {
        await this.recordGoodsBack(tx, req, performer);
        await this.move(tx, req, S.REFUND_INITIATED, actor, { type: 'LOST_IN_TRANSIT', note: reason });
      } else {
        await this.move(tx, req, S.REPLACEMENT_PROCESSING, actor, { type: 'LOST_IN_TRANSIT', note: reason });
      }
    });
    await this.notify(req, req.status, actor);
    return this.staffView(await this.load(id));
  }

  // ================================================================ refund

  async completeRefund(channel: SalesChannel, id: string, dto: CompleteRefundDto, actor: Actor) {
    const req = await this.forChannel(channel, id);
    if (req.status !== S.REFUND_INITIATED) throw new ConflictException(`Refunds are completed from "refund initiated" (this one is ${STATUS_LABEL[req.status].toLowerCase()})`);
    const s = await this.settings.get(channel);
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: req.orderId } });
    const methods = this.refundMethodsFor(order, s);
    const method = dto.refundMethod ?? req.refundMethod ?? methods[0];
    if (!methods.includes(method)) throw new BadRequestException(`Refund by ${method} is not available for this order (${methods.join(', ')})`);

    const upiId = dto.upiId ?? req.refundUpiId;
    const acct = { name: dto.accountName ?? req.refundAccountName, number: dto.accountNumber ?? req.refundAccountNumber, ifsc: dto.ifsc ?? req.refundIfsc, bank: dto.bankName ?? req.refundBankName };
    if (method === RefundMethod.UPI) {
      if (!upiId) throw new BadRequestException('Record the UPI id the refund was paid to');
      if (!dto.reference?.trim()) throw new BadRequestException('Record the UPI transaction reference');
    }
    if (method === RefundMethod.BANK) {
      if (!acct.number || !acct.ifsc || !acct.name) throw new BadRequestException('Record the account holder, account number and IFSC');
      if (!dto.reference?.trim()) throw new BadRequestException('Record the bank transfer reference (UTR)');
    }

    const amount = round2(Number(req.refundAmount));
    const performer = actor.id ?? (await this.systemUserId());
    const summary: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      await this.move(tx, req, S.COMPLETED, actor, {
        type: 'REFUNDED',
        note: dto.note,
        data: {
          refundMethod: method, refundUpiId: upiId, refundAccountName: acct.name, refundAccountNumber: acct.number, refundIfsc: acct.ifsc, refundBankName: acct.bank,
          refundReference: dto.reference?.trim() || null, refundNote: dto.note?.trim() || null, refundedAt: new Date(), refundedById: performer, completedAt: new Date(),
        },
      });

      if (amount > 0) {
        if (method === RefundMethod.WALLET) {
          await this.wallet.credit(tx, {
            customerId: req.customerId, amount, reason: req.type === ReturnRequestType.RETURN ? RefundWalletReason.RETURN_REFUND : RefundWalletReason.EXCHANGE_DIFFERENCE_CREDIT,
            returnRequestId: req.id, orderId: req.orderId, performedById: performer, note: `Refund for ${req.requestNumber}`,
          });
          summary.push(`₹${amount.toFixed(2)} to Refund Wallet`);
        } else if (method === RefundMethod.CREDIT_NOTE) {
          summary.push(...(await this.applyCreditNote(tx, req, amount, performer)));
        } else {
          summary.push(`₹${amount.toFixed(2)} by ${method === RefundMethod.UPI ? `UPI to ${upiId}` : `bank transfer to ${acct.number}`} (ref ${dto.reference})`);
        }
      }
      const coins = await this.restoreCoins(tx, req);
      if (coins) summary.push(coins);
    }, { timeout: 20_000 });

    await this.log(req.id, 'REFUND_SUMMARY', actor, summary.join('; ') || 'Nothing to refund');
    // GST: goods came back, so the invoice's tax is reduced by a credit note. Best-effort; the sweep retries.
    await this.creditNotes.onReturnRefunded(req.id, actor.id ?? null);
    await this.notify(req, S.COMPLETED, actor, summary[0]);
    return this.staffView(await this.load(id));
  }

  /**
   * B2B credit order: the refund reduces what the retailer owes, as a receipt
   * applied to the order through the existing Receivables tables (so the
   * statement of account shows it). Anything beyond what is owed goes to the wallet.
   */
  private async applyCreditNote(tx: Tx, req: Loaded, amount: number, performer: string): Promise<string[]> {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${req.orderId} FOR UPDATE`;
    const o = await tx.order.findUniqueOrThrow({ where: { id: req.orderId } });
    const apply = round2(Math.min(amount, this.outstanding(o)));
    const out: string[] = [];
    if (apply > 0) {
      const now = new Date();
      const receivedOn = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
      const receiptNumber = await this.sequence.next(tx, 'RCPT', receivedOn);
      await tx.creditReceipt.create({
        data: {
          receiptNumber, customerId: req.customerId, amount: apply, method: 'OTHER', reference: req.requestNumber, receivedOn,
          note: `Credit note - goods returned on ${req.requestNumber}`, recordedById: performer,
          allocations: { create: [{ orderId: req.orderId, amount: apply }] },
        },
      });
      const paid = round2(Number(o.amountPaid) + apply);
      await tx.order.update({ where: { id: o.id }, data: { amountPaid: paid, paymentStatus: statusAfter(Number(o.total), paid) } });
      out.push(`₹${apply.toFixed(2)} credit note against ${o.orderNumber} (${receiptNumber})`);
    }
    const excess = round2(amount - apply);
    if (excess > 0) {
      await this.wallet.credit(tx, {
        customerId: req.customerId, amount: excess, reason: RefundWalletReason.RETURN_REFUND, returnRequestId: req.id, orderId: req.orderId,
        performedById: performer, note: `Refund for ${req.requestNumber} beyond the amount owed`,
      });
      out.push(`₹${excess.toFixed(2)} to Refund Wallet`);
    }
    return out;
  }

  /**
   * Coins redeemed on the order belong partly to the returned units: give that
   * share back, never more than was spent minus what was already given back
   * (a cancellation or an earlier return of the same order).
   */
  private async restoreCoins(tx: Tx, req: Loaded): Promise<string | null> {
    const parts: string[] = [];
    const pools = [
      { points: req.loyaltyPointsToRestore, spend: CoinTransactionReason.LOYALTY_REDEMPTION, back: CoinTransactionReason.LOYALTY_REDEMPTION_REFUND, source: CoinSource.LOYALTY, label: 'loyalty points' },
      { points: req.referralPointsToRestore, spend: CoinTransactionReason.REFERRAL_REDEMPTION, back: CoinTransactionReason.REFERRAL_REDEMPTION_REFUND, source: CoinSource.REFERRAL, label: 'referral coins' },
    ] as const;
    for (const p of pools) {
      if (p.points <= 0) continue;
      const rows = await tx.coinTransaction.findMany({ where: { orderId: req.orderId, reason: { in: [p.spend, p.back] } }, select: { amount: true, reason: true } });
      const spent = -rows.filter((r) => r.reason === p.spend).reduce((n, r) => n + r.amount, 0);
      const back = rows.filter((r) => r.reason === p.back).reduce((n, r) => n + r.amount, 0);
      const give = Math.min(p.points, spent - back);
      if (give <= 0) continue;
      await tx.coinTransaction.create({
        data: { customerId: req.customerId, amount: give, reason: p.back, source: p.source, orderId: req.orderId, note: `Returned on ${req.requestNumber}` },
      });
      await tx.customer.update({
        where: { id: req.customerId },
        data: p.source === CoinSource.LOYALTY
          ? { coinBalance: { increment: give }, loyaltyCoinBalance: { increment: give } }
          : { coinBalance: { increment: give }, referralCoinBalance: { increment: give } },
      });
      parts.push(`${give} ${p.label} returned`);
    }
    return parts.length ? parts.join(', ') : null;
  }

  // ================================================================ exchange: price difference

  private assertDifferencePayable(req: Loaded) {
    if (req.type !== ReturnRequestType.EXCHANGE || req.differenceStatus !== ExchangeDifferenceStatus.PENDING) {
      throw new ConflictException('There is no price difference to pay on this request');
    }
    const payable: S[] = [S.APPROVED, S.PICKUP_SCHEDULED, S.PICKED_UP, S.QC, S.REPLACEMENT_PROCESSING, S.PICKUP_FAILED, S.DELIVERY_FAILED];
    if (!payable.includes(req.status)) throw new ConflictException('The difference can be paid once the exchange is approved');
  }

  /** Pay from the Refund Wallet first (optional); whatever is left opens a gateway payment. */
  async payDifference(customer: Customer, requestNumber: string, useWallet: boolean) {
    const req = await this.mine(customer.id, requestNumber);
    this.assertDifferencePayable(req);
    const due = round2(Number(req.priceDifference) - Number(req.differencePaidWallet));
    let walletUsed = 0;
    if (useWallet && due > 0) {
      const balance = await this.wallet.balance(customer.id);
      walletUsed = round2(Math.min(balance, due));
      if (walletUsed > 0) {
        await this.prisma.$transaction(async (tx) => {
          await this.wallet.debit(tx, {
            customerId: customer.id, amount: walletUsed, reason: RefundWalletReason.EXCHANGE_DIFFERENCE_PAYMENT, returnRequestId: req.id, orderId: req.orderId,
            note: `Price difference for ${req.requestNumber}`,
          });
          await tx.returnRequest.update({ where: { id: req.id }, data: { differencePaidWallet: { increment: walletUsed } } });
          if (walletUsed >= due) {
            await tx.returnRequest.update({ where: { id: req.id }, data: { differenceStatus: ExchangeDifferenceStatus.PAID, differenceReference: 'Refund Wallet' } });
          }
          await this.log(req.id, 'DIFFERENCE_WALLET', { kind: 'CUSTOMER', id: customer.id }, `₹${walletUsed.toFixed(2)} from Refund Wallet`, tx);
        });
      }
    }
    const left = round2(due - walletUsed);
    if (left <= 0) return { paid: true, walletUsed, amountDue: 0, gateway: null };
    let gw;
    try {
      gw = await this.gateway.createOrder({ amountRupees: left, receipt: req.requestNumber });
    } catch {
      throw new BadGatewayException('We could not start the payment - please try again');
    }
    await this.prisma.returnRequest.update({ where: { id: req.id }, data: { differenceGatewayOrderId: gw.gatewayOrderId } });
    return { paid: false, walletUsed, amountDue: left, gateway: gw.clientConfig };
  }

  async confirmDifference(customer: Customer, requestNumber: string, dto: ConfirmDifferenceDto) {
    const req = await this.mine(customer.id, requestNumber);
    if (req.differenceStatus === ExchangeDifferenceStatus.PAID) return { paid: true };
    this.assertDifferencePayable(req);
    if (!req.differenceGatewayOrderId) throw new BadRequestException('Start the payment first');
    const ok = this.gateway.verifyPayment({ gatewayOrderId: req.differenceGatewayOrderId, paymentId: dto.gatewayPaymentId, signature: dto.signature });
    if (!ok) throw new BadRequestException({ code: 'PAYMENT_FAILED', message: 'The payment could not be verified. Nothing was recorded - please try again.' });
    const res = await this.prisma.returnRequest.updateMany({
      where: { id: req.id, differenceStatus: ExchangeDifferenceStatus.PENDING },
      data: { differenceStatus: ExchangeDifferenceStatus.PAID, differenceGatewayPaymentId: dto.gatewayPaymentId, differenceReference: dto.gatewayPaymentId },
    });
    if (res.count === 1) await this.log(req.id, 'DIFFERENCE_PAID', { kind: 'CUSTOMER', id: customer.id }, `Paid online (${dto.gatewayPaymentId})`);
    return { paid: true };
  }

  async recordDifference(channel: SalesChannel, id: string, reference: string, actor: Actor) {
    const req = await this.forChannel(channel, id);
    this.assertDifferencePayable(req);
    await this.prisma.returnRequest.update({ where: { id }, data: { differenceStatus: ExchangeDifferenceStatus.PAID, differenceReference: reference } });
    await this.log(id, 'DIFFERENCE_PAID', actor, `Collected outside the app (ref ${reference})`);
    return this.staffView(await this.load(id));
  }

  async waiveDifference(channel: SalesChannel, id: string, reason: string, actor: Actor) {
    const req = await this.forChannel(channel, id);
    this.assertDifferencePayable(req);
    await this.prisma.returnRequest.update({ where: { id }, data: { differenceStatus: ExchangeDifferenceStatus.WAIVED } });
    await this.log(id, 'DIFFERENCE_WAIVED', actor, reason);
    return this.staffView(await this.load(id));
  }

  // ================================================================ exchange: replacement

  /** Send the replacement: a rider task (Quick) or a forward Shiprocket shipment. */
  async dispatchReplacement(channel: SalesChannel, id: string, actor: Actor) {
    const req = await this.forChannel(channel, id);
    if (req.type !== ReturnRequestType.EXCHANGE) throw new BadRequestException('Only exchanges have a replacement');
    if (req.status !== S.REPLACEMENT_PROCESSING) throw new ConflictException(`The replacement ships after QC passes (this request is ${STATUS_LABEL[req.status].toLowerCase()})`);
    if (req.differenceStatus === ExchangeDifferenceStatus.PENDING) {
      throw new ConflictException({ code: 'DIFFERENCE_UNPAID', message: `The customer still owes ₹${Number(req.priceDifference).toFixed(2)} - record or waive it first` });
    }
    // Reservation may have been released (e.g. lost earlier) - take it again atomically.
    const live = await this.prisma.returnReplacementAllocation.count({ where: { requestId: id, releasedAt: null } });
    if (live === 0) {
      try {
        await this.prisma.$transaction((tx) => reserveReplacement(tx, { requestId: id, warehouseId: req.warehouseId, productId: req.replacementProductId!, quantity: req.quantity }));
      } catch (e) {
        if (e instanceof OutOfStockException) throw new ConflictException({ code: 'REPLACEMENT_OUT_OF_STOCK', message: 'The replacement is out of stock - wait for stock or convert this exchange to a refund' });
        throw e;
      }
    }
    const drop = this.dropFor(req);

    if (req.logistics === ReturnLogistics.QUICK_DELIVERY) {
      const open = await this.prisma.deliveryTask.findFirst({ where: { returnRequestId: id, kind: 'REPLACEMENT_DELIVERY', status: { in: [...LIVE_STATUSES, 'FAILED'] } } });
      if (open) throw new ConflictException(`Replacement delivery ${open.taskNumber} is already in progress`);
      const prior = await this.prisma.deliveryTask.count({ where: { returnRequestId: id, kind: 'REPLACEMENT_DELIVERY' } });
      const task = await this.prisma.$transaction(async (tx) => {
        const t = await tx.deliveryTask.create({
          data: {
            taskNumber: await this.sequence.next(tx, 'DT', new Date()),
            kind: 'REPLACEMENT_DELIVERY', returnRequestId: id, attempt: prior + 1, speed: req.order.deliverySpeed,
            warehouseId: req.warehouseId, zoneId: req.order.deliveryZoneId,
            dropName: drop.fullName, dropPhone: drop.phone,
            dropAddress: [drop.line1, drop.line2, drop.landmark, drop.city, drop.state, drop.pincode].filter(Boolean).join(', '),
            dropLatitude: drop.latitude, dropLongitude: drop.longitude, distanceKm: req.order.distanceKm, codAmount: 0,
          },
        });
        await this.dispatch.log(t.id, 'READY', { note: `Exchange replacement for ${req.requestNumber}`, actorUserId: actor.kind === 'STAFF' ? actor.id : null }, tx);
        await tx.returnRequest.update({ where: { id }, data: { replacementOtp: req.replacementOtp ?? otp4(), replacementOtpAttempts: 0 } });
        await this.log(id, 'REPLACEMENT_TASK', actor, `Rider delivery ${t.taskNumber}`, tx);
        return t;
      });
      this.dispatch.changed(task);
      await this.dispatch.dispatch(task.id).catch((e) => this.logger.warn(`dispatch ${task.taskNumber}: ${String(e)}`));
      return this.staffView(await this.load(id));
    }

    const prior = await this.prisma.returnShipment.count({ where: { requestId: id, direction: ReturnShipmentDirection.FORWARD } });
    const rp = req.replacementProduct!;
    let booked;
    try {
      booked = await this.shipping.createShipment({
        orderNumber: prior === 0 ? req.requestNumber : `${req.requestNumber}-${prior + 1}`,
        orderDate: new Date(),
        paymentMode: 'ONLINE',
        subtotal: Number(req.replacementTotal ?? req.itemValue),
        totalPayable: 0,
        address: { fullName: drop.fullName, phone: drop.phone, line1: drop.line1, line2: drop.line2, city: drop.city, state: drop.state, pincode: drop.pincode },
        items: [{ name: rp.name, sku: rp.sku, units: req.quantity, sellingPrice: Number(req.replacementUnitPrice ?? req.unitPaid) }],
      });
    } catch (e) {
      throw new BadGatewayException(`The courier could not book the replacement: ${e instanceof Error ? e.message : String(e)}`);
    }
    const performer = actor.id ?? (await this.systemUserId());
    await this.prisma.$transaction(async (tx) => {
      await dispatchReplacementStock(tx, id, req.requestNumber, performer);
      await tx.returnShipment.updateMany({ where: { requestId: id, direction: ReturnShipmentDirection.FORWARD, isActive: true }, data: { isActive: false } });
      await tx.returnShipment.create({
        data: {
          requestId: id, direction: ReturnShipmentDirection.FORWARD, provider: booked.provider, awb: booked.awb, courier: booked.courier,
          trackingUrl: booked.trackingUrl, labelUrl: booked.labelUrl, providerRef: booked.providerRef,
          events: [{ at: new Date().toISOString(), status: 'CREATED', note: `${booked.courier} AWB ${booked.awb}` }],
        },
      });
      await this.move(tx, req, S.SHIPPED, actor, { note: `${booked.courier} AWB ${booked.awb}`, data: { replacementShippedAt: new Date() } });
    }, { timeout: 20_000 });
    await this.notify(req, S.SHIPPED, actor, `${booked.courier} AWB ${booked.awb}`);
    return this.staffView(await this.load(id));
  }

  /** Replacement delivered: close the exchange, crediting a cheaper replacement's difference per policy. */
  async replacementDelivered(req: Loaded, actor: Actor) {
    const s = await this.settings.get(req.channel);
    const credit = round2(-Number(req.priceDifference));
    await this.prisma.$transaction(async (tx) => {
      await this.move(tx, req, S.DELIVERED, actor, { data: { replacementDeliveredAt: new Date() } });
      if (credit > 0 && s.exchangeLowerPriceAction === 'REFUND_TO_WALLET') {
        await this.wallet.credit(tx, {
          customerId: req.customerId, amount: credit, reason: RefundWalletReason.EXCHANGE_DIFFERENCE_CREDIT, returnRequestId: req.id, orderId: req.orderId,
          note: `Cheaper replacement on ${req.requestNumber}`,
        });
        await tx.returnRequest.update({ where: { id: req.id }, data: { differenceStatus: ExchangeDifferenceStatus.CREDITED, refundMethod: RefundMethod.WALLET, refundedAt: new Date() } });
      }
      await this.move(tx, req, S.COMPLETED, actor, { data: { completedAt: new Date() }, note: credit > 0 && s.exchangeLowerPriceAction === 'REFUND_TO_WALLET' ? `₹${credit.toFixed(2)} difference to Refund Wallet` : undefined });
    });
    await this.notify(req, S.COMPLETED, actor);
  }

  async replacementFailed(req: Loaded, reason: string, actor: Actor) {
    await this.prisma.$transaction((tx) => this.move(tx, req, S.DELIVERY_FAILED, actor, { note: reason, data: { failureReason: reason } }));
    await this.notify(req, S.DELIVERY_FAILED, actor, reason);
  }

  /** The undelivered replacement is back at the warehouse: stock in, still reserved, ready to re-send. */
  async replacementReturned(req: Loaded, actor: Actor) {
    if (req.status !== S.DELIVERY_FAILED) throw new ConflictException('Only a failed replacement delivery can be marked returned');
    const performer = actor.id && actor.kind === 'STAFF' ? actor.id : await this.systemUserId();
    await this.prisma.$transaction(async (tx) => {
      await replacementBackInStock(tx, req.id, req.requestNumber, performer);
      await tx.returnShipment.updateMany({ where: { requestId: req.id, direction: ReturnShipmentDirection.FORWARD, isActive: true }, data: { isActive: false } });
      await this.move(tx, req, S.REPLACEMENT_PROCESSING, actor, { type: 'REPLACEMENT_BACK', note: 'Replacement back in store, ready to re-send' });
    });
  }

  /**
   * The exchange cannot be completed (no stock, repeated failures, customer
   * prefers money): refund what they paid for the item plus any difference
   * they paid, with the loyalty reversal and coin restore of a normal return.
   */
  async convertToRefund(channel: SalesChannel, id: string, reason: string, actor: Actor) {
    const req = await this.forChannel(channel, id);
    if (req.type !== ReturnRequestType.EXCHANGE) throw new BadRequestException('Only an exchange can be converted to a refund');
    if (req.status !== S.REPLACEMENT_PROCESSING && req.status !== S.DELIVERY_FAILED) {
      throw new ConflictException('An exchange converts to a refund after its item is back and before the replacement is delivered');
    }
    const out = await this.prisma.returnReplacementAllocation.count({ where: { requestId: id, releasedAt: null, dispatchedAt: { not: null } } });
    if (out > 0 && req.status === S.REPLACEMENT_PROCESSING) throw new ConflictException('The replacement is out with a rider - wait for it to come back');
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: req.orderId }, include: { items: { where: { id: req.orderItemId } } } });
    const line = order.items[0];
    const coins = coinsForLine(
      { subtotal: Number(order.subtotal), loyaltyRedeemedPoints: order.loyaltyRedeemedPoints, referralRedeemedPoints: order.referralRedeemedPoints },
      { quantity: line.quantity, lineTotal: Number(line.lineTotal), lineSubtotal: Number(line.lineSubtotal) }, req.quantity,
    );
    const paidDiff = req.differenceStatus === ExchangeDifferenceStatus.PAID ? Math.max(0, Number(req.priceDifference)) : 0;
    const performer = actor.id ?? (await this.systemUserId());
    await this.prisma.$transaction(async (tx) => {
      await releaseReplacement(tx, id, 'Exchange converted to a refund');
      await tx.returnRequest.update({
        where: { id },
        data: { refundAmount: round2(Number(req.itemValue) + paidDiff), loyaltyPointsToRestore: coins.loyalty, referralPointsToRestore: coins.referral },
      });
      await this.recordGoodsBack(tx, { ...req, refundAmount: new Prisma.Decimal(round2(Number(req.itemValue) + paidDiff)) }, performer);
      await this.move(tx, req, S.REFUND_INITIATED, actor, { type: 'CONVERTED_TO_REFUND', note: reason });
    });
    await this.notify(req, S.REFUND_INITIATED, actor, 'exchange converted to a refund');
    return this.staffView(await this.load(id));
  }

  // ================================================================ courier webhooks

  /**
   * Shiprocket updates for return pickups and exchange replacements. The
   * courier's status is always stored (externalStatus + event log); OUR status
   * only moves on the few courier events that mean something to the workflow.
   */
  async onCourierUpdate(awb: string, status: string, payload: Record<string, unknown>): Promise<boolean> {
    const sh = await this.prisma.returnShipment.findFirst({ where: { awb }, orderBy: { createdAt: 'desc' } });
    if (!sh) return false;
    const existing = (sh.events as unknown as Array<{ status: string; at: string }>) ?? [];
    const at = String(payload.current_timestamp ?? new Date().toISOString());
    if (existing.some((e) => e.status === status && e.at === at)) return true; // replay
    await this.prisma.returnShipment.update({
      where: { id: sh.id },
      data: { externalStatus: status || sh.externalStatus, lastEventAt: new Date(), events: [...existing, { at, status, note: String(payload.scans ?? '') || undefined }] as never },
    });
    if (!sh.isActive || !status) return true;

    const req = await this.load(sh.requestId);
    const courier: Actor = { kind: 'COURIER' };
    const has = (re: RegExp) => re.test(status);
    try {
      if (sh.direction === ReturnShipmentDirection.REVERSE) {
        if (has(/DELIVERED/) && !has(/UNDELIVERED|RTO/) && (req.status === S.PICKED_UP || req.status === S.PICKUP_SCHEDULED)) {
          await this.receive(req, courier, `Courier delivered to the warehouse (${status})`);
        } else if (has(/PICKED_UP|PICKUP_COMPLETE|PICKUP_DONE|IN_TRANSIT|SHIPPED/) && req.status === S.PICKUP_SCHEDULED) {
          await this.prisma.$transaction((tx) => this.move(tx, req, S.PICKED_UP, courier, { note: status, data: { pickedUpAt: new Date() } }));
          await this.notify(req, S.PICKED_UP, courier);
        } else if (has(/PICKUP_EXCEPTION|PICKUP_CANCEL|NOT_PICKED|PICKUP_FAIL|CANCELED|CANCELLED/) && req.status === S.PICKUP_SCHEDULED) {
          await this.prisma.$transaction(async (tx) => {
            await this.move(tx, req, S.PICKUP_FAILED, courier, { note: status, data: { failureReason: `Courier: ${status}` } });
            await tx.returnShipment.update({ where: { id: sh.id }, data: { isActive: false } });
          });
          await this.notify(req, S.PICKUP_FAILED, courier, 'the courier could not collect the item');
        } else if (has(/LOST|DAMAGED|DESTROYED/)) {
          await this.log(req.id, 'COURIER_EXCEPTION', courier, `${status} - review: mark lost in transit if the parcel will not arrive`);
        }
      } else {
        if (has(/DELIVERED/) && !has(/UNDELIVERED|RTO/) && req.status === S.SHIPPED) {
          await this.replacementDelivered(req, courier);
        } else if (has(/RTO|UNDELIVERED|LOST|DAMAGED|DESTROYED|CANCEL/) && req.status === S.SHIPPED) {
          await this.replacementFailed(req, `Courier: ${status}`, courier);
        }
      }
    } catch (e) {
      // The courier's status is already stored; a workflow refusal must not make Shiprocket retry forever.
      this.logger.warn(`Courier update ${status} for ${req.requestNumber} not applied: ${e instanceof Error ? e.message : String(e)}`);
      await this.log(req.id, 'COURIER_UPDATE_NOT_APPLIED', courier, `${status}: ${e instanceof Error ? e.message : String(e)}`);
    }
    return true;
  }

  // ================================================================ reads

  async mine(customerId: string, requestNumber: string): Promise<Loaded> {
    const r = await this.prisma.returnRequest.findFirst({ where: { requestNumber, customerId }, include: FULL });
    if (!r) throw new NotFoundException('Request not found');
    return r;
  }

  async listMine(customerId: string) {
    const rows = await this.prisma.returnRequest.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' }, take: 100, include: FULL });
    return rows.map((r) => this.customerSummary(r));
  }

  async detailMine(customerId: string, requestNumber: string) {
    return this.customerView(await this.mine(customerId, requestNumber));
  }

  async cancelMine(customerId: string, requestNumber: string, reason?: string) {
    const req = await this.mine(customerId, requestNumber);
    await this.cancel(req, reason?.trim() || 'Cancelled by customer', { kind: 'CUSTOMER', id: customerId });
    return this.customerView(await this.load(req.id));
  }

  private customerSummary(r: Loaded) {
    return {
      requestNumber: r.requestNumber,
      type: r.type,
      status: r.status,
      statusLabel: STATUS_LABEL[r.status],
      orderNumber: r.order.orderNumber,
      product: { name: r.orderItem.nameSnapshot ?? r.orderItem.product.name, imageUrl: r.orderItem.product.images?.[0] ?? null },
      quantity: r.quantity,
      refundAmount: Number(r.refundAmount),
      priceDifference: Number(r.priceDifference),
      differenceStatus: r.differenceStatus,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async customerView(r: Loaded) {
    const [events, shipments, tasks] = await Promise.all([
      this.prisma.returnRequestEvent.findMany({ where: { requestId: r.id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.returnShipment.findMany({ where: { requestId: r.id, isActive: true }, orderBy: { createdAt: 'asc' } }),
      this.prisma.deliveryTask.findMany({
        where: { returnRequestId: r.id, status: { in: LIVE_STATUSES } },
        select: { kind: true, status: true, rider: { select: { fullName: true, phone: true } } },
      }),
    ]);
    const pickupTask = tasks.find((t) => t.kind === 'RETURN_PICKUP');
    const replacementTask = tasks.find((t) => t.kind === 'REPLACEMENT_DELIVERY');
    const quick = r.logistics === ReturnLogistics.QUICK_DELIVERY;
    return {
      ...this.customerSummary(r),
      logistics: r.logistics,
      reason: r.reasonLabel,
      description: r.description,
      mediaUrls: r.mediaUrls,
      unitPaid: Number(r.unitPaid),
      itemValue: Number(r.itemValue),
      deductions: { shippingFee: Number(r.shippingFee), restockingFee: Number(r.restockingFee) },
      refund: {
        method: r.refundMethod,
        amount: Number(r.refundAmount),
        reference: r.refundReference,
        refundedAt: r.refundedAt,
        coinsRestored: { loyalty: r.loyaltyPointsToRestore, referral: r.referralPointsToRestore },
      },
      exchange: r.type === ReturnRequestType.EXCHANGE
        ? {
            replacement: r.replacementProduct ? { name: r.replacementProduct.name, imageUrl: r.replacementProduct.images?.[0] ?? null } : null,
            replacementTotal: r.replacementTotal === null ? null : Number(r.replacementTotal),
            priceDifference: Number(r.priceDifference),
            differenceStatus: r.differenceStatus,
            amountDue: r.differenceStatus === 'PENDING' ? round2(Number(r.priceDifference) - Number(r.differencePaidWallet)) : 0,
            canPay: r.differenceStatus === 'PENDING' && ([S.APPROVED, S.PICKUP_SCHEDULED, S.PICKED_UP, S.QC, S.REPLACEMENT_PROCESSING, S.PICKUP_FAILED, S.DELIVERY_FAILED] as S[]).includes(r.status),
          }
        : null,
      // Codes exist to be read to the rider - shown only while that rider trip is live.
      pickupOtp: quick && r.status === S.PICKUP_SCHEDULED ? r.pickupOtp : null,
      replacementOtp: quick && r.status === S.SHIPPED ? r.replacementOtp : null,
      rider: (pickupTask ?? replacementTask)?.rider ?? null,
      tracking: shipments.map((s) => ({ direction: s.direction, courier: s.courier?.replace(/Shiprocket/gi, 'Courier Partner') ?? null, awb: s.awb, trackingUrl: s.trackingUrl, status: s.externalStatus })),
      canCancel: ([S.REQUESTED, S.APPROVED, S.PICKUP_SCHEDULED] as S[]).includes(r.status),
      timeline: events
        .filter((e) => e.toStatus !== null || ['REFUND_SUMMARY', 'DIFFERENCE_PAID', 'DIFFERENCE_WALLET'].includes(e.type))
        .map((e) => ({ type: e.type, status: e.toStatus, label: e.toStatus ? STATUS_LABEL[e.toStatus] : e.type.replace(/_/g, ' ').toLowerCase(), at: e.createdAt, note: e.actorKind === 'STAFF' && e.type !== 'REJECTED' ? null : e.note })),
      rejectedReason: r.rejectedReason,
    };
  }

  // ---------------------------------------------------------------- staff reads

  async list(channel: SalesChannel, q: ListReturnsQueryDto) {
    const CLOSED: S[] = [S.COMPLETED, S.REJECTED, S.QC_FAILED, S.CANCELLED];
    const where: Prisma.ReturnRequestWhereInput = {
      channel,
      ...(q.status ? { status: q.status } : q.view === 'closed' ? { status: { in: CLOSED } } : q.view === 'all' ? {} : { status: { notIn: CLOSED } }),
      ...(q.type ? { type: q.type } : {}),
      ...(q.logistics ? { logistics: q.logistics } : {}),
      ...(q.search?.trim()
        ? {
            OR: [
              { requestNumber: { contains: q.search.trim(), mode: 'insensitive' } },
              { order: { orderNumber: { contains: q.search.trim(), mode: 'insensitive' } } },
              { customer: { name: { contains: q.search.trim(), mode: 'insensitive' } } },
              { customer: { phone: { contains: q.search.trim() } } },
            ],
          }
        : {}),
    };
    const page = Math.max(1, q.page ?? 1);
    const [rows, total, counts] = await Promise.all([
      this.prisma.returnRequest.findMany({ where, include: FULL, orderBy: { createdAt: 'desc' }, take: 50, skip: (page - 1) * 50 }),
      this.prisma.returnRequest.count({ where }),
      this.prisma.returnRequest.groupBy({ by: ['status'], where: { channel }, _count: { _all: true } }),
    ]);
    return {
      total, page, pageSize: 50,
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
      rows: rows.map((r) => ({
        id: r.id, requestNumber: r.requestNumber, type: r.type, status: r.status, statusLabel: STATUS_LABEL[r.status], logistics: r.logistics,
        orderNumber: r.order.orderNumber, customer: { id: r.customer.id, name: r.customer.name, phone: r.customer.phone, code: r.customer.customerCode },
        product: r.orderItem.nameSnapshot ?? r.orderItem.product.name, quantity: r.quantity, reason: r.reasonLabel, companyFault: r.companyFault,
        refundAmount: Number(r.refundAmount), priceDifference: Number(r.priceDifference), differenceStatus: r.differenceStatus,
        mediaCount: r.mediaUrls.length, createdAt: r.createdAt, updatedAt: r.updatedAt,
      })),
    };
  }

  async staffView(r: Loaded) {
    const [events, shipments, tasks, batchLines, allocations, walletTx, s] = await Promise.all([
      this.prisma.returnRequestEvent.findMany({ where: { requestId: r.id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.returnShipment.findMany({ where: { requestId: r.id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.deliveryTask.findMany({
        where: { returnRequestId: r.id }, orderBy: { createdAt: 'asc' },
        select: {
          id: true, taskNumber: true, kind: true, status: true, attempt: true, failureReasonCode: true, failureNote: true, createdAt: true,
          offerRound: true, needsManualAssignment: true, autoDispatchPaused: true,
          rider: { select: { fullName: true, phone: true } },
          // Riders currently looking at the offer (broadcast still open).
          _count: { select: { offers: { where: { status: 'PENDING', expiresAt: { gt: new Date() } } } } },
        },
      }),
      this.prisma.returnBatchLine.findMany({ where: { requestId: r.id }, include: { fgBatch: { select: { fgBatchNumber: true } } } }),
      this.prisma.returnReplacementAllocation.findMany({ where: { requestId: r.id }, include: { fgBatch: { select: { fgBatchNumber: true, expiryDate: true } } } }),
      this.prisma.refundWalletTransaction.findMany({ where: { returnRequestId: r.id }, orderBy: { createdAt: 'asc' } }),
      this.settings.get(r.channel),
    ]);
    const userIds = [...new Set(events.map((e) => e.actorKind === 'STAFF' ? e.actorId : null).filter(Boolean) as string[])];
    const users = userIds.length ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } }) : [];
    const nameOf = new Map(users.map((u) => [u.id, u.fullName]));
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: r.orderId }, select: { paymentMode: true, paymentTerms: true, total: true, amountPaid: true, paymentStatus: true } });
    return {
      id: r.id, requestNumber: r.requestNumber, type: r.type, status: r.status, statusLabel: STATUS_LABEL[r.status], channel: r.channel, logistics: r.logistics,
      createdAt: r.createdAt, updatedAt: r.updatedAt, raisedBy: r.raisedBy,
      order: { id: r.order.id, orderNumber: r.order.orderNumber, deliveredAt: r.order.deliveredAt, paymentMode: r.order.paymentMode, paymentStatus: r.order.paymentStatus, fulfillmentMethod: r.order.fulfillmentMethod },
      customer: r.customer,
      address: this.dropFor(r),
      warehouse: r.warehouse,
      item: {
        orderItemId: r.orderItemId, productId: r.orderItem.productId, name: r.orderItem.nameSnapshot ?? r.orderItem.product.name,
        sku: r.orderItem.skuSnapshot ?? r.orderItem.product.sku, imageUrl: r.orderItem.product.images?.[0] ?? null, orderedQuantity: r.orderItem.quantity,
      },
      quantity: r.quantity,
      reason: { label: r.reasonLabel, code: r.reason?.code ?? null, companyFault: r.companyFault },
      description: r.description, mediaUrls: r.mediaUrls, adminNote: r.adminNote,
      money: {
        unitPaid: Number(r.unitPaid), itemValue: Number(r.itemValue), shippingFee: Number(r.shippingFee), restockingFee: Number(r.restockingFee),
        refundAmount: Number(r.refundAmount), loyaltyPointsToRestore: r.loyaltyPointsToRestore, referralPointsToRestore: r.referralPointsToRestore,
      },
      refund: {
        method: r.refundMethod, upiId: r.refundUpiId, accountName: r.refundAccountName, accountNumber: r.refundAccountNumber, ifsc: r.refundIfsc,
        bankName: r.refundBankName, reference: r.refundReference, note: r.refundNote, refundedAt: r.refundedAt,
        allowedMethods: this.refundMethodsFor(order, s),
      },
      exchange: r.type === ReturnRequestType.EXCHANGE ? {
        replacementProduct: r.replacementProduct, replacementName: r.replacementName,
        replacementUnitPrice: r.replacementUnitPrice === null ? null : Number(r.replacementUnitPrice),
        replacementTotal: r.replacementTotal === null ? null : Number(r.replacementTotal),
        priceDifference: Number(r.priceDifference), differenceStatus: r.differenceStatus, differencePaidWallet: Number(r.differencePaidWallet),
        differenceReference: r.differenceReference, reservedAt: r.replacementReservedAt, shippedAt: r.replacementShippedAt, deliveredAt: r.replacementDeliveredAt,
        allocations: allocations.map((a) => ({ fgBatchNumber: a.fgBatch.fgBatchNumber, expiryDate: a.fgBatch.expiryDate, quantity: a.quantity, dispatchedAt: a.dispatchedAt, releasedAt: a.releasedAt, releasedReason: a.releasedReason })),
      } : null,
      qc: r.qcAt ? { decision: r.qcDecision, goodQuantity: r.qcGoodQuantity, damagedQuantity: r.qcDamagedQuantity, notes: r.qcNotes, at: r.qcAt } : null,
      qcRequired: s.qcRequired,
      lostInTransit: r.lostInTransit,
      stock: batchLines.map((b) => ({ fgBatchNumber: b.fgBatch.fgBatchNumber, quantity: b.quantity, disposition: b.disposition })),
      shipments: shipments.map((x) => ({
        id: x.id, direction: x.direction, provider: x.provider, awb: x.awb, courier: x.courier, trackingUrl: x.trackingUrl, labelUrl: x.labelUrl,
        externalStatus: x.externalStatus, isActive: x.isActive, events: x.events, createdAt: x.createdAt,
      })),
      riderTasks: tasks.map(({ _count, ...t }) => ({ ...t, openOffers: _count.offers })),
      walletTransactions: walletTx.map((w) => ({ amount: Number(w.amount), reason: w.reason, note: w.note, at: w.createdAt })),
      stamps: {
        approvedAt: r.approvedAt, pickupScheduledAt: r.pickupScheduledAt, pickedUpAt: r.pickedUpAt, receivedAt: r.receivedAt,
        completedAt: r.completedAt, cancelledAt: r.cancelledAt, rejectedReason: r.rejectedReason, cancelReason: r.cancelReason, failureReason: r.failureReason,
      },
      timeline: events.map((e) => ({
        type: e.type, fromStatus: e.fromStatus, toStatus: e.toStatus, note: e.note, actorKind: e.actorKind,
        actor: e.actorKind === 'STAFF' ? nameOf.get(e.actorId ?? '') ?? 'Staff' : e.actorKind.toLowerCase(), at: e.createdAt,
      })),
      actions: this.availableActions(r, tasks),
    };
  }

  /** What the staff screen may offer next - the same rules the endpoints enforce. */
  private availableActions(r: Loaded, tasks: Array<{ kind: string; status: string }>) {
    const live = (kind: string) => tasks.some((t) => t.kind === kind && (LIVE_STATUSES as string[]).includes(t.status));
    const a: string[] = [];
    const exchange = r.type === ReturnRequestType.EXCHANGE;
    switch (r.status) {
      case S.REQUESTED: a.push('approve', 'reject', 'cancel'); break;
      case S.APPROVED: a.push('schedulePickup', 'receive', 'cancel'); break;
      case S.PICKUP_SCHEDULED:
        if (!live('RETURN_PICKUP')) a.push('markPickedUp', 'markPickupFailed');
        a.push('receive', 'cancel');
        break;
      case S.PICKUP_FAILED: a.push('schedulePickup', 'receive', 'cancel'); break;
      case S.PICKED_UP:
        a.push('receive');
        if (r.logistics === ReturnLogistics.SHIPROCKET) a.push('markLostInTransit');
        break;
      case S.QC: a.push('qc'); break;
      case S.REFUND_INITIATED: a.push('completeRefund'); break;
      case S.REPLACEMENT_PROCESSING:
        if (!live('REPLACEMENT_DELIVERY')) a.push('dispatchReplacement', 'convertToRefund');
        break;
      case S.SHIPPED: if (r.logistics === ReturnLogistics.SHIPROCKET) a.push('markReplacementDelivered', 'markReplacementFailed'); break;
      case S.DELIVERY_FAILED: a.push('replacementReturned', 'convertToRefund'); break;
      default: break;
    }
    if (exchange && r.differenceStatus === ExchangeDifferenceStatus.PENDING && ![S.REQUESTED, S.COMPLETED, S.CANCELLED, S.REJECTED, S.QC_FAILED].includes(r.status as never)) {
      a.push('recordDifference', 'waiveDifference');
    }
    return a;
  }

  /** Staff raising a request for a customer: same rules as the storefront, optional window override. */
  async createForCustomer(channel: SalesChannel, customerId: string, dto: StaffCreateReturnRequestDto, staffId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');
    if (customer.channel !== channel) throw new ForbiddenException(`This customer is handled in the ${customer.channel === 'B2B' ? 'retailer' : 'customer'} returns queue`);
    const view = await this.create(customer, dto, { staffId });
    const created = await this.prisma.returnRequest.findUniqueOrThrow({ where: { requestNumber: view.requestNumber } });
    return this.staffView(await this.load(created.id));
  }
}
