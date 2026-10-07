import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CustomerAccountStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrderEventsService } from '../realtime/order-events.service';
import { NotificationsService, type CustomerNotificationMessage } from './notifications.service';

interface OrderEventMessageInput {
  type: string;
  note?: string | null;
  orderNumber: string;
  total: number;
  fulfillmentMethod?: string | null;
  /** A rider-app rider carries this local order (they send OUT_FOR_DELIVERY themselves). */
  appRider?: boolean;
  riderName?: string | null;
}

const detail = (note?: string | null) => note?.trim().replace(/\s+/g, ' ').slice(0, 220) || null;

/** The same customer message for the same order within this window is a repeat (a double click, a retry). */
export const REPEAT_WINDOW_MS = 30 * 60_000;

/**
 * Customer-facing copy for the order events that warrant an alert.
 *
 * Deliberately only three moments (7 Oct, client request): the order was
 * ACCEPTED, it is OUT FOR DELIVERY, it was DELIVERED. Every other step (packed,
 * rider assigned, picked up, arrived, courier scans ...) stays on the order's
 * tracking timeline but sends nothing. Return / exchange progress is its own
 * flow and still notifies.
 */
export function customerOrderMessage(
  input: OrderEventMessageInput,
): CustomerNotificationMessage | null {
  const { type, orderNumber } = input;
  const note = detail(input.note);
  const link = `/orders/${encodeURIComponent(orderNumber)}`;
  const outForDelivery = (who?: string | null): CustomerNotificationMessage => ({
    link,
    tag: `order-${orderNumber}-out_for_delivery`,
    title: 'Out for delivery',
    body: who ? `${who} is on the way with your order ${orderNumber}.` : `Your order ${orderNumber} is on the way.`,
  });

  switch (type) {
    case 'CONFIRMED':
      return {
        link,
        tag: `order-${orderNumber}-confirmed`,
        title: 'Order accepted',
        body: `Your order ${orderNumber} has been accepted and is being prepared.`,
      };
    // Rider-app delivery: the rider starts the trip.
    case 'OUT_FOR_DELIVERY':
      return outForDelivery(input.riderName ? `Your rider ${input.riderName}` : 'Your rider');
    // Local order handed to a driver outside the rider app: it leaves the store with them.
    case 'DISPATCHED':
      return input.fulfillmentMethod === 'LOCAL' && !input.appRider ? outForDelivery(input.riderName) : null;
    // Courier orders: the courier's own "out for delivery" scan.
    case 'SHIPMENT_UPDATE':
      return input.fulfillmentMethod === 'SHIPROCKET' && /^OUT_FOR_DELIVERY$/i.test((note ?? '').replace(/\s+/g, '_'))
        ? outForDelivery(null)
        : null;
    case 'DELIVERED':
      return {
        link,
        tag: `order-${orderNumber}-delivered`,
        title: 'Order delivered',
        body: `Order ${orderNumber} was delivered successfully. Thank you for shopping with Desi Tokri.`,
      };
    case 'RETURN_UPDATE':
      return {
        link,
        tag: `order-${orderNumber}-return_update`,
        title: 'Return / exchange update',
        body: note ?? `There is an update on your return or exchange for order ${orderNumber}.`,
      };
    default:
      return null;
  }
}

/** Bridges committed order timeline events into the storefront inbox and FCM. */
@Injectable()
export class CustomerOrderNotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CustomerOrderNotificationsService.name);
  private retryTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderEvents: OrderEventsService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.orderEvents.onTimeline(({ eventId }) => void this.deliverEvent(eventId));
    // Checkout creates PLACED inside its transaction and publishes `new` after
    // commit. It predates the exact timeline signal, so bridge that one here.
    this.orderEvents.on('new', (orderId) => void this.deliverPlaced(orderId));

    // The event bus is deliberately fast and in-process. This durable sweep is
    // its safety net if the process exits after committing an OrderEvent but
    // before the listener has created the inbox notification.
    void this.sweepPendingEvents();
    this.retryTimer = setInterval(() => void this.sweepPendingEvents(), 30_000);
    this.retryTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.retryTimer) clearInterval(this.retryTimer);
  }

  private async deliverPlaced(orderId: string): Promise<void> {
    try {
      const event = await this.prisma.orderEvent.findFirst({
        where: { orderId, type: 'PLACED' },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (event) await this.deliverEvent(event.id);
    } catch (error) {
      this.warn(orderId, error);
    }
  }

  async deliverEvent(eventId: string): Promise<void> {
    try {
      const event = await this.prisma.orderEvent.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          type: true,
          note: true,
          customerNotificationHandledAt: true,
          createdAt: true,
          order: {
            select: {
              id: true,
              orderNumber: true,
              total: true,
              fulfillmentMethod: true,
              riderName: true,
              customer: { select: { account: { select: { id: true, status: true } } } },
              // Any rider-app delivery ever taken by a rider: then OUT_FOR_DELIVERY is the signal, not DISPATCHED.
              deliveryTasks: { where: { riderId: { not: null } }, select: { id: true }, take: 1 },
            },
          },
        },
      });
      if (!event || event.customerNotificationHandledAt) return;
      const account = event.order.customer.account;

      const message = customerOrderMessage({
        type: event.type,
        note: event.note,
        orderNumber: event.order.orderNumber,
        total: Number(event.order.total),
        fulfillmentMethod: event.order.fulfillmentMethod,
        appRider: event.order.deliveryTasks.length > 0,
        riderName: event.order.riderName,
      });
      if (message && account?.status === CustomerAccountStatus.ACTIVE && !(await this.isRepeat(account.id, event.order.id, message.title, event.createdAt))) {
        await this.notifications.notifyCustomerForOrderEvent(account.id, event.id, message);
      }

      await this.prisma.orderEvent.update({
        where: { id: event.id },
        data: { customerNotificationHandledAt: new Date() },
      });
    } catch (error) {
      this.warn(eventId, error);
    }
  }

  /**
   * Staff clicking a step twice, a retried request or a re-run event must not
   * ping the customer twice: the same message for the same order within
   * REPEAT_WINDOW_MS is dropped. (A genuine second delivery attempt hours later
   * still says "out for delivery" again.)
   */
  private async isRepeat(customerAccountId: string, orderId: string, title: string, at: Date): Promise<boolean> {
    const earlier = await this.prisma.appNotification.findFirst({
      where: {
        customerAccountId,
        title,
        orderEvent: { orderId },
        createdAt: { gte: new Date(at.getTime() - REPEAT_WINDOW_MS) },
      },
      select: { id: true },
    });
    return earlier !== null;
  }

  private async sweepPendingEvents(): Promise<void> {
    try {
      const pending = await this.prisma.orderEvent.findMany({
        where: { customerNotificationHandledAt: null },
        orderBy: { createdAt: 'asc' },
        take: 100,
        select: { id: true },
      });
      for (const event of pending) await this.deliverEvent(event.id);
    } catch (error) {
      this.warn('retry sweep', error);
    }
  }

  private warn(ref: string, error: unknown) {
    this.logger.warn(
      `Customer order notification ${ref} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
