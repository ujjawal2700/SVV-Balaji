import { BadRequestException } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';

/**
 * A stateful stand-in for the handful of tables the loyalty service touches.
 * It keeps real rows so the tests assert LEDGER OUTCOMES (balance, remaining
 * live points, reversed points) rather than which mock was called.
 */
function makeWorld(over: { settings?: Record<string, unknown>; items?: any[]; status?: string } = {}) {
  const state: any = {
    settings: {
      id: 's1', isActive: true, earnPercentB2C: 5, earnPercentB2B: 1, pointValueInr: 1,
      calculationBase: 'EXCLUDING_TAX', defaultEligible: true, appliesToDiscountedProducts: true,
      minEligibleItemAmount: null, minEligibleOrderAmount: null, maxRewardPerOrderInr: null,
      pointsExpiryMonths: null, earningStartsAt: new Date('2026-01-01'), ...over.settings,
    },
    balance: 0,
    earns: [] as any[],
    lines: [] as any[],
    coins: [] as any[],
    returns: [] as any[],
  };

  const items = over.items ?? [
    { id: 'i1', productId: 'p1', quantity: 10, unitPrice: 100, gstRatePercent: 5, lineSubtotal: 1000, lineTax: 50, lineTotal: 1050,
      product: { id: 'p1', name: 'Atta', mrp: null, loyaltyEligibility: 'INHERIT', category: null }, returns: [] },
  ];
  const order = {
    id: 'o1', orderNumber: 'SO-1', status: over.status ?? 'DELIVERED', channel: 'B2C',
    customerId: 'c1', deliveredAt: new Date('2026-09-10'), items,
  };

  const prisma: any = {
    loyaltySettings: { findFirst: async () => state.settings, create: async () => state.settings },
    order: { findUnique: async () => order },
    loyaltyOrderEarn: {
      findUnique: async ({ where }: any) => state.earns.find((e) => e.orderId === where.orderId) ?? null,
      create: async ({ data }: any) => {
        if (state.earns.some((e) => e.orderId === data.orderId)) {
          const { Prisma } = require('@prisma/client');
          throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
        }
        const { lines, ...rest } = data;
        const earn = { id: `e${state.earns.length + 1}`, coinTransactionId: null, ...rest };
        state.earns.push(earn);
        for (const l of lines.create) state.lines.push({ id: `l${state.lines.length + 1}`, earnId: earn.id, reversedPoints: 0, ...l });
        return earn;
      },
      update: async ({ where, data }: any) => Object.assign(state.earns.find((e) => e.id === where.id), data),
    },
    coinTransaction: {
      create: async ({ data }: any) => {
        const row = { id: `t${state.coins.length + 1}`, createdAt: new Date(), ...data };
        state.coins.push(row);
        return row;
      },
      findUnique: async ({ where }: any) => state.coins.find((c) => c.id === where.id) ?? null,
      update: async ({ where, data }: any) => {
        const row = state.coins.find((c) => c.id === where.id);
        if (data.remainingAmount?.decrement !== undefined) row.remainingAmount -= data.remainingAmount.decrement;
        else Object.assign(row, data);
        return row;
      },
      findMany: async ({ where }: any) =>
        state.coins.filter((c) => c.reason === where.reason && c.expiresAt && c.expiresAt <= where.expiresAt.lte && c.remainingAmount > 0),
    },
    customer: {
      update: async ({ data }: any) => {
        if (data.coinBalance?.increment) state.balance += data.coinBalance.increment;
        if (data.coinBalance?.decrement) state.balance -= data.coinBalance.decrement;
      },
      findUniqueOrThrow: async () => ({ coinBalance: state.balance }),
    },
    orderReturn: {
      aggregate: async ({ where }: any) => ({
        _sum: { quantity: state.returns.filter((r: any) => r.orderItemId === where.orderItemId).reduce((n: number, r: any) => n + r.quantity, 0) },
      }),
    },
    loyaltyOrderEarnLine: {
      update: async ({ where, data }: any) => {
        const line = state.lines.find((l: any) => l.id === where.id);
        line.reversedPoints += data.reversedPoints.increment;
      },
    },
  };
  prisma.$transaction = async (fn: any) => fn(prisma);
  // reverseForReturn reads the earn together with its lines.
  const findEarn = prisma.loyaltyOrderEarn.findUnique;
  prisma.loyaltyOrderEarn.findUnique = async (args: any) => {
    const earn = await findEarn(args);
    if (earn && args.include?.lines) {
      return { ...earn, lines: state.lines.filter((l: any) => l.earnId === earn.id && args.include.lines.where.orderItemId.in.includes(l.orderItemId)) };
    }
    return earn;
  };

  const service = new LoyaltyService(prisma, {} as any);
  return { service, state, prisma, order };
}

