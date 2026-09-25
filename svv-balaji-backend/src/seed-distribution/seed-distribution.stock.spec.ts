import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SeedDistributionService } from './seed-distribution.service';

/**
 * FRD 10.2 - seed handouts deduct from seed stock. These pin the ledger rules:
 * every change to a lot writes a movement, stock never goes negative, an edit
 * moves only the difference, a delete gives the seed back, and a handout with
 * no lot behaves exactly as it always did.
 */
describe('SeedDistributionService - seed stock', () => {
  const D = (n: number | string) => new Prisma.Decimal(n);
  let lots: Record<string, any>;
  let handouts: Record<string, any>;
  let movements: any[];
  let prisma: any;
  let service: SeedDistributionService;

  const farmers: Record<string, any> = {
    f1: { id: 'f1', fullName: 'Ramesh', branchId: 'b1' },
    f2: { id: 'f2', fullName: 'Suresh', branchId: 'b2' },
  };

  beforeEach(() => {
    lots = {
      L1: { id: 'L1', branchId: 'b1', branch: { name: 'Nagpur' }, seedName: 'Wheat', seedVariety: 'HD-2967', batchNumber: 'LOT-1', unit: 'KG', quantityOnHand: D(100), isActive: true, expiryDate: null },
      L2: { id: 'L2', branchId: 'b1', branch: { name: 'Nagpur' }, seedName: 'Gram', seedVariety: null, batchNumber: 'LOT-2', unit: 'KG', quantityOnHand: D(50), isActive: true, expiryDate: null },
      EXP: { id: 'EXP', branchId: 'b1', branch: { name: 'Nagpur' }, seedName: 'Old', seedVariety: null, batchNumber: null, unit: 'KG', quantityOnHand: D(10), isActive: true, expiryDate: new Date('2020-01-01') },
    };
    handouts = {};
    movements = [];
    let n = 0;

    prisma = {
      seedStock: {
        findUnique: jest.fn(async ({ where }) => lots[where.id] ?? null),
        findUniqueOrThrow: jest.fn(async ({ where }) => lots[where.id]),
        updateMany: jest.fn(async ({ where, data }) => {
          const lot = lots[where.id];
          if (!lot || lot.quantityOnHand.lessThan(where.quantityOnHand.gte)) return { count: 0 };
          lot.quantityOnHand = lot.quantityOnHand.minus(data.quantityOnHand.decrement);
          return { count: 1 };
        }),
        update: jest.fn(async ({ where, data }) => {
          lots[where.id].quantityOnHand = lots[where.id].quantityOnHand.plus(data.quantityOnHand.increment);
          return lots[where.id];
        }),
      },
      seedStockMovement: { create: jest.fn(async ({ data }) => (movements.push(data), data)) },
      farmer: { findUnique: jest.fn(async ({ where }) => farmers[where.id] ?? null) },
      seedDistribution: {
        create: jest.fn(async ({ data }) => (handouts[`h${++n}`] = { id: `h${n}`, ...data, quantity: D(data.quantity) })),
        findUnique: jest.fn(async ({ where }) => handouts[where.id] ?? null),
        update: jest.fn(async ({ where, data }) => (handouts[where.id] = { ...handouts[where.id], ...data })),
        delete: jest.fn(async ({ where }) => { const h = handouts[where.id]; delete handouts[where.id]; return h; }),
      },
    };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    service = new SeedDistributionService(prisma);
  });

  const issue = (quantity: number, seedStockId = 'L1', farmerId = 'f1') =>
    service.create({ farmerId, seedName: 'typed name', quantity, distributionDate: '2026-09-25', seedStockId } as any, 'u1');

  it('deducts the lot, copies its particulars and writes a DISTRIBUTION movement', async () => {
    const h = await issue(30);
    expect(lots.L1.quantityOnHand.toNumber()).toBe(70);
    expect(h).toMatchObject({ seedStockId: 'L1', seedName: 'Wheat', seedVariety: 'HD-2967', batchNumber: 'LOT-1', unit: 'KG' });
    expect(movements).toEqual([expect.objectContaining({ type: 'DISTRIBUTION', seedDistributionId: h.id })]);
    expect(movements[0].quantity.toNumber()).toBe(-30);
    expect(movements[0].balanceAfter.toNumber()).toBe(70);
  });

  it('refuses to overdraw and leaves the lot untouched', async () => {
    await expect(issue(101)).rejects.toThrow(/100 KG left, 101 KG needed/);
    expect(lots.L1.quantityOnHand.toNumber()).toBe(100);
    expect(movements).toHaveLength(0);
  });

  it('refuses a lot at another branch, an expired lot and a withdrawn lot', async () => {
    await expect(issue(1, 'L1', 'f2')).rejects.toBeInstanceOf(BadRequestException);
    await expect(issue(1, 'EXP')).rejects.toThrow(/expired/);
    lots.L2.isActive = false;
    await expect(issue(1, 'L2')).rejects.toThrow(/withdrawn/);
  });

  it('records a handout with no lot exactly as before - nothing deducted', async () => {
    await service.create({ farmerId: 'f1', seedName: 'Neem cake', quantity: 5, distributionDate: '2026-09-25' } as any, 'u1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.seedDistribution.create).toHaveBeenCalledWith({ data: expect.objectContaining({ seedName: 'Neem cake', unit: 'KG' }) });
    expect(movements).toHaveLength(0);
  });

  it('moves only the difference when the quantity is edited', async () => {
    const h = await issue(30);
    await service.update(h.id, { quantity: 45 } as any, 'u1');
    expect(lots.L1.quantityOnHand.toNumber()).toBe(55);
    await service.update(h.id, { quantity: 20 } as any, 'u1');
    expect(lots.L1.quantityOnHand.toNumber()).toBe(80);
    expect(movements.map((m) => [m.type, m.quantity.toNumber()])).toEqual([
      ['DISTRIBUTION', -30], ['DISTRIBUTION', -15], ['DISTRIBUTION_REVERSAL', 25],
    ]);
  });

  it('refuses an increase the lot cannot cover, keeping the handout as it was', async () => {
    const h = await issue(90);
    await expect(service.update(h.id, { quantity: 120 } as any, 'u1')).rejects.toBeInstanceOf(BadRequestException);
    expect(lots.L1.quantityOnHand.toNumber()).toBe(10);
    expect(handouts[h.id].quantity.toNumber()).toBe(90);
  });

  it('returns stock to the old lot and deducts the new one when the lot changes', async () => {
    const h = await issue(30);
    await service.update(h.id, { seedStockId: 'L2' } as any, 'u1');
    expect(lots.L1.quantityOnHand.toNumber()).toBe(100);
    expect(lots.L2.quantityOnHand.toNumber()).toBe(20);
    expect(handouts[h.id]).toMatchObject({ seedStockId: 'L2', seedName: 'Gram' });
  });

  it('puts the seed back when a stock-issued handout is deleted', async () => {
    const h = await issue(30);
    await service.remove(h.id, 'u1');
    expect(lots.L1.quantityOnHand.toNumber()).toBe(100);
    expect(movements.at(-1)).toMatchObject({ type: 'DISTRIBUTION_REVERSAL', reason: 'Handout deleted' });
    expect(handouts[h.id]).toBeUndefined();
  });

  it('edits and deletes a stock-less handout without touching stock', async () => {
    const h = await service.create({ farmerId: 'f1', seedName: 'Neem cake', quantity: 5, distributionDate: '2026-09-25' } as any, 'u1');
    await service.update(h.id, { quantity: 8 } as any, 'u1');
    await service.remove(h.id, 'u1');
    expect(movements).toHaveLength(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
