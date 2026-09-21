import { BadRequestException } from '@nestjs/common';
import { FulfillmentService } from './fulfillment.service';

/** The two pieces of fulfilment that guard against fraud and mistakes: batch scanning and the doorstep OTP. */
function make(order: any, allocations: any[] = []) {
  const state = { order: { ...order }, allocations: allocations.map((a) => ({ ...a })), events: [] as string[], advanced: [] as string[] };
  const prisma: any = {
    order: {
      findUnique: async () => ({ ...state.order, shipment: null }),
      update: async ({ data }: any) => {
        if (data.deliveryOtpAttempts?.increment) state.order.deliveryOtpAttempts += data.deliveryOtpAttempts.increment;
        else Object.assign(state.order, data);
        return { ...state.order };
      },
    },
    orderAllocation: {
      findMany: async () => state.allocations.map((a) => ({ ...a })),
      updateMany: async ({ where, data }: any) => {
        for (const a of state.allocations) if (where.id.in.includes(a.id) && !a.scannedAt) Object.assign(a, data);
        return { count: 1 };
      },
      count: async () => state.allocations.filter((a) => !a.scannedAt).length,
    },
  };
  const sales: any = {
    record: async (_id: string, type: string) => void state.events.push(type),
    advance: async (_id: string, to: string) => void state.advanced.push(to),
  };
  return { svc: new FulfillmentService(prisma, sales, {} as any), state };
}

const alloc = (id: string, batch: string) => ({
  id,
  quantity: 1,
  fgBatch: { fgBatchNumber: batch, expiryDate: null },
  orderItem: { nameSnapshot: 'Atta', skuSnapshot: 'ATTA', product: { name: 'Atta', sku: 'ATTA' } },
  scannedAt: null,
});

describe('FulfillmentService.scan', () => {
  const base = { id: 'o1', status: 'ALLOCATED' };

  it('accepts only a batch FIFO allocated to the order, and reads the number out of a QR URL', async () => {
    const { svc, state } = make(base, [alloc('a1', 'FG-20260901-001')]);
    const res = await svc.scan('o1', 'https://desitokri.com/trace?batch=fg-20260901-001', 'u1');
    expect(res.packed).toBe(true);
    expect(state.advanced).toEqual(['PACKED']);
  });

  it('refuses a different batch and names the expected one', async () => {
    const { svc, state } = make(base, [alloc('a1', 'FG-20260901-001')]);
    await expect(svc.scan('o1', 'FG-20260905-002', 'u1')).rejects.toMatchObject({
      response: { code: 'WRONG_BATCH', expected: ['FG-20260901-001'] },
    });
    expect(state.advanced).toEqual([]);
  });

  it('marks PACKED only after EVERY allocation is scanned', async () => {
    const { svc, state } = make(base, [alloc('a1', 'FG-20260901-001'), alloc('a2', 'FG-20260902-001')]);
    expect((await svc.scan('o1', 'FG-20260901-001', 'u1')).packed).toBe(false);
    expect(state.advanced).toEqual([]);
    expect((await svc.scan('o1', 'FG-20260902-001', 'u1')).packed).toBe(true);
  });

  it('rejects a non-batch code and orders that are not allocated', async () => {
    await expect(make(base, [alloc('a1', 'FG-20260901-001')]).svc.scan('o1', 'hello world', 'u')).rejects.toThrow(BadRequestException);
    await expect(make({ ...base, status: 'PACKED' }).svc.scan('o1', 'FG-20260901-001', 'u')).rejects.toThrow(/allocated orders/);
  });
});

describe('FulfillmentService.verifyOtp', () => {
  const local = { id: 'o1', status: 'DISPATCHED', fulfillmentMethod: 'LOCAL', deliveryOtp: '4821', deliveryOtpAttempts: 0, deliveryOtpVerifiedAt: null };

  it('closes the order as DELIVERED on the right OTP', async () => {
    const { svc, state } = make(local);
    expect(await svc.verifyOtp('o1', '4821', 'u1')).toEqual({ delivered: true });
    expect(state.advanced).toEqual(['DELIVERED']);
    expect(state.order.deliveryOtpVerifiedAt).toBeInstanceOf(Date);
  });

  it('counts wrong attempts, then locks - a 4-digit code must not be brute-forceable', async () => {
    const { svc, state } = make(local);
    for (let left = 4; left >= 0; left--) {
      await expect(svc.verifyOtp('o1', '0000', 'u1')).rejects.toMatchObject({ response: { code: 'OTP_INCORRECT', attemptsLeft: left } });
    }
    await expect(svc.verifyOtp('o1', '4821', 'u1')).rejects.toMatchObject({ status: 423 }); // even the right one is refused now
    expect(state.advanced).toEqual([]);
  });

  it('is only for local orders that are out for delivery', async () => {
    await expect(make({ ...local, fulfillmentMethod: 'SHIPROCKET' }).svc.verifyOtp('o1', '4821', 'u')).rejects.toThrow(/local-delivery/);
    await expect(make({ ...local, status: 'PACKED' }).svc.verifyOtp('o1', '4821', 'u')).rejects.toThrow(/out for delivery/);
  });
});