const doReturn = (w: ReturnType<typeof makeWorld>, orderItemId: string, quantity: number) => {
  w.state.returns.push({ orderItemId, quantity });
  return w.service.reverseForReturn(w.prisma, 'o1', [orderItemId]);
};

describe('LoyaltyService.creditForDeliveredOrder', () => {
  it('credits 5% of the eligible amount: Rs 1,000 -> Rs 50 -> 50 points', async () => {
    const w = makeWorld();
    expect(await w.service.creditForDeliveredOrder('o1')).toEqual({ credited: true, points: 50 });
    expect(w.state.balance).toBe(50);
    expect(w.state.coins[0]).toMatchObject({ reason: 'LOYALTY_EARN', amount: 50, remainingAmount: 50, orderId: 'o1' });
    expect(w.state.earns[0]).toMatchObject({ points: 50, rewardInr: 50, eligibleAmount: 1000, percentApplied: 5, skipReason: null });
  });

  it('is idempotent: a second call (hook + sweep, two instances) never pays twice', async () => {
    const w = makeWorld();
    await w.service.creditForDeliveredOrder('o1');
    expect(await w.service.creditForDeliveredOrder('o1')).toEqual({ credited: false, points: 50 });
    expect(w.state.balance).toBe(50);
    expect(w.state.coins).toHaveLength(1);
  });

  it('refuses an order that is not delivered', async () => {
    const w = makeWorld({ status: 'DISPATCHED' });
    await expect(w.service.creditForDeliveredOrder('o1')).rejects.toThrow(BadRequestException);
    expect(w.state.balance).toBe(0);
  });

  it('uses the configured point value: Rs 0.25 per point = 200 points for the same order', async () => {
    const w = makeWorld({ settings: { pointValueInr: 0.25 } });
    await w.service.creditForDeliveredOrder('o1');
    expect(w.state.balance).toBe(200);
    expect(w.state.earns[0].rewardInr).toBe(50);
  });

  it('excludes a product marked not eligible and records why', async () => {
    const w = makeWorld({
      items: [
        { id: 'i1', productId: 'p1', quantity: 5, unitPrice: 100, gstRatePercent: 5, lineSubtotal: 500, lineTax: 25, lineTotal: 525,
          product: { id: 'p1', name: 'Atta', mrp: null, loyaltyEligibility: 'INHERIT', category: null }, returns: [] },
        { id: 'i2', productId: 'p2', quantity: 5, unitPrice: 100, gstRatePercent: 5, lineSubtotal: 500, lineTax: 25, lineTotal: 525,
          product: { id: 'p2', name: 'Oil', mrp: null, loyaltyEligibility: 'NOT_ELIGIBLE', category: null }, returns: [] },
      ],
    });
    await w.service.creditForDeliveredOrder('o1');
    expect(w.state.balance).toBe(25); // 5% of the eligible 500 only
    expect(w.state.lines.find((l: any) => l.orderItemId === 'i2')).toMatchObject({ eligible: false, ineligibleReason: 'PRODUCT_NOT_ELIGIBLE', points: 0 });
  });

  it('a category rule applies unless the product overrides it', async () => {
    const category = { name: 'Snacks', loyaltyEligibility: 'NOT_ELIGIBLE', parent: null };
    const w = makeWorld({
      items: [
        { id: 'i1', productId: 'p1', quantity: 5, unitPrice: 100, gstRatePercent: 5, lineSubtotal: 500, lineTax: 25, lineTotal: 525,
          product: { id: 'p1', name: 'A', mrp: null, loyaltyEligibility: 'INHERIT', category }, returns: [] },
        { id: 'i2', productId: 'p2', quantity: 5, unitPrice: 100, gstRatePercent: 5, lineSubtotal: 500, lineTax: 25, lineTotal: 525,
          product: { id: 'p2', name: 'B', mrp: null, loyaltyEligibility: 'ELIGIBLE', category }, returns: [] },
      ],
    });
    await w.service.creditForDeliveredOrder('o1');
    expect(w.state.balance).toBe(25);
    expect(w.state.lines.find((l: any) => l.orderItemId === 'i1').eligibilitySource).toBe('CATEGORY');
    expect(w.state.lines.find((l: any) => l.orderItemId === 'i2').eligibilitySource).toBe('PRODUCT');
  });

  it('records a zero-point earn when the program is off, so it is not retro-paid later', async () => {
    const w = makeWorld({ settings: { isActive: false } });
    expect(await w.service.creditForDeliveredOrder('o1')).toEqual({ credited: true, points: 0 });
    expect(w.state.earns[0].skipReason).toBe('PROGRAM_OFF');
    expect(w.state.coins).toHaveLength(0);
    expect(w.state.balance).toBe(0);
  });

  it('stamps an expiry date from the configured months', async () => {
    const w = makeWorld({ settings: { pointsExpiryMonths: 12 } });
    await w.service.creditForDeliveredOrder('o1');
    expect(w.state.coins[0].expiresAt.toISOString().slice(0, 10)).toBe('2027-09-10');
  });

  it('nets out items returned before the credit ran', async () => {
    const w = makeWorld({
      items: [
        { id: 'i1', productId: 'p1', quantity: 10, unitPrice: 100, gstRatePercent: 5, lineSubtotal: 1000, lineTax: 50, lineTotal: 1050,
          product: { id: 'p1', name: 'Atta', mrp: null, loyaltyEligibility: 'INHERIT', category: null }, returns: [{ quantity: 4 }] },
      ],
    });
    await w.service.creditForDeliveredOrder('o1');
    expect(w.state.balance).toBe(30); // 5% of the 6 packs actually kept (Rs 600)
  });
});

