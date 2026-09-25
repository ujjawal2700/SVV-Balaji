import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SeedDistributionService } from './seed-distribution.service';
import { SeedStockService } from '../seed-stock/seed-stock.service';

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
        // Like Prisma: undefined means "leave as is".
        update: jest.fn(async ({ where, data }) => (handouts[where.id] = { ...handouts[where.id], ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) })),
        delete: jest.fn(async ({ where }) => { const h = handouts[where.id]; delete handouts[where.id]; return h; }),
      },
    };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    service = new SeedDistributionService(prisma);
  });

  const issue = (quantity: number, seedStockId = 'L1', farmerId = 'f1') =>
    service.create({ farmerId, seedName: 'typed name', quantity, distributionDate: '2026-09-25', seedSource: 'COMPANY_STOCK', seedStockId } as any, 'u1');
  const external = (quantity = 5) =>
    service.create({ farmerId: 'f1', seedName: 'Neem cake', quantity, distributionDate: '2026-09-25', seedSource: 'EXTERNAL' } as any, 'u1');

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

  it('records an EXTERNAL handout with no lot and deducts nothing', async () => {
    await external();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.seedDistribution.create).toHaveBeenCalledWith({ data: expect.objectContaining({ seedName: 'Neem cake', unit: 'KG', seedSource: 'EXTERNAL' }) });
    expect(movements).toHaveLength(0);
  });

  it('refuses a handout with no seed source, company stock without a lot, and external with a lot', async () => {
    await expect(service.create({ farmerId: 'f1', seedName: 'x', quantity: 1, distributionDate: '2026-09-25' } as any, 'u1')).rejects.toThrow(/Choose the seed source/);
    await expect(service.create({ farmerId: 'f1', seedName: 'x', quantity: 1, distributionDate: '2026-09-25', seedSource: 'COMPANY_STOCK' } as any, 'u1')).rejects.toThrow(/must name the seed stock lot/);
    await expect(service.create({ farmerId: 'f1', seedName: 'x', quantity: 1, distributionDate: '2026-09-25', seedSource: 'EXTERNAL', seedStockId: 'L1' } as any, 'u1')).rejects.toThrow(/cannot name a company stock lot/);
    expect(movements).toHaveLength(0);
  });

  it('treats a lot sent without a source as company stock (older clients)', async () => {
    const h = await service.create({ farmerId: 'f1', seedName: 'x', quantity: 10, distributionDate: '2026-09-25', seedStockId: 'L1' } as any, 'u1');
    expect(h.seedSource).toBe('COMPANY_STOCK');
    expect(lots.L1.quantityOnHand.toNumber()).toBe(90);
  });

  it('refuses an empty lot', async () => {
    lots.L2.quantityOnHand = D(0);
    await expect(issue(1, 'L2')).rejects.toThrow(/empty/);
  });

  it('leaves an old handout (no source, no lot) as it was when edited without choosing a source', async () => {
    handouts.old = { id: 'old', farmerId: 'f1', seedSource: null, seedStockId: null, quantity: D(5), seedName: 'Legacy' };
    await service.update('old', { quantity: 6 } as any, 'u1');
    expect(handouts.old.seedSource).toBeNull();
    expect(handouts.old.quantity).toBe(6);
    expect(movements).toHaveLength(0);
  });

  it('re-sources an old handout to company stock by deducting it, or labels it external', async () => {
    handouts.old = { id: 'old', farmerId: 'f1', seedSource: null, seedStockId: null, quantity: D(5), seedName: 'Legacy' };
    await service.update('old', { seedSource: 'COMPANY_STOCK', seedStockId: 'L1' } as any, 'u1');
    expect(lots.L1.quantityOnHand.toNumber()).toBe(95);
    expect(handouts.old).toMatchObject({ seedSource: 'COMPANY_STOCK', seedStockId: 'L1', seedName: 'Wheat' });
    handouts.old2 = { id: 'old2', farmerId: 'f1', seedSource: null, seedStockId: null, quantity: D(2), seedName: 'Legacy' };
    await service.update('old2', { seedSource: 'EXTERNAL' } as any, 'u1');
    expect(handouts.old2.seedSource).toBe('EXTERNAL');
  });

  it('returns the seed to its lot when a company handout is changed to external', async () => {
    const h = await issue(30);
    await service.update(h.id, { seedSource: 'EXTERNAL', seedName: 'Farmer own seed' } as any, 'u1');
    expect(lots.L1.quantityOnHand.toNumber()).toBe(100);
    expect(handouts[h.id]).toMatchObject({ seedSource: 'EXTERNAL', seedStockId: null, seedName: 'Farmer own seed' });
    expect(movements.at(-1)).toMatchObject({ type: 'DISTRIBUTION_REVERSAL' });
  });

  it('refuses to name a lot on an external handout when editing', async () => {
    const h = await external();
    await expect(service.update(h.id, { seedStockId: 'L1' } as any, 'u1')).rejects.toThrow(/cannot name a company stock lot/);
  });

  it('after a lot expires or is withdrawn, a handout on it can still be reduced or re-dated but not increased', async () => {
    const h = await issue(30);
    lots.L1.expiryDate = new Date('2020-01-01');
    await service.update(h.id, { quantity: 20 } as any, 'u1');
    expect(lots.L1.quantityOnHand.toNumber()).toBe(80);
    await service.update(h.id, { distributionDate: '2026-09-20' } as any, 'u1');
    await expect(service.update(h.id, { quantity: 25 } as any, 'u1')).rejects.toThrow(/expired/);
    lots.L1.expiryDate = null;
    lots.L1.isActive = false;
    await service.update(h.id, { quantity: 10 } as any, 'u1');
    expect(lots.L1.quantityOnHand.toNumber()).toBe(90);
    await expect(service.update(h.id, { quantity: 15 } as any, 'u1')).rejects.toThrow(/withdrawn/);
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

  it('edits and deletes an external handout without touching stock', async () => {
    const h = await external();
    await service.update(h.id, { quantity: 8 } as any, 'u1');
    await service.remove(h.id, 'u1');
    expect(movements).toHaveLength(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('SeedStockService - write-off and transfer', () => {
  const D = (n: number) => new Prisma.Decimal(n);
  const admin = { sub: 'u1', role: 'SUPER_ADMIN', branchId: null } as any;
  let lots: Record<string, any>;
  let movements: any[];
  let prisma: any;
  let service: SeedStockService;

  beforeEach(() => {
    lots = { L1: { id: 'L1', branchId: 'b1', seedName: 'Wheat', seedVariety: 'HD', batchNumber: 'B1', unit: 'KG', quantityOnHand: D(50), supplier: 'NSC', expiryDate: null, isActive: true } };
    movements = [];
    let n = 0;
    prisma = {
      branch: { findUnique: jest.fn(async ({ where }) => ({ b1: { id: 'b1', name: 'Nagpur' }, b2: { id: 'b2', name: 'Wardha' } } as any)[where.id] ?? null) },
      seedStock: {
        findUnique: jest.fn(async ({ where }) => lots[where.id] ?? null),
        findUniqueOrThrow: jest.fn(async ({ where }) => lots[where.id]),
        create: jest.fn(async ({ data }) => (lots[`N${++n}`] = { id: `N${n}`, ...data, quantityOnHand: D(0) })),
        update: jest.fn(async ({ where, data }) => {
          const lot = lots[where.id];
          if (data.quantityOnHand?.increment) lot.quantityOnHand = lot.quantityOnHand.plus(data.quantityOnHand.increment);
          else Object.assign(lot, Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)));
          return lot;
        }),
        updateMany: jest.fn(async ({ where, data }) => {
          const lot = lots[where.id];
          if (lot.quantityOnHand.lessThan(where.quantityOnHand.gte)) return { count: 0 };
          lot.quantityOnHand = lot.quantityOnHand.minus(data.quantityOnHand.decrement);
          return { count: 1 };
        }),
      },
      seedStockMovement: { create: jest.fn(async ({ data }) => (movements.push(data), data)) },
    };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    service = new SeedStockService(prisma);
  });

  it('records a WRITE_OFF separately from an adjustment, and refuses a positive write-off', async () => {
    await service.adjust('L1', { kind: 'WRITE_OFF', quantity: -5, reason: 'Rain damage' } as any, admin);
    expect(movements.at(-1)).toMatchObject({ type: 'WRITE_OFF', reason: 'Rain damage' });
    expect(lots.L1.quantityOnHand.toNumber()).toBe(45);
    await expect(service.adjust('L1', { kind: 'WRITE_OFF', quantity: 5, reason: 'x' } as any, admin)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.adjust('L1', { quantity: -100, reason: 'x' } as any, admin)).rejects.toThrow(/Not enough/);
  });

  it('transfers to another branch: out of the source, into a new lot there, both linked in the ledger', async () => {
    const r: any = await service.transfer('L1', { toBranchId: 'b2', quantity: 20, reason: 'Sowing season' } as any, admin);
    expect(lots.L1.quantityOnHand.toNumber()).toBe(30);
    expect(r.to).toMatchObject({ branchId: 'b2', seedName: 'Wheat', batchNumber: 'B1' });
    expect(r.to.quantityOnHand.toNumber()).toBe(20);
    const out = movements.find((m) => m.type === 'TRANSFER_OUT');
    const inn = movements.find((m) => m.type === 'TRANSFER_IN');
    expect(out).toMatchObject({ seedStockId: 'L1', relatedSeedStockId: r.to.id });
    expect(inn).toMatchObject({ seedStockId: r.to.id, relatedSeedStockId: 'L1' });
  });

  it('refuses a transfer larger than the lot, to the same branch, or from a withdrawn lot', async () => {
    await expect(service.transfer('L1', { toBranchId: 'b2', quantity: 60 } as any, admin)).rejects.toThrow(/Not enough/);
    await expect(service.transfer('L1', { toBranchId: 'b1', quantity: 1 } as any, admin)).rejects.toThrow(/different branch/);
    lots.L1.isActive = false;
    await expect(service.transfer('L1', { toBranchId: 'b2', quantity: 1 } as any, admin)).rejects.toThrow(/withdrawn/);
  });

  it('logs withdraw, restore and expiry changes in the ledger with quantity 0', async () => {
    await service.update('L1', { isActive: false } as any, admin);
    await service.update('L1', { isActive: true, expiryDate: '2027-01-31' } as any, admin);
    expect(movements.map((m) => [m.type, m.quantity, m.reason])).toEqual([
      ['LOT_UPDATE', 0, 'Lot withdrawn - can no longer be issued'],
      ['LOT_UPDATE', 0, 'Lot restored - can be issued again'],
      ['LOT_UPDATE', 0, 'Expiry changed from none to 2027-01-31'],
    ]);
  });
});
