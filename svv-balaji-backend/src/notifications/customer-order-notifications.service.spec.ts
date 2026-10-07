import { CustomerAccountStatus } from '@prisma/client';
import {
  CustomerOrderNotificationsService,
  customerOrderMessage,
} from './customer-order-notifications.service';

describe('customerOrderMessage', () => {
  const message = (type: string, note?: string, extra: { fulfillmentMethod?: string; appRider?: boolean; riderName?: string } = {}) =>
    customerOrderMessage({
      type,
      note,
      orderNumber: 'SO-20260929-001',
      total: 1234.5,
      fulfillmentMethod: 'LOCAL',
      ...extra,
    });

  it.each([
    ['CONFIRMED', 'Order accepted'],
    ['OUT_FOR_DELIVERY', 'Out for delivery'],
    ['DELIVERED', 'Order delivered'],
    ['RETURN_UPDATE', 'Return / exchange update'],
  ])('maps %s to a customer alert', (type, title) => {
    expect(message(type, 'Useful detail')?.title).toBe(title);
    expect(message(type)?.link).toBe('/orders/SO-20260929-001');
  });

  it.each(['PLACED', 'PACKED', 'RIDER_ASSIGNED', 'PICKED_UP', 'ARRIVED', 'DELIVERY_FAILED', 'RETURNED_TO_STORE', 'REATTEMPT_SCHEDULED', 'CANCELLED', 'RETURN_RECORDED', 'SHIPMENT_CREATED', 'SCANNED', 'OTP_FAILED'])(
    'sends nothing for %s (only accepted / out for delivery / delivered)',
    (type) => expect(message(type, 'detail', { appRider: true })).toBeNull(),
  );

  it('a local order with an app rider says "out for delivery" when the trip starts, not at pickup', () => {
    expect(message('DISPATCHED', undefined, { appRider: true })).toBeNull();
    expect(message('OUT_FOR_DELIVERY', undefined, { appRider: true, riderName: 'Raunak' })?.body).toContain('Raunak');
  });

  it('a local order handed to an outside driver is out for delivery when it leaves the store', () => {
    expect(message('DISPATCHED', undefined, { appRider: false, riderName: 'Ravi' })?.title).toBe('Out for delivery');
  });

  it('a courier order is out for delivery on the courier scan only', () => {
    expect(message('DISPATCHED', undefined, { fulfillmentMethod: 'SHIPROCKET' })).toBeNull();
    expect(message('SHIPMENT_UPDATE', 'IN_TRANSIT', { fulfillmentMethod: 'SHIPROCKET' })).toBeNull();
    expect(message('SHIPMENT_UPDATE', 'OUT_FOR_DELIVERY', { fulfillmentMethod: 'SHIPROCKET' })?.title).toBe('Out for delivery');
  });

  it('trims untrusted notes before putting them in a push', () => {
    expect(message('RETURN_UPDATE', '  Return   RR-1:  approved  ')?.body).toBe('Return RR-1: approved');
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
    appNotification: { findFirst: jest.fn() },
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
    prisma.appNotification.findFirst.mockResolvedValue(null);
  });

  it('sends a supported committed event to the order owner', async () => {
    prisma.orderEvent.findUnique.mockResolvedValue({
      id: 'event-1',
      type: 'CONFIRMED',
      note: null,
      customerNotificationHandledAt: null,
      createdAt: new Date(),
      order: {
        orderNumber: 'SO-1',
        total: 500,
        fulfillmentMethod: 'LOCAL',
        id: 'order-x',
        riderName: null,
        deliveryTasks: [],
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
        createdAt: new Date(),
        order: {
          orderNumber: 'SO-2',
          total: 500,
          fulfillmentMethod: 'LOCAL',
          id: 'order-x',
          riderName: null,
          deliveryTasks: [],
          customer: { account: { id: 'account-2', status: CustomerAccountStatus.ACTIVE } },
        },
      })
      .mockResolvedValueOnce({
        id: 'event-3',
        type: 'CONFIRMED',
        note: null,
        customerNotificationHandledAt: null,
        createdAt: new Date(),
        order: {
          orderNumber: 'SO-3',
          total: 500,
          fulfillmentMethod: 'LOCAL',
          id: 'order-x',
          riderName: null,
          deliveryTasks: [],
          customer: { account: { id: 'account-3', status: CustomerAccountStatus.SUSPENDED } },
        },
      });

    await service.deliverEvent('event-2');
    await service.deliverEvent('event-3');

    expect(notifications.notifyCustomerForOrderEvent).not.toHaveBeenCalled();
    expect(prisma.orderEvent.update).toHaveBeenCalledTimes(2);
  });

  it('does not ping the customer twice for the same step (double click / retry)', async () => {
    prisma.orderEvent.findUnique.mockResolvedValue({
      id: 'event-5',
      type: 'CONFIRMED',
      note: null,
      customerNotificationHandledAt: null,
      createdAt: new Date(),
      order: { id: 'order-5', orderNumber: 'SO-5', total: 500, fulfillmentMethod: 'LOCAL', riderName: null, deliveryTasks: [],
        customer: { account: { id: 'account-5', status: CustomerAccountStatus.ACTIVE } } },
    });
    prisma.appNotification.findFirst.mockResolvedValue({ id: 'earlier' });

    await service.deliverEvent('event-5');

    expect(notifications.notifyCustomerForOrderEvent).not.toHaveBeenCalled();
    expect(prisma.appNotification.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ customerAccountId: 'account-5', title: 'Order accepted', orderEvent: { orderId: 'order-5' } }),
    }));
    expect(prisma.orderEvent.update).toHaveBeenCalledTimes(1);
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
        id: 'order-x',
        riderName: null,
        deliveryTasks: [],
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