describe('LoyaltyService.reverseForReturn', () => {
  it('takes back points in proportion to the quantity returned', async () => {
    const w = makeWorld();
    await w.service.creditForDeliveredOrder('o1'); // 50 points over 10 packs
    expect((await doReturn(w, 'i1', 2)).pointsReversed).toBe(10);
    expect(w.state.balance).toBe(40);
    expect(w.state.coins.find((c: any) => c.reason === 'LOYALTY_REVERSAL')).toMatchObject({ amount: -10, orderId: 'o1' });
    expect(w.state.coins[0].remainingAmount).toBe(40);
  });

  it('a full return over several steps reverses exactly what was earned, never more', async () => {
    const w = makeWorld();
    await w.service.creditForDeliveredOrder('o1');
    await doReturn(w, 'i1', 3);
    await doReturn(w, 'i1', 4);
    await doReturn(w, 'i1', 3);
    expect(w.state.balance).toBe(0);
    expect(w.state.lines[0].reversedPoints).toBe(50);
    // A stray extra call changes nothing.
    expect((await w.service.reverseForReturn(w.prisma, 'o1', ['i1'])).pointsReversed).toBe(0);
  });

  it('does not debit points that already expired, but still marks them reversed', async () => {
    const w = makeWorld({ settings: { pointsExpiryMonths: 1 } });
    await w.service.creditForDeliveredOrder('o1');
    await w.service.expireDue(undefined, new Date('2027-01-01')); // everything lapses
    expect(w.state.balance).toBe(0);
    expect((await doReturn(w, 'i1', 10)).pointsReversed).toBe(0);
    expect(w.state.balance).toBe(0); // no second debit
    expect(w.state.lines[0].reversedPoints).toBe(50);
  });

  it('does nothing for an order that never earned (no earn row yet)', async () => {
    const w = makeWorld();
    expect((await doReturn(w, 'i1', 5)).pointsReversed).toBe(0);
  });
});

describe('LoyaltyService.expireDue', () => {
  it('lapses live points once and writes an audit row', async () => {
    const w = makeWorld({ settings: { pointsExpiryMonths: 1 } });
    await w.service.creditForDeliveredOrder('o1');
    expect(await w.service.expireDue(undefined, new Date('2026-09-20'))).toBe(0); // not yet
    expect(await w.service.expireDue(undefined, new Date('2026-11-01'))).toBe(50);
    expect(w.state.balance).toBe(0);
    expect(w.state.coins.find((c: any) => c.reason === 'LOYALTY_EXPIRY')).toMatchObject({ amount: -50 });
    expect(await w.service.expireDue(undefined, new Date('2027-01-01'))).toBe(0); // exactly once
  });

  it('never takes a balance below zero', async () => {
    const w = makeWorld({ settings: { pointsExpiryMonths: 1 } });
    await w.service.creditForDeliveredOrder('o1');
    w.state.balance = 20; // e.g. a manual clawback already took 30
    expect(await w.service.expireDue(undefined, new Date('2026-11-01'))).toBe(20);
    expect(w.state.balance).toBe(0);
  });
});
