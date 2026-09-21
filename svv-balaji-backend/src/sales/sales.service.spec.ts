import { OrderEventsService } from '../realtime/order-events.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { BadRequestException } from '@nestjs/common';
import { SalesService } from './sales.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/sequence.service';
import { PricingService } from '../pricing/pricing.service';
import { ReferralService } from '../common/referral.service';

/**
 * Phase 4 is where the traceability chain either survives into the sales half
 * of the system or quietly stops at the warehouse door.
 *
 * The properties pinned here:
 *   - an order is priced in its own channel, and the price is frozen onto it
 *   - only QA-released, unexpired stock can be picked, first-expiry-first-out
 *   - stock cannot be promised twice, and cancelling gives it back
 *   - dispatch actually moves stock out, not just the status
 *   - a delivered order still resolves back to the farmers who grew it
 */
describe('SalesService', () => {
  let customers: Record<string, any>;
  let stock: any[];
  let allocations: any[];
  let orders: any[];
  let orderItems: any[];
  let orderReturns: any[];
  let loyalty: { creditForDeliveredOrder: jest.Mock; reverseForReturn: jest.Mock; refundRedemptionForOrder: jest.Mock };
  let events: { publish: jest.Mock };
  let referrals: any[];
  let referralSettings: any;
  let coinTransactions: any[];
  let counters: Record<string, number>;
  let prisma: any;
  let pricing: any;
  let service: SalesService;

  const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
  const FUTURE = D('2027-06-30');

  const fgStock = (over: Partial<any> = {}) => {
    const n = stock.length + 1;
    const fgBatch = {
      id: `fg-${n}`,
      fgBatchNumber: `FG-20260801-00${n}`,
      productId: 'prod-atta',
      qaReleased: true,
      holdStatus: 'ACTIVE',
      expiryDate: FUTURE,
      ...(over.fgBatch ?? {}),
    };
    const row = {
      id: `stk-${n}`,
      warehouseId: 'wh-1',
      quantity: 100,
      reservedQuantity: 0,
      ...over,
      fgBatch,
      fgBatchId: fgBatch.id,
    };
    stock.push(row);
    return row;
  };

  beforeEach(() => {
    stock = [];
    allocations = [];
    orders = [];
    orderItems = [];
    orderReturns = [];
    loyalty = {
      creditForDeliveredOrder: jest.fn(async () => ({ credited: true, points: 0 })),
      reverseForReturn: jest.fn(async () => ({ pointsReversed: 0 })),
      refundRedemptionForOrder: jest.fn(async () => 0),
    };
    events = { publish: jest.fn() };
    referrals = [];
    referralSettings = null;
    coinTransactions = [];
    counters = {};

    customers = {
      'cust-b2b': {
        id: 'cust-b2b',
        customerCode: 'CUST-B2B-000001',
        channel: 'B2B',
        type: 'DISTRIBUTOR',
        status: 'ACTIVE',
        paymentTerms: 'PREPAID',
        creditLimit: null,
        branchId: 'branch-1',
      },
      'cust-b2c': {
        id: 'cust-b2c',
        customerCode: 'CUST-B2C-000001',
        channel: 'B2C',
        type: 'CONSUMER',
        status: 'ACTIVE',
        paymentTerms: 'PREPAID',
        creditLimit: null,
        branchId: null,
      },
      'cust-credit': {
        id: 'cust-credit',
        customerCode: 'CUST-B2B-000002',
        channel: 'B2B',
        type: 'RETAILER',
        status: 'ACTIVE',
        paymentTerms: 'CREDIT_30',
        creditLimit: 100000,
        branchId: 'branch-1',
      },
      'cust-blacklisted': {
        id: 'cust-blacklisted',
        customerCode: 'CUST-B2B-000003',
        channel: 'B2B',
        type: 'RETAILER',
        status: 'BLACKLISTED',
        paymentTerms: 'PREPAID',
        creditLimit: null,
        branchId: 'branch-1',
      },
    };

    prisma = {
      customer: {
        findUnique: jest.fn(async ({ where }) => customers[where.id] ?? null),
        update: jest.fn(async ({ where, data }) => {
          const row = customers[where.id];
          if (!row) return null;
          if (data.coinBalance?.increment) {
            row.coinBalance = (row.coinBalance ?? 0) + data.coinBalance.increment;
          } else {
            Object.assign(row, data);
          }
          return row;
        }),
      },
      referral: {
        findUnique: jest.fn(async ({ where }) =>
          referrals.find((r) => r.id === where.id || r.refereeId === where.refereeId) ?? null,
        ),
        update: jest.fn(async ({ where, data }) => {
          const row = referrals.find((r) => r.id === where.id);
          Object.assign(row, data);
          return row;
        }),
      },
      referralSettings: {
        findFirst: jest.fn(async () => referralSettings),
        create: jest.fn(async ({ data }) => {
          referralSettings = {
            id: 'rs-1',
            referrerRewardCoins: 100,
            refereeRewardCoins: 50,
            rewardTrigger: 'REGISTRATION',
            isActive: true,
            createdAt: new Date(),
            ...data,
          };
          return referralSettings;
        }),
        update: jest.fn(async ({ data }) => {
          for (const [key, value] of Object.entries(data)) {
            if (value !== undefined) (referralSettings as any)[key] = value;
          }
          return referralSettings;
        }),
      },
      coinTransaction: {
        create: jest.fn(async ({ data }: any) => {
          const row = { id: `ct-${coinTransactions.length + 1}`, createdAt: new Date(), ...data };
          coinTransactions.push(row);
          return row;
        }),
      },
      warehouse: {
        findUnique: jest.fn(async ({ where }) => ({ id: where.id, branchId: 'branch-1' })),
      },
      product: {
        findUnique: jest.fn(async () => ({ id: 'prod-atta', name: 'Wheat Atta 5kg', sku: 'ATTA-5' })),
      },
      order: {
        create: jest.fn(async ({ data }) => {
          const row = {
            id: `ord-${orders.length + 1}`,
            ...data,
            allocations: [],
            items: undefined,
          };
          const items = (data.items?.create ?? []).map((i: any, n: number) => ({
            id: `oi-${orderItems.length + n + 1}`,
            orderId: row.id,
            ...i,
          }));
          orderItems.push(...items);
          row.items = items;
          orders.push(row);
          return row;
        }),
        findUnique: jest.fn(async ({ where }) => {
          const row = orders.find((o) => o.id === where.id || o.orderNumber === where.orderNumber);
          if (!row) return null;
          return {
            ...row,
            items: orderItems
              .filter((i) => i.orderId === row.id)
              .map((i) => ({ ...i, returns: orderReturns.filter((r) => r.orderItemId === i.id) })),
            allocations: allocations
              .filter((a) => a.orderId === row.id && a.releasedAt == null)
              .map((a) => ({
                ...a,
                fgBatch: stock.find((r) => r.fgBatchId === a.fgBatchId)?.fgBatch,
              })),
          };
        }),
        findMany: jest.fn(async () => []),
        update: jest.fn(async ({ where, data }) => {
          const row = orders.find((o) => o.id === where.id);
          Object.assign(row, data);
          return row;
        }),
        count: jest.fn(async ({ where }: any) =>
          orders.filter((o) => {
            if (where.customerId && o.customerId !== where.customerId) return false;
            if (where.id?.not && o.id === where.id.not) return false;
            if (where.status?.in && !where.status.in.includes(o.status)) return false;
            if (where.status && typeof where.status === 'string' && o.status !== where.status) return false;
            return true;
          }).length,
        ),
      },
      orderAllocation: {
        create: jest.fn(async ({ data }) => {
          const row = { id: `al-${allocations.length + 1}`, ...data };
          allocations.push(row);
          return row;
        }),
        update: jest.fn(async ({ where, data }: any) =>
          Object.assign(allocations.find((a) => a.id === where.id), data),
        ),
        deleteMany: jest.fn(async ({ where }) => {
          allocations = allocations.filter((a) => a.orderId !== where.orderId);
          return { count: 0 };
        }),
        // Cancelling releases allocations rather than deleting them, so the order
        // can still answer which batches it was promised (A-13).
        updateMany: jest.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const a of allocations) {
            if (a.orderId === where.orderId && a.releasedAt == null) {
              Object.assign(a, data);
              count += 1;
            }
          }
          return { count };
        }),
      },
      orderItem: {
        findMany: jest.fn(async ({ where }: any) => orderItems.filter((i) => where.id.in.includes(i.id))),
      },
      orderEvent: { create: jest.fn(async () => ({})) },
      stockReservation: {
        aggregate: jest.fn(async () => ({ _sum: { quantity: 0 } })),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      couponRedemption: { findUnique: jest.fn(async () => null) },
      orderReturn: {
        create: jest.fn(async ({ data }: any) => {
          const row = { id: `ret-${orderReturns.length + 1}`, ...data };
          orderReturns.push(row);
          return row;
        }),
      },
      finishedGoodsBatch: {
        findMany: jest.fn(async ({ where }) =>
          stock
            .map((s) => s.fgBatch)
            .filter((b) => where.id.in.includes(b.id) && b.holdStatus !== where.holdStatus.not),
        ),
      },
      finishedGoodsStock: {
        findMany: jest.fn(async ({ where }) =>
          stock.filter(
            (s) =>
              s.warehouseId === where.warehouseId &&
              s.fgBatch.productId === where.fgBatch.productId &&
              s.fgBatch.qaReleased === where.fgBatch.qaReleased &&
              s.fgBatch.holdStatus === where.fgBatch.holdStatus,
          ),
        ),
        findUnique: jest.fn(async ({ where }) => {
          if (where.id) return stock.find((s) => s.id === where.id) ?? null;
          const key = where.warehouseId_fgBatchId;
          return (
            stock.find((s) => s.warehouseId === key.warehouseId && s.fgBatchId === key.fgBatchId) ??
            null
          );
        }),
        update: jest.fn(async ({ where, data }) => {
          const row = stock.find((s) => s.id === where.id);
          if (data.reservedQuantity?.increment) row.reservedQuantity += data.reservedQuantity.increment;
          if (data.reservedQuantity?.decrement) row.reservedQuantity -= data.reservedQuantity.decrement;
          if (data.quantity?.decrement) row.quantity -= data.quantity.decrement;
          return row;
        }),
      },
      sequenceCounter: {
        findUnique: jest.fn(async ({ where }) =>
          counters[where.key] === undefined ? null : { key: where.key, lastNumber: counters[where.key] },
        ),
        create: jest.fn(async ({ data }) => {
          counters[data.key] = data.lastNumber;
          return data;
        }),
        update: jest.fn(async ({ where }) => {
          counters[where.key] += 1;
          return { key: where.key, lastNumber: counters[where.key] };
        }),
      },
      // Dispatch writes the stock ledger; without this the tx client has no
      // stockMovement and the fulfilment tests blow up inside the service.
      stockMovement: {
        create: jest.fn(async ({ data }: any) => ({ id: 'mv-1', ...data })),
      },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };

    pricing = {
      resolve: jest.fn(async ({ channel }: any) => ({
        priceListId: channel === 'B2B' ? 'pl-b2b' : 'pl-b2c',
        unitPrice: channel === 'B2B' ? 180 : 250,
        gstRatePercent: 5,
        currency: 'INR',
        channel,
        appliedRule: `${channel} rule`,
      })),
    };

    service = new SalesService(
      prisma as unknown as PrismaService,
      new SequenceService(),
      pricing as unknown as PricingService,
      new ReferralService(),
      loyalty as unknown as LoyaltyService,
      events as unknown as OrderEventsService,
    );
  });

  const placeOrder = (customerId: string, quantity = 10) =>
    service.create(
      {
        customerId,
        warehouseId: 'wh-1',
        orderDate: '2026-08-11T00:00:00.000Z',
        items: [{ productId: 'prod-atta', quantity }],
      },
      'user-1',
    );

  describe('placing an order', () => {
    it('prices the order in the customer\'s own channel and freezes it on the line', async () => {
      const b2b: any = await placeOrder('cust-b2b');
      const b2c: any = await placeOrder('cust-b2c');

      expect(b2b.channel).toBe('B2B');
      expect(b2b.items[0].unitPrice).toBe(180);
      expect(b2b.items[0].priceListId).toBe('pl-b2b');

      expect(b2c.channel).toBe('B2C');
      expect(b2c.items[0].unitPrice).toBe(250);
      expect(b2c.items[0].priceListId).toBe('pl-b2c');
    });

    it('asks the pricing engine for the customer\'s channel, never the other one', async () => {
      await placeOrder('cust-b2c');
      expect(pricing.resolve).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'B2C', customerType: 'CONSUMER' }),
      );
    });

    it('computes GST and totals from the resolved rate', async () => {
      const order: any = await placeOrder('cust-b2b', 10);

      expect(order.subtotal).toBe(1800);
      expect(order.taxTotal).toBe(90);
      expect(order.total).toBe(1890);
    });

    it('forces a consumer order to prepaid', async () => {
      const order: any = await placeOrder('cust-b2c');
      expect(order.paymentTerms).toBe('PREPAID');
    });

    it('issues a dated order number', async () => {
      const order: any = await placeOrder('cust-b2b');
      expect(order.orderNumber).toBe('SO-20260811-001');
    });

    it('refuses an order from a blacklisted customer', async () => {
      await expect(placeOrder('cust-blacklisted')).rejects.toThrow(BadRequestException);
    });

    it('refuses the same product on two lines', async () => {
      await expect(
        service.create(
          {
            customerId: 'cust-b2b',
            warehouseId: 'wh-1',
            items: [
              { productId: 'prod-atta', quantity: 5 },
              { productId: 'prod-atta', quantity: 3 },
            ],
          },
          'user-1',
        ),
      ).rejects.toThrow(/more than one line/);
    });
  });

  describe('credit control', () => {
    it('refuses an order that would breach the credit limit', async () => {
      prisma.order.findMany.mockResolvedValueOnce([{ total: 95000 }]);

      await expect(placeOrder('cust-credit', 100)).rejects.toThrow(/credit limit/);
    });

    it('allows an order that fits within the remaining headroom', async () => {
      prisma.order.findMany.mockResolvedValueOnce([{ total: 10000 }]);

      const order: any = await placeOrder('cust-credit', 10);
      expect(order.total).toBe(1890);
    });

    it('refuses credit terms with no limit recorded rather than treating it as unlimited', async () => {
      customers['cust-credit'].creditLimit = null;

      await expect(placeOrder('cust-credit')).rejects.toThrow(/no credit limit/);
    });
  });

  describe('batch-wise allocation', () => {
    const confirmed = async (quantity = 10) => {
      const order: any = await placeOrder('cust-b2b', quantity);
      await service.confirm(order.id);
      return order;
    };

    it('picks first-expiry-first-out', async () => {
      fgStock({ quantity: 50, fgBatch: { id: 'fg-late', fgBatchNumber: 'FG-A', expiryDate: D('2027-12-31') } });
      fgStock({ quantity: 50, fgBatch: { id: 'fg-early', fgBatchNumber: 'FG-B', expiryDate: D('2027-01-31') } });

      const order = await confirmed(30);
      const result: any = await service.allocate(order.id, 'user-1');

      expect(result.allocations[0].fgBatchNumber).toBe('FG-B');
      expect(result.allocations[0].quantity).toBe(30);
    });

    it('spans batches when one is not enough, still shortest-dated first', async () => {
      fgStock({ quantity: 20, fgBatch: { id: 'fg-early', fgBatchNumber: 'FG-B', expiryDate: D('2027-01-31') } });
      fgStock({ quantity: 40, fgBatch: { id: 'fg-late', fgBatchNumber: 'FG-A', expiryDate: D('2027-12-31') } });

      const order = await confirmed(30);
      const result: any = await service.allocate(order.id, 'user-1');

      expect(result.allocations.map((a: any) => [a.fgBatchNumber, a.quantity])).toEqual([
        ['FG-B', 20],
        ['FG-A', 10],
      ]);
    });

    it('will not touch stock that failed QA release', async () => {
      fgStock({ quantity: 100, fgBatch: { id: 'fg-held', qaReleased: false } });

      const order = await confirmed(10);
      await expect(service.allocate(order.id, 'user-1')).rejects.toThrow(/QA-released/);
    });

    it('will not allocate a frozen or recalled batch', async () => {
      fgStock({ quantity: 100, fgBatch: { id: 'fg-frozen', holdStatus: 'ON_HOLD' } });
      fgStock({ quantity: 100, fgBatch: { id: 'fg-recalled', holdStatus: 'RECALLED' } });

      const order = await confirmed(10);
      await expect(service.allocate(order.id, 'user-1')).rejects.toThrow(/QA-released/);
    });

    it('will not ship expired stock', async () => {
      fgStock({ quantity: 100, fgBatch: { id: 'fg-old', expiryDate: D('2020-01-01') } });

      const order = await confirmed(10);
      // Expired stock is not allocatable, so nothing can be created for the line
      // and allocate refuses outright rather than allocating a partial quantity.
      await expect(service.allocate(order.id, 'user-1')).rejects.toThrow(
        /No QA-released stock is available/,
      );
    });

    it('reserves what it allocates, so the same packs cannot be promised twice', async () => {
      const row = fgStock({ quantity: 25 });

      const first = await confirmed(20);
      await service.allocate(first.id, 'user-1');
      expect(row.reservedQuantity).toBe(20);

      // Only 5 of the 25 packs are still free. Allocation fills what it can and
      // reports the rest as short rather than throwing - the property under test
      // is that the 20 already reserved are never handed to a second order.
      const second = await confirmed(10);
      const result: any = await service.allocate(second.id, 'user-1');
      expect(result.complete).toBe(false);
      expect(result.shortfalls).toHaveLength(1);
      expect(result.shortfalls[0]).toMatchObject({ requested: 10, allocated: 5, short: 5 });
      expect(row.reservedQuantity).toBe(25);
    });

    it('refuses to allocate an order twice', async () => {
      fgStock({ quantity: 100 });
      const order = await confirmed(10);
      await service.allocate(order.id, 'user-1');

      await expect(service.allocate(order.id, 'user-1')).rejects.toThrow(
        /cannot go from ALLOCATED/,
      );
    });

    it('refuses to top up an order that already holds allocations', async () => {
      fgStock({ quantity: 100 });
      const order = await confirmed(10);
      // A half-finished allocation left behind by an interrupted run: status is
      // still CONFIRMED, but stock is already being held.
      allocations.push({
        id: 'al-stray',
        orderId: order.id,
        orderItemId: 'oi-1',
        fgBatchId: 'fg-1',
        warehouseId: 'wh-1',
        quantity: 4,
      });

      await expect(service.allocate(order.id, 'user-1')).rejects.toThrow(/already has allocations/);
    });
  });

  describe('re-allocation after a freeze or recall', () => {
    const allocatedOrder = async (qty: number) => {
      const order: any = await placeOrder('cust-b2b', qty);
      await service.confirm(order.id);
      await service.allocate(order.id, 'user-1');
      return order;
    };

    it('moves the reservation from a frozen batch to healthy stock', async () => {
      const early = fgStock({ quantity: 50, fgBatch: { id: 'fg-early', fgBatchNumber: 'FG-B', expiryDate: D('2027-01-31') } });
      const late = fgStock({ quantity: 50, fgBatch: { id: 'fg-late', fgBatchNumber: 'FG-A', expiryDate: D('2027-12-31') } });
      const order = await allocatedOrder(30);
      expect(early.reservedQuantity).toBe(30);

      early.fgBatch.holdStatus = 'RECALLED';
      const result: any = await service.reallocate(order.id, 'user-1');

      expect(result.complete).toBe(true);
      expect(result.released[0]).toMatchObject({ fgBatchNumber: 'FG-B', quantity: 30 });
      expect(result.allocations).toEqual([expect.objectContaining({ fgBatchNumber: 'FG-A', quantity: 30 })]);
      expect(early.reservedQuantity).toBe(0);
      expect(late.reservedQuantity).toBe(30);
    });

    it('reports a shortfall instead of pretending, keeping what it could re-pick', async () => {
      const bad = fgStock({ quantity: 50, fgBatch: { id: 'fg-bad', fgBatchNumber: 'FG-B', expiryDate: D('2027-01-31') } });
      fgStock({ quantity: 10, fgBatch: { id: 'fg-ok', fgBatchNumber: 'FG-A', expiryDate: D('2027-12-31') } });
      const order = await allocatedOrder(30);

      bad.fgBatch.holdStatus = 'ON_HOLD';
      const result: any = await service.reallocate(order.id, 'user-1');

      expect(result.complete).toBe(false);
      expect(result.shortfalls[0].short).toBe(20);
      expect(result.allocations[0].quantity).toBe(10);
    });

    it('refuses when nothing is held, and once the order has shipped', async () => {
      fgStock({ quantity: 50 });
      const order = await allocatedOrder(10);
      await expect(service.reallocate(order.id, 'user-1')).rejects.toThrow(/nothing to re-allocate/);

      await service.advance(order.id, 'PACKED' as any, 'user-1');
      await service.advance(order.id, 'DISPATCHED' as any, 'user-1');
      await expect(service.reallocate(order.id, 'user-1')).rejects.toThrow(/allocated or packed/);
    });
  });

  describe('returns and loyalty', () => {
    const deliveredOrder = async (quantity = 10) => {
      fgStock({ quantity: 100 });
      const order: any = await placeOrder('cust-b2b', quantity);
      await service.confirm(order.id);
      await service.allocate(order.id, 'user-1');
      await service.advance(order.id, 'PACKED' as any, 'user-1');
      await service.advance(order.id, 'DISPATCHED' as any, 'user-1');
      await service.advance(order.id, 'DELIVERED' as any, 'user-1');
      return order;
    };
    const itemOf = (order: any) => orderItems.find((i) => i.orderId === order.id);

    it('asks loyalty to credit the order when it is delivered', async () => {
      const order = await deliveredOrder();
      expect(loyalty.creditForDeliveredOrder).toHaveBeenCalledWith(order.id);
    });

    it('never lets a loyalty failure block a delivery', async () => {
      loyalty.creditForDeliveredOrder.mockRejectedValueOnce(new Error('rewards are down'));
      const order = await deliveredOrder();
      expect(orders.find((o) => o.id === order.id).status).toBe('DELIVERED');
    });

    it('records a return and reverses loyalty points in the same transaction', async () => {
      const order = await deliveredOrder();
      loyalty.reverseForReturn.mockResolvedValueOnce({ pointsReversed: 10 });

      const result: any = await service.recordReturn(
        order.id,
        { items: [{ orderItemId: itemOf(order).id, quantity: 2 }], reason: 'Damaged' },
        'user-1',
      );

      expect(result.loyaltyPointsReversed).toBe(10);
      expect(orderReturns).toHaveLength(1);
      expect(orderReturns[0]).toMatchObject({ orderId: order.id, quantity: 2, reason: 'Damaged', recordedById: 'user-1' });
      // Handed the transaction client, so the return and its reversal commit together.
      expect(loyalty.reverseForReturn).toHaveBeenCalledWith(expect.anything(), order.id, [itemOf(order).id]);
    });

    it('refuses a return on an order that has not been delivered', async () => {
      fgStock({ quantity: 100 });
      const order: any = await placeOrder('cust-b2b', 5);
      await expect(
        service.recordReturn(order.id, { items: [{ orderItemId: itemOf(order).id, quantity: 1 }], reason: 'Changed mind' }, 'user-1'),
      ).rejects.toThrow(/delivered order/);
      expect(orderReturns).toHaveLength(0);
      expect(loyalty.reverseForReturn).not.toHaveBeenCalled();
    });

    it('refuses to return more than was ordered, counting earlier returns', async () => {
      const order = await deliveredOrder(10);
      await service.recordReturn(order.id, { items: [{ orderItemId: itemOf(order).id, quantity: 7 }], reason: 'First' }, 'u');
      await expect(
        service.recordReturn(order.id, { items: [{ orderItemId: itemOf(order).id, quantity: 4 }], reason: 'Second' }, 'u'),
      ).rejects.toThrow(/7 of 10 already returned/);
      expect(orderReturns).toHaveLength(1);
    });

    it('refuses an item that is not on the order', async () => {
      const order = await deliveredOrder();
      await expect(
        service.recordReturn(order.id, { items: [{ orderItemId: 'not-an-item', quantity: 1 }], reason: 'Wrong' }, 'u'),
      ).rejects.toThrow(/not on order/);
    });
  });

  describe('fulfilment', () => {
    it('refuses to dispatch a batch frozen after it was allocated', async () => {
      const row = fgStock({ quantity: 40 });
      const order: any = await placeOrder('cust-b2b', 15);
      await service.confirm(order.id);
      await service.allocate(order.id, 'user-1');
      await service.advance(order.id, 'PACKED' as any, 'user-1');

      row.fgBatch.holdStatus = 'RECALLED';

      await expect(service.advance(order.id, 'DISPATCHED' as any, 'user-1')).rejects.toThrow(
        /is RECALLED/,
      );
      expect(row.quantity).toBe(40); // nothing left the building
    });

    it('takes stock down only when the order is actually dispatched', async () => {
      const row = fgStock({ quantity: 40 });
      const order: any = await placeOrder('cust-b2b', 15);
      await service.confirm(order.id);
      await service.allocate(order.id, 'user-1');

      expect(row.quantity).toBe(40);
      expect(row.reservedQuantity).toBe(15);

      await service.advance(order.id, 'PACKED' as any, 'user-1');
      await service.advance(order.id, 'DISPATCHED' as any, 'user-1');

      expect(row.quantity).toBe(25);
      expect(row.reservedQuantity).toBe(0);
    });

    it('refuses to skip a step in the lifecycle', async () => {
      const order: any = await placeOrder('cust-b2b');
      await expect(service.advance(order.id, 'DELIVERED' as any, 'user-1')).rejects.toThrow(
        /cannot go from PLACED to DELIVERED/,
      );
    });

    it('gives reserved stock back when an order is cancelled', async () => {
      const row = fgStock({ quantity: 40 });
      const order: any = await placeOrder('cust-b2b', 15);
      await service.confirm(order.id);
      await service.allocate(order.id, 'user-1');
      expect(row.reservedQuantity).toBe(15);

      await service.cancel(order.id, { reason: 'Customer withdrew' });

      expect(row.reservedQuantity).toBe(0);
      expect(row.quantity).toBe(40);
    });

    it('will not cancel an order that has already been dispatched', async () => {
      fgStock({ quantity: 40 });
      const order: any = await placeOrder('cust-b2b', 5);
      await service.confirm(order.id);
      await service.allocate(order.id, 'user-1');
      await service.advance(order.id, 'PACKED' as any, 'user-1');
      await service.advance(order.id, 'DISPATCHED' as any, 'user-1');

      await expect(service.cancel(order.id, { reason: 'too late' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('referral rewards', () => {
    const setUpReferral = (trigger: string) => {
      customers['cust-referrer'] = {
        id: 'cust-referrer',
        customerCode: 'CUST-B2C-000099',
        channel: 'B2C',
        type: 'CONSUMER',
        status: 'ACTIVE',
        paymentTerms: 'PREPAID',
        creditLimit: null,
        branchId: null,
        coinBalance: 0,
      };
      referrals.push({
        id: 'ref-1',
        referrerId: 'cust-referrer',
        refereeId: 'cust-b2c',
        code: 'REFCODE1',
        rewardedAt: null,
        createdAt: new Date(),
      });
      referralSettings = {
        id: 'rs-1',
        referrerRewardCoins: 100,
        refereeRewardCoins: 50,
        rewardTrigger: trigger,
        isActive: true,
        createdAt: new Date(),
      };
    };

    it('credits both sides on the referee\'s first confirmed order when the trigger is FIRST_ORDER', async () => {
      setUpReferral('FIRST_ORDER');
      const order: any = await placeOrder('cust-b2c');

      await service.confirm(order.id);

      expect(customers['cust-referrer'].coinBalance).toBe(100);
      expect(customers['cust-b2c'].coinBalance).toBe(50);
      expect(referrals[0].rewardedAt).not.toBeNull();
      expect(coinTransactions).toHaveLength(2);
    });

    it('does not credit again on a second order', async () => {
      setUpReferral('FIRST_ORDER');
      const first: any = await placeOrder('cust-b2c');
      await service.confirm(first.id);

      const second: any = await placeOrder('cust-b2c');
      await service.confirm(second.id);

      expect(customers['cust-referrer'].coinBalance).toBe(100);
      expect(customers['cust-b2c'].coinBalance).toBe(50);
      expect(coinTransactions).toHaveLength(2);
    });

    it('does not credit an order confirmation when the trigger is FIRST_DELIVERY', async () => {
      setUpReferral('FIRST_DELIVERY');
      const order: any = await placeOrder('cust-b2c');
      await service.confirm(order.id);

      expect(customers['cust-referrer'].coinBalance).toBe(0);
      expect(referrals[0].rewardedAt).toBeNull();
    });

    it('credits both sides on the referee\'s first delivered order when the trigger is FIRST_DELIVERY', async () => {
      setUpReferral('FIRST_DELIVERY');
      fgStock({ quantity: 40 });
      const order: any = await placeOrder('cust-b2c', 5);
      await service.confirm(order.id);
      await service.allocate(order.id, 'user-1');
      await service.advance(order.id, 'PACKED' as any, 'user-1');
      await service.advance(order.id, 'DISPATCHED' as any, 'user-1');

      expect(customers['cust-referrer'].coinBalance).toBe(0);

      await service.advance(order.id, 'DELIVERED' as any, 'user-1');

      expect(customers['cust-referrer'].coinBalance).toBe(100);
      expect(customers['cust-b2c'].coinBalance).toBe(50);
      expect(referrals[0].rewardedAt).not.toBeNull();
    });

    it('does not credit while the program is switched off', async () => {
      setUpReferral('FIRST_ORDER');
      referralSettings.isActive = false;
      const order: any = await placeOrder('cust-b2c');

      await service.confirm(order.id);

      expect(customers['cust-referrer'].coinBalance).toBe(0);
      expect(referrals[0].rewardedAt).toBeNull();
    });

    it('never lets a referral-crediting failure block the order transition', async () => {
      setUpReferral('FIRST_ORDER');
      prisma.referralSettings.findFirst = jest.fn(async () => {
        throw new Error('boom');
      });
      const order: any = await placeOrder('cust-b2c');

      const confirmed: any = await service.confirm(order.id);
      expect(confirmed.status).toBe('CONFIRMED');
    });
  });

  describe('traceability', () => {
    it('resolves a shipped order back to the farmers who grew it', async () => {
      prisma.order.findUnique.mockResolvedValueOnce({
        id: 'ord-1',
        orderNumber: 'SO-20260811-001',
        channel: 'B2B',
        status: 'DISPATCHED',
        orderDate: D('2026-08-11'),
        customer: { customerCode: 'CUST-B2B-000001', name: 'Sri Venkatesh Traders', channel: 'B2B' },
        items: [
          {
            id: 'oi-1',
            quantity: 30,
            product: { id: 'prod-atta', name: 'Wheat Atta 5kg', sku: 'ATTA-5' },
          },
        ],
        allocations: [
          {
            orderItemId: 'oi-1',
            fgBatchId: 'fg-1',
            quantity: 30,
            fgBatch: {
              fgBatchNumber: 'FG-20260807-001',
              manufacturingDate: D('2026-08-07'),
              expiryDate: FUTURE,
              productionBatch: {
                productionBatchNumber: 'PB-20260807-001',
                recipe: { recipeCode: 'RCP-001', version: 2, name: 'Wheat Atta' },
                consumptions: [
                  {
                    rawMaterialBatch: {
                      batchNumber: 'RM-20260805-001',
                      cropName: 'Wheat',
                      farmer: {
                        farmerCode: 'SVV-2026-000001',
                        fullName: 'Ramesh Patil',
                        village: 'Kalghatgi',
                        district: 'Dharwad',
                        state: 'Karnataka',
                        gpsLocation: '15.18,74.97',
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      });

      const trace: any = await service.traceability('SO-20260811-001');

      expect(trace.summary.fullyTraceable).toBe(true);
      expect(trace.summary.distinctFarmers).toBe(1);
      expect(trace.lines[0].batches[0].fgBatchNumber).toBe('FG-20260807-001');
      expect(trace.lines[0].batches[0].productionBatchNumber).toBe('PB-20260807-001');
      expect(trace.lines[0].batches[0].farmers[0]).toMatchObject({
        farmerCode: 'SVV-2026-000001',
        farmerName: 'Ramesh Patil',
        village: 'Kalghatgi',
        rawBatchNumber: 'RM-20260805-001',
      });
    });
  });
});
