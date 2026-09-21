import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { StoredQuote } from './checkout.service';

const num = (d: unknown) => (d === null || d === undefined ? null : Number(d));

/** What the customer sees of their own orders. Never staff-only fields. */
@Injectable()
export class StorefrontOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(customerId: string) {
    const rows = await this.prisma.order.findMany({
      where: { customerId, source: 'STOREFRONT' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { items: { select: { nameSnapshot: true, quantity: true } }, warehouse: { select: { name: true } } },
    });
    return rows.map((o) => ({
      orderNumber: o.orderNumber,
      status: o.status,
      placedAt: o.createdAt,
      total: Number(o.total),
      fulfillmentMethod: o.fulfillmentMethod,
      nodeName: o.warehouse.name,
      itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
      items: o.items.slice(0, 3).map((i) => i.nameSnapshot),
    }));
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
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        gstRatePercent: Number(i.gstRatePercent),
        discount: Number(i.lineDiscount),
        total: Number(i.lineTotal),
      })),
      totals: {
        subtotal: Number(o.subtotal),
        discount: Number(o.discountTotal),
        couponCode: o.couponCode,
        loyaltyRedeemedPoints: o.loyaltyRedeemedPoints,
        loyaltyRedeemedInr: Number(o.loyaltyRedeemedInr),
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
        .map((e) => ({ type: e.type, at: e.createdAt, note: ['RIDER_ASSIGNED', 'SHIPMENT_CREATED', 'PLACED'].includes(e.type) ? e.note : null })),
    };
  }
}
