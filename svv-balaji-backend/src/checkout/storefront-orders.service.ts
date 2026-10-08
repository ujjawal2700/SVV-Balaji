import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { distanceKm } from '../delivery/zones/zone.logic';
import { MapsService } from '../maps/maps.service';
import { PrismaService } from '../prisma/prisma.service';
import type { StoredQuote } from './checkout.service';

const num = (d: unknown) => (d === null || d === undefined ? null : Number(d));

/** What the customer sees of their own orders. Never staff-only fields. */
@Injectable()
export class StorefrontOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly maps: MapsService,
  ) {}

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

  /**
   * Where the rider carrying this order is, for the shopper's tracking map.
   *
   * Only for the customer's own order, only for a local delivery that is on its
   * way (picked up, out for delivery, at the door) - never before pickup or after
   * delivery, so a shopper cannot follow a rider around. `stale` says the last
   * fix is old (app in the background, no signal), so the map can say so rather
   * than show a confident wrong position.
   */
  async liveLocation(customerId: string, orderNumber: string) {
    const o = await this.prisma.order.findFirst({
      where: { orderNumber, customerId },
      select: { id: true, status: true, fulfillmentMethod: true, addressSnapshot: true },
    });
    if (!o) throw new NotFoundException('Order not found');
    const off = { tracking: false as const };
    if (o.status !== 'DISPATCHED' || o.fulfillmentMethod !== 'LOCAL') return off;
    const task = await this.prisma.deliveryTask.findFirst({
      where: { orderId: o.id, kind: 'ORDER_DELIVERY', status: { in: ['PICKED_UP', 'OUT_FOR_DELIVERY', 'AT_DROP'] } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, status: true, dropLatitude: true, dropLongitude: true,
        rider: { select: { fullName: true, vehicleType: true, lastLatitude: true, lastLongitude: true, lastLocationAt: true } },
      },
    });
    if (!task?.rider || task.rider.lastLatitude === null || task.rider.lastLongitude === null || !task.rider.lastLocationAt) return off;

    const snap = o.addressSnapshot as { latitude?: number; longitude?: number } | null;
    const dropLat = task.dropLatitude !== null ? Number(task.dropLatitude) : snap?.latitude ?? null;
    const dropLng = task.dropLongitude !== null ? Number(task.dropLongitude) : snap?.longitude ?? null;
    const rider = { lat: Number(task.rider.lastLatitude), lng: Number(task.rider.lastLongitude) };
    const ageSeconds = Math.max(0, Math.round((Date.now() - task.rider.lastLocationAt.getTime()) / 1000));
    const km = dropLat !== null && dropLng !== null ? distanceKm(rider, { lat: dropLat, lng: dropLng }) : null;
    // Road route + traffic ETA from Google (cached per delivery, so every refresh by the shopper shares one call).
    // Not for a stale fix - a route from where the rider was 5 minutes ago is worse than none.
    const route =
      dropLat !== null && dropLng !== null && ageSeconds <= 120
        ? await this.maps.route(`task:${task.id}`, rider, { lat: dropLat, lng: dropLng })
        : null;
    return {
      tracking: true as const,
      status: task.status,
      rider: {
        firstName: task.rider.fullName.split(' ')[0],
        vehicleType: task.rider.vehicleType,
        latitude: rider.lat,
        longitude: rider.lng,
        updatedAt: task.rider.lastLocationAt,
        ageSeconds,
        stale: ageSeconds > 120,
      },
      drop: dropLat !== null && dropLng !== null ? { latitude: dropLat, longitude: dropLng } : null,
      distanceKm: route ? Math.round(route.distanceMeters / 100) / 10 : km === null ? null : Math.round(km * 10) / 10,
      /** Road route when Google Routes is available; null -> distance above is straight-line. */
      route: route ? { etaMinutes: Math.max(1, Math.round(route.durationSeconds / 60)), distanceMeters: route.distanceMeters, polyline: route.polyline } : null,
    };
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

    // The OTP exists to be read out to the rider: only shown when order is Out For Delivery (DISPATCHED),
    // and only to the customer who owns the order.
    const showOtp = o.fulfillmentMethod === 'LOCAL' && !o.deliveryOtpVerifiedAt && o.status === 'DISPATCHED';

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
        refundWalletPaid: Number(o.refundWalletPaidInr),
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
      timeline: shopperTimeline(o.events),
    };
  }
}

/** Staff-side steps a shopper never sees (STATUS_OVERRIDE carries the staff member's reason). */
const INTERNAL_EVENTS = ['SCANNED', 'OTP_FAILED', 'STATUS_OVERRIDE', 'READY_FOR_PICKUP', 'GST_REVERSED'];
/** The same step with the same detail again within this window is a repeat click / retry, not news. */
const REPEAT_WINDOW_MS = 30 * 60_000;

/**
 * The order's tracking history as the shopper sees it: internal steps hidden
 * and repeats collapsed, so staff clicking a step twice does not show it twice.
 * A genuinely new fact (another rider, a later delivery attempt) still shows.
 */
export function shopperTimeline(events: Array<{ type: string; note: string | null; createdAt: Date }>) {
  const kept: Array<{ type: string; at: Date; note: string | null }> = [];
  for (const e of events) {
    if (INTERNAL_EVENTS.includes(e.type)) continue;
    const note = ['RIDER_ASSIGNED', 'SHIPMENT_CREATED', 'PLACED', 'RETURN_UPDATE'].includes(e.type) ? cleanShopperNote(e.type, e.note) : null;
    const repeat = kept.some(
      (k) => k.type === e.type && k.note === note && e.createdAt.getTime() - k.at.getTime() < REPEAT_WINDOW_MS,
    );
    if (!repeat) kept.push({ type: e.type, at: e.createdAt, note });
  }
  return kept;
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
