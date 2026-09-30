import { CustomerAccountStatus } from '@prisma/client';
import {
  CustomerOrderNotificationsService,
  customerOrderMessage,
} from './customer-order-notifications.service';

describe('customerOrderMessage', () => {
  const message = (type: string, note?: string) =>
    customerOrderMessage({
      type,
      note,
      orderNumber: 'SO-20260929-001',
      total: 1234.5,
      fulfillmentMethod: 'LOCAL',
    });

  it.each([
    ['PLACED', 'Order placed successfully'],
    ['CONFIRMED', 'Order accepted'],
    ['PACKED', 'Order packed'],
    ['RIDER_ASSIGNED', 'Rider assigned'],
    ['DISPATCHED', 'Rider picked up your order'],
    ['OUT_FOR_DELIVERY', 'Out for delivery'],
    ['ARRIVED', 'Your rider has arrived'],
    ['DELIVERY_FAILED', 'Delivery needs attention'],
    ['RETURNED_TO_STORE', 'Order returned to the store'],
    ['REATTEMPT_SCHEDULED', 'Delivery re-attempt scheduled'],
    ['DELIVERED', 'Order delivered'],
    ['CANCELLED', 'Order cancelled'],
    ['RETURN_RECORDED', 'Return recorded'],
  ])('maps %s to a customer alert', (type, title) => {
    expect(message(type, 'Useful detail')?.title).toBe(title);
    expect(message(type)?.link).toBe('/orders/SO-20260929-001');
  });

  it('ignores internal timeline noise', () => {
    expect(message('SCANNED')).toBeNull();
    expect(message('OTP_FAILED')).toBeNull();
  });

  it('trims untrusted notes before putting them in a push', () => {
    expect(message('CANCELLED', '  address   issue  ')?.body).toContain('address issue');
  });
});

describe('CustomerOrderNotificationsService', () => {
  const prisma = {
    orderEvent: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };
  const orderEvents = { onTimeline: jest.fn(), on: jest.fn() };
  const notifications = { notifyCustomerForOrderEvent: jest.fn() };
  const service = new CustomerOrderNotificationsService(
    prisma as never,
    orderEvents as never,
    notifications as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.orderEvent.findMany.mockResolvedValue([]);
    prisma.orderEvent.update.mockResolvedValue({});
  });

  it('sends a supported committed event to the order owner', async () => {
    prisma.orderEvent.findUnique.mockResolvedValue({
      id: 'event-1',
      type: 'CONFIRMED',
      note: null,
      customerNotificationHandledAt: null,
      order: {
        orderNumber: 'SO-1',
        total: 500,
        fulfillmentMethod: 'LOCAL',
        customer: { account: { id: 'account-1', status: CustomerAccountStatus.ACTIVE } },
      },
    });
    notifications.notifyCustomerForOrderEvent.mockResolvedValue({
      created: true,
      sent: 1,
      failed: 0,
    });

    await service.deliverEvent('event-1');

    expect(notifications.notifyCustomerForOrderEvent).toHaveBeenCalledWith(
      'account-1',
      'event-1',
      expect.objectContaining({ title: 'Order accepted', link: '/orders/SO-1' }),
    );
    expect(prisma.orderEvent.update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: { customerNotificationHandledAt: expect.any(Date) },
    });
  });

  it('does not notify for an internal event or an account that is not active', async () => {
    prisma.orderEvent.findUnique
      .mockResolvedValueOnce({
        id: 'event-2',
        type: 'SCANNED',
        note: null,
        customerNotificationHandledAt: null,
        order: {
          orderNumber: 'SO-2',
          total: 500,
          fulfillmentMethod: 'LOCAL',
          customer: { account: { id: 'account-2', status: CustomerAccountStatus.ACTIVE } },
        },
      })
      .mockResolvedValueOnce({
        id: 'event-3',
        type: 'CONFIRMED',
        note: null,
        customerNotificationHandledAt: null,
        order: {
          orderNumber: 'SO-3',
          total: 500,
          fulfillmentMethod: 'LOCAL',
          customer: { account: { id: 'account-3', status: CustomerAccountStatus.SUSPENDED } },
        },
      });

    await service.deliverEvent('event-2');
    await service.deliverEvent('event-3');

    expect(notifications.notifyCustomerForOrderEvent).not.toHaveBeenCalled();
    expect(prisma.orderEvent.update).toHaveBeenCalledTimes(2);
  });

  it('does not replay an event that was already handled', async () => {
    prisma.orderEvent.findUnique.mockResolvedValue({
      id: 'event-4',
      type: 'CONFIRMED',
      note: null,
      customerNotificationHandledAt: new Date(),
      order: {
        orderNumber: 'SO-4',
        total: 500,
        fulfillmentMethod: 'LOCAL',
        customer: { account: { id: 'account-4', status: CustomerAccountStatus.ACTIVE } },
      },
    });

    await service.deliverEvent('event-4');

    expect(notifications.notifyCustomerForOrderEvent).not.toHaveBeenCalled();
    expect(prisma.orderEvent.update).not.toHaveBeenCalled();
  });

  it('subscribes to exact timeline events and the checkout new-order event', () => {
    service.onModuleInit();
    expect(orderEvents.onTimeline).toHaveBeenCalledTimes(1);
    expect(orderEvents.on).toHaveBeenCalledWith('new', expect.any(Function));
    expect(prisma.orderEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customerNotificationHandledAt: null },
        take: 100,
      }),
    );
    service.onModuleDestroy();
  });
});
