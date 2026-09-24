import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { StoredQuote } from './checkout.service';

const num = (d: unknown) => (d === null || d === undefined ? null : Number(d));

/** What the customer sees of their own orders. Never staff-only fields. */
@Injectable()
export class StorefrontOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(customerId: string) {
    const [rows, reviews] = await Promise.all([
      this.prisma.order.findMany({
        where: { customerId, source: 'STOREFRONT' },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          items: {
            select: {
              productId: true,
              nameSnapshot: true,
              quantity: true,
              unitPrice: true,
              product: { select: { images: true, unit: true, packLabel: true, mrp: true, isActive: true } },
            },
          },
          warehouse: { select: { name: true } },
        },
      }),
      this.prisma.productReview.findMany({ where: { customerId }, select: { productId: true } }),
    ]);
    const reviewed = new Set(reviews.map((r) => r.productId));

    return rows.map((o) => ({
      orderNumber: o.orderNumber,
      status: o.status,
      placedAt: o.createdAt,
      deliveredAt: o.deliveredAt,
      total: Number(o.total),
      fulfillmentMethod: o.fulfillmentMethod,
      nodeName: o.warehouse.name,
      itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
      items: o.items.slice(0, 3).map((i) => i.nameSnapshot),
      // Everything the list card and "Reorder" need, so neither makes a second request.
      lines: o.items.map((i) => ({
        productId: i.productId,
        name: i.nameSnapshot,
        imageUrl: i.product?.images?.[0] ?? null,
        unit: i.product?.packLabel ?? i.product?.unit ?? '',
        mrp: num(i.product?.mrp),
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        available: i.product?.isActive ?? false,
      })),
      reviewPending: o.status === 'DELIVERED' && o.items.some((i) => !reviewed.has(i.productId)),
    }));
  }

  /**
   * Rate one product from a delivered order. One review per customer per
   * product (a later rating from another order replaces the earlier one),
   * linked to the order it was left from.
   */
  async review(customerId: string, orderNumber: string, input: { productId: string; rating: number; comment?: string }) {
    const order = await this.prisma.order.findFirst({
      where: { orderNumber, customerId },
      select: { id: true, status: true, items: { select: { productId: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'DELIVERED') throw new BadRequestException('You can rate products once your order is delivered');
    if (!order.items.some((i) => i.productId === input.productId)) {
      throw new BadRequestException('That product is not part of this order');
    }
    const comment = input.comment?.trim() || null;
    const review = await this.prisma.productReview.upsert({
      where: { customerId_productId: { customerId, productId: input.productId } },
      create: { customerId, productId: input.productId, orderId: order.id, rating: input.rating, comment },
      update: { orderId: order.id, rating: input.rating, comment },
    });
    return { productId: review.productId, rating: review.rating, comment: review.comment };
  }

  async detail(customerId: string, orderNumber: string) {
    const o = await this.prisma.order.findFirst({
      where: { orderNumber, customerId },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                images: true,
                mrp: true,
                packLabel: true,
                unit: true,
                isActive: true,
              },
            },
          },
        },
        warehouse: { select: { name: true, city: true } },
        events: { orderBy: { createdAt: 'asc' } },
        shipment: true,
        paymentTransactions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!o) throw new NotFoundException('Order not found');
    const quote = o.pricingSnapshot as unknown as StoredQuote | null;
    const reviews = await this.prisma.productReview.findMany({
      where: { customerId, productId: { in: o.items.map((i) => i.productId) } },
      select: { productId: true, rating: true, comment: true },
    });
    const reviewByProduct = new Map(reviews.map((r) => [r.productId, { rating: r.rating, comment: r.comment }]));

    // The OTP exists to be read out to the rider: only shown while it is useful,
    // and only to the customer who owns the order.
    const showOtp = o.fulfillmentMethod === 'LOCAL' && !o.deliveryOtpVerifiedAt && ['PLACED', 'CONFIRMED', 'ALLOCATED', 'PACKED', 'DISPATCHED'].includes(o.status);

    return {
      orderNumber: o.orderNumber,
      status: o.status,
      channel: o.channel,
      placedAt: o.createdAt,
      deliveredAt: o.deliveredAt,
      fulfillment: {
        method: o.fulfillmentMethod,
        nodeName: o.warehouse.name,
        nodeCity: o.warehouse.city,
        distanceKm: num(o.distanceKm),
        etaMin: o.etaMin,
        etaMax: o.etaMax,
        etaLabel: quote?.fulfillment.etaLabel ?? null,
      },
      address: o.addressSnapshot,
      items: o.items.map((i) => ({
        productId: i.productId,
        name: i.nameSnapshot,
        sku: i.skuSnapshot,
        imageUrl: i.product?.images?.[0] ?? null,
        mrp: num(i.product?.mrp),
        unit: i.product?.packLabel ?? i.product?.unit ?? '',
        available: i.product?.isActive ?? false,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        gstRatePercent: Number(i.gstRatePercent),
        discount: Number(i.lineDiscount),
        total: Number(i.lineTotal),
        review: reviewByProduct.get(i.productId) ?? null,
      })),
      totals: {
        subtotal: Number(o.subtotal),
        discount: Number(o.discountTotal),
        couponCode: o.couponCode,
        loyaltyRedeemedPoints: o.loyaltyRedeemedPoints,
        loyaltyRedeemedInr: Number(o.loyaltyRedeemedInr),
        referralRedeemedPoints: o.referralRedeemedPoints,
        referralRedeemedInr: Number(o.referralRedeemedInr),
        tax: Number(o.taxTotal),
        deliveryFee: Number(o.deliveryFee),
        total: Number(o.total),
      },
      payment: { mode: o.paymentMode, status: o.paymentStatus, reference: o.paymentTransactions[0]?.gatewayPaymentId ?? null },
      deliveryOtp: showOtp ? o.deliveryOtp : null,
      rider: o.status === 'DISPATCHED' || o.status === 'DELIVERED' ? { name: o.riderName, phone: o.riderPhone } : null,
      shipment: o.shipment
        ? { awb: o.shipment.awb, courier: o.shipment.courier, trackingUrl: o.shipment.trackingUrl, status: o.shipment.status }
        : null,
      timeline: o.events
        .filter((e) => !['SCANNED', 'OTP_FAILED'].includes(e.type)) // internal, not for shoppers
        .map((e) => ({
          type: e.type,
          at: e.createdAt,
          note: ['RIDER_ASSIGNED', 'SHIPMENT_CREATED', 'PLACED'].includes(e.type)
            ? cleanShopperNote(e.type, e.note)
            : null,
        })),
    };
  }
}

function cleanShopperNote(type: string, note: string | null): string | null {
  if (!note) return null;
  if (type === 'PLACED') {
    if (note.includes('SHIPROCKET') || note.includes('Main Store')) return 'Standard Courier Delivery';
    if (note.includes('LOCAL')) return 'Express Local Delivery';
  }
  if (type === 'SHIPMENT_CREATED') {
    return note.replace(/Shiprocket/gi, 'Courier Partner');
  }
  return note;
}
