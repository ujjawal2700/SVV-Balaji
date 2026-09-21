import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SalesService } from '../sales/sales.service';
import type { AddressSnapshot } from './addresses.service';
import { SHIPPING_PROVIDER, type ShippingProvider } from './shipping/shipping-provider';

const MAX_OTP_ATTEMPTS = 5;
const FG_NUMBER = /FG-\d{8}-\d{3,}/i;

/**
 * What staff do to a storefront order after it is placed.
 *
 *   LOCAL      start packing -> scan batches -> PACKED -> assign rider (out for
 *              delivery) -> customer reads the OTP to the rider -> DELIVERED
 *   SHIPROCKET start packing -> scan batches -> PACKED -> create shipment (AWB)
 *              -> courier webhooks -> DELIVERED
 *
 * Every step goes through `SalesService.advance`, so stock, the event timeline,
 * the live admin feed and loyalty (credited only on DELIVERED) behave exactly as
 * for any other order. `advance` also refuses to skip a step, so calling the
 * plain status endpoints cannot bypass the scan, the rider, the AWB or the OTP.
 */
@Injectable()
export class FulfillmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesService,
    @Inject(SHIPPING_PROVIDER) private readonly shipping: ShippingProvider,
  ) {}

  private async order(id: string) {
    const o = await this.prisma.order.findUnique({ where: { id }, include: { shipment: true } });
    if (!o) throw new NotFoundException('Order not found');
    return o;
  }

  /** The picking plan: which FIFO batches to pull, how many packs of each, and what is already scanned. */
  async plan(orderId: string) {
    const allocations = await this.prisma.orderAllocation.findMany({
      where: { orderId, releasedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        fgBatch: { select: { fgBatchNumber: true, expiryDate: true, manufacturingDate: true } },
        orderItem: { select: { skuSnapshot: true, nameSnapshot: true, product: { select: { name: true, sku: true } } } },
      },
    });
    return allocations.map((a) => ({
      allocationId: a.id,
      product: a.orderItem.nameSnapshot ?? a.orderItem.product.name,
      sku: a.orderItem.skuSnapshot ?? a.orderItem.product.sku,
      fgBatchNumber: a.fgBatch.fgBatchNumber,
      expiryDate: a.fgBatch.expiryDate,
      quantity: a.quantity,
      scanned: a.scannedAt !== null,
    }));
  }

  /** Confirm if needed, then FIFO-allocate the oldest valid batches. Returns the pick list. */
  async startPacking(orderId: string, userId: string) {
    let o = await this.order(orderId);
    if (o.status === OrderStatus.PLACED) {
      await this.sales.confirm(orderId);
      o = await this.order(orderId);
    }
    if (o.status === OrderStatus.CONFIRMED) {
      const result = await this.sales.allocate(orderId, userId);
      return { status: 'ALLOCATED', complete: result.complete, shortfalls: result.shortfalls, plan: await this.plan(orderId) };
    }
    if (o.status === OrderStatus.ALLOCATED) {
      return { status: 'ALLOCATED', complete: true, shortfalls: [], plan: await this.plan(orderId) };
    }
    throw new BadRequestException(`Packing cannot start on an order that is ${o.status}`);
  }

  /**
   * Scan a batch label (the batch number, or the QR URL that contains it).
   * Only a batch FIFO allocated to THIS order is accepted: scanning any other -
   * a newer batch grabbed off the shelf, a frozen one - is refused, with what
   * was expected. The order is marked PACKED once every allocation is scanned.
   */
  async scan(orderId: string, code: string, userId: string) {
    const o = await this.order(orderId);
    if (o.status !== OrderStatus.ALLOCATED) {
      throw new BadRequestException(`Scanning is for allocated orders (this one is ${o.status})`);
    }
    const number = code.match(FG_NUMBER)?.[0]?.toUpperCase();
    if (!number) throw new BadRequestException('That code is not a finished-goods batch label');

    const live = await this.prisma.orderAllocation.findMany({
      where: { orderId, releasedAt: null },
      include: { fgBatch: { select: { fgBatchNumber: true } } },
    });
    const matches = live.filter((a) => a.fgBatch.fgBatchNumber === number);
    if (matches.length === 0) {
      const expected = [...new Set(live.filter((a) => !a.scannedAt).map((a) => a.fgBatch.fgBatchNumber))];
      throw new BadRequestException({
        code: 'WRONG_BATCH',
        message: `${number} is not allocated to this order (oldest-first allocation expects: ${expected.join(', ') || 'nothing left to scan'})`,
        expected,
      });
    }

    await this.prisma.orderAllocation.updateMany({
      where: { id: { in: matches.map((m) => m.id) }, scannedAt: null },
      data: { scannedAt: new Date(), scannedById: userId },
    });
    await this.sales.record(orderId, 'SCANNED', userId, number);

    const remaining = await this.prisma.orderAllocation.count({ where: { orderId, releasedAt: null, scannedAt: null } });
    if (remaining === 0) await this.sales.advance(orderId, OrderStatus.PACKED, userId);
    return { scanned: number, remaining, packed: remaining === 0, plan: await this.plan(orderId) };
  }

  /** LOCAL: a rider takes it. */
  async assignRider(orderId: string, rider: { name: string; phone: string }, userId: string) {
    const o = await this.order(orderId);
    if (o.fulfillmentMethod !== 'LOCAL') throw new BadRequestException('Only local-delivery orders use an in-house rider');
    if (o.status !== OrderStatus.PACKED) throw new BadRequestException(`The order must be packed first (it is ${o.status})`);
    await this.prisma.order.update({ where: { id: orderId }, data: { riderName: rider.name, riderPhone: rider.phone } });
    await this.sales.record(orderId, 'RIDER_ASSIGNED', userId, `${rider.name} (${rider.phone})`);
    return this.sales.advance(orderId, OrderStatus.DISPATCHED, userId);
  }

  /** SHIPROCKET: create the shipment, get the AWB / courier / label / tracking link, and dispatch. */
  async ship(orderId: string, userId: string) {
    const o = await this.order(orderId);
    if (o.fulfillmentMethod !== 'SHIPROCKET') throw new BadRequestException('Only courier orders are shipped through Shiprocket');
    if (o.shipment) return o.shipment; // idempotent: a retry must not book a second courier
    if (o.status !== OrderStatus.PACKED) throw new BadRequestException(`The order must be packed first (it is ${o.status})`);

    const items = await this.prisma.orderItem.findMany({ where: { orderId }, include: { product: { select: { name: true, sku: true } } } });
    const a = o.addressSnapshot as unknown as AddressSnapshot;
    const result = await this.shipping.createShipment({
      orderNumber: o.orderNumber,
      orderDate: o.orderDate,
      paymentMode: (o.paymentMode ?? 'ONLINE') as 'ONLINE' | 'COD' | 'CREDIT',
      subtotal: Number(o.subtotal) - Number(o.discountTotal),
      totalPayable: Number(o.total),
      address: a,
      items: items.map((i) => ({
        name: i.nameSnapshot ?? i.product.name,
        sku: i.skuSnapshot ?? i.product.sku,
        units: i.quantity,
        sellingPrice: Number(i.unitPrice),
      })),
    });

    const shipment = await this.prisma.orderShipment.create({
      data: {
        orderId,
        provider: result.provider,
        awb: result.awb,
        courier: result.courier,
        trackingUrl: result.trackingUrl,
        labelUrl: result.labelUrl,
        events: [{ at: new Date().toISOString(), status: 'CREATED', note: `${result.courier} AWB ${result.awb}` }],
      },
    });
    await this.sales.record(orderId, 'SHIPMENT_CREATED', userId, `${result.courier} · AWB ${result.awb}`);
    await this.sales.advance(orderId, OrderStatus.DISPATCHED, userId);
    return shipment;
  }

  /**
   * LOCAL: the customer reads their OTP to the rider, who enters it. Five wrong
   * tries lock the code (a 4-digit code would otherwise fall to brute force in
   * minutes); a correct one closes the order as DELIVERED.
   */
  async verifyOtp(orderId: string, otp: string, userId: string) {
    const o = await this.order(orderId);
    if (o.fulfillmentMethod !== 'LOCAL') throw new BadRequestException('Only local-delivery orders are closed with a doorstep OTP');
    if (o.status !== OrderStatus.DISPATCHED) throw new BadRequestException(`The order must be out for delivery first (it is ${o.status})`);
    if (!o.deliveryOtp) throw new ConflictException('This order has no delivery OTP');
    if (o.deliveryOtpVerifiedAt) return { delivered: true };
    if (o.deliveryOtpAttempts >= MAX_OTP_ATTEMPTS) {
      throw new HttpException({ code: 'OTP_LOCKED', message: 'Too many wrong attempts. Ask a manager to resolve this delivery.' }, 423);
    }

    const a = Buffer.from(o.deliveryOtp);
    const b = Buffer.from(otp.trim());
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      const updated = await this.prisma.order.update({ where: { id: orderId }, data: { deliveryOtpAttempts: { increment: 1 } } });
      await this.sales.record(orderId, 'OTP_FAILED', userId);
      const left = Math.max(0, MAX_OTP_ATTEMPTS - updated.deliveryOtpAttempts);
      throw new BadRequestException({ code: 'OTP_INCORRECT', message: `Incorrect OTP. ${left} attempt${left === 1 ? '' : 's'} left.`, attemptsLeft: left });
    }

    await this.prisma.order.update({ where: { id: orderId }, data: { deliveryOtpVerifiedAt: new Date() } });
    await this.sales.advance(orderId, OrderStatus.DELIVERED, userId);
    return { delivered: true };
  }

  /**
   * Shiprocket tracking webhook. Appends the event to the shipment and, when the
   * courier reports delivery, closes the order (which is what credits loyalty).
   * Idempotent: the same payload twice changes nothing the second time.
   */
  async handleShiprocketWebhook(payload: Record<string, unknown>) {
    const awb = String(payload.awb ?? payload.awb_code ?? '');
    if (!awb) throw new BadRequestException('No AWB in webhook');
    const shipment = await this.prisma.orderShipment.findFirst({ where: { awb } });
    if (!shipment) return { ok: true, ignored: true }; // not ours (or not created yet): acknowledge so it is not retried forever

    const status = String(payload.current_status ?? payload.status ?? '').toUpperCase().replace(/\s+/g, '_');
    const at = new Date();
    const existing = (shipment.events as unknown as Array<{ status: string; at: string }>) ?? [];
    const duplicate = existing.some((e) => e.status === status && payload.current_timestamp && e.at === String(payload.current_timestamp));

    if (!duplicate && status) {
      await this.prisma.orderShipment.update({
        where: { id: shipment.id },
        data: {
          status,
          lastEventAt: at,
          events: [...existing, { at: String(payload.current_timestamp ?? at.toISOString()), status, note: String(payload.scans ?? '') || undefined }] as never,
        },
      });
      await this.sales.record(shipment.orderId, 'SHIPMENT_UPDATE', undefined, status);
    }

    if (status === 'DELIVERED') {
      const o = await this.prisma.order.findUnique({ where: { id: shipment.orderId } });
      if (o?.status === OrderStatus.DISPATCHED) await this.sales.advance(o.id, OrderStatus.DELIVERED, 'system');
    }
    return { ok: true };
  }
}
