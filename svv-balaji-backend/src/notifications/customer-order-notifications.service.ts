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
}

const money = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const detail = (note?: string | null) => note?.trim().replace(/\s+/g, ' ').slice(0, 220) || null;

/** Customer-facing copy for the order events that warrant an immediate alert. */
export function customerOrderMessage(
  input: OrderEventMessageInput,
): CustomerNotificationMessage | null {
  const { type, orderNumber } = input;
  const note = detail(input.note);
  const link = `/orders/${encodeURIComponent(orderNumber)}`;
  const base = { link, tag: `order-${orderNumber}-${type.toLowerCase()}` };

  switch (type) {
    case 'PLACED':
      return {
        ...base,
        title: 'Order placed successfully',
        body: `We received order ${orderNumber} for ${money(input.total)}. We will confirm it shortly.`,
      };
    case 'CONFIRMED':
      return {
        ...base,
        title: 'Order accepted',
        body: `Your order ${orderNumber} has been accepted and is being prepared.`,
      };
    case 'PACKED':
      return {
        ...base,
        title: 'Order packed',
        body: `Your order ${orderNumber} is packed and ready to leave.`,
      };
    case 'RIDER_ASSIGNED':
      return {
        ...base,
        title: 'Rider assigned',
        body: note
          ? `${note} will deliver order ${orderNumber}.`
          : `A rider has been assigned to order ${orderNumber}.`,
      };
    case 'SHIPMENT_CREATED':
      return {
        ...base,
        title: 'Courier booked',
        body: note
          ? `Order ${orderNumber}: ${note}.`
          : `A courier has been booked for order ${orderNumber}.`,
      };
    case 'SHIPMENT_UPDATE':
      return {
        ...base,
        title: 'Shipping update',
        body: note
          ? `Order ${orderNumber}: ${note}.`
          : `There is a new shipping update for order ${orderNumber}.`,
      };
    case 'DISPATCHED':
      return {
        ...base,
        title:
          input.fulfillmentMethod === 'LOCAL' ? 'Rider picked up your order' : 'Order dispatched',
        body:
          input.fulfillmentMethod === 'LOCAL'
            ? `Order ${orderNumber} has left the store with your rider.`
            : `Order ${orderNumber} has left our warehouse. Track it in the app.`,
      };
    case 'OUT_FOR_DELIVERY':
      return {
        ...base,
        title: 'Out for delivery',
        body: `Your rider is on the way with order ${orderNumber}.`,
      };
    case 'ARRIVED':
      return {
        ...base,
        title: 'Your rider has arrived',
        body: `Please receive order ${orderNumber} and share the delivery OTP only after checking it.`,
      };
    case 'DELIVERY_FAILED':
      return {
        ...base,
        title: 'Delivery needs attention',
        body: note
          ? `Order ${orderNumber} could not be delivered: ${note}.`
          : `Order ${orderNumber} could not be delivered. We will update you about the next step.`,
      };
    case 'RETURNED_TO_STORE':
      return {
        ...base,
        title: 'Order returned to the store',
        body: `Order ${orderNumber} is back at the store. We will update you when another delivery is arranged.`,
      };
    case 'REATTEMPT_SCHEDULED':
      return {
        ...base,
        title: 'Delivery re-attempt scheduled',
        body: `Another delivery attempt is being arranged for order ${orderNumber}.`,
      };
    case 'DELIVERED':
      return {
        ...base,
        title: 'Order delivered',
        body: `Order ${orderNumber} was delivered successfully. Thank you for shopping with Desi Tokri.`,
      };
    case 'CANCELLED':
      return {
        ...base,
        title: 'Order cancelled',
        body: note
          ? `Order ${orderNumber} was cancelled: ${note}.`
          : `Order ${orderNumber} was cancelled.`,
      };
    case 'RETURN_RECORDED':
      return {
        ...base,
        title: 'Return recorded',
        body: note
          ? `A return was recorded for order ${orderNumber}: ${note}.`
          : `A return was recorded for order ${orderNumber}.`,
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
          order: {
            select: {
              orderNumber: true,
              total: true,
              fulfillmentMethod: true,
              customer: { select: { account: { select: { id: true, status: true } } } },
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
      });
      if (message && account?.status === CustomerAccountStatus.ACTIVE) {
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
