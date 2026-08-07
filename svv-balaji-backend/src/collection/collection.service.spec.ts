import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CollectionService } from './collection.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Collection is where the traceability chain extends Farmer -> Batch.
 * The properties that matter: only approved harvests can be collected, a
 * harvest can't be collected twice, and batch numbers never collide.
 */
describe('CollectionService', () => {
  let prisma: any;
  let service: CollectionService;

  let inspections: Record<string, any>;
  let collections: any[];
  let batches: any[];
  let counters: Record<number, { dateKey: number; lastNumber: number }>;
  let stock: any[];
  let movements: any[];

  const makeTx = () => ({
    batchNumberCounter: {
      findUnique: jest.fn(async ({ where }) => counters[where.dateKey] ?? null),
      create: jest.fn(async ({ data }) => (counters[data.dateKey] = { ...data })),
      update: jest.fn(async ({ where, data }) => {
        counters[where.dateKey].lastNumber += data.lastNumber.increment;
        return counters[where.dateKey];
      }),
    },
    rawMaterialCollection: {
      count: jest.fn(async ({ where }) =>
        collections.filter((c) => c.receiptNumber.startsWith(where.receiptNumber.startsWith))
          .length,
      ),
      create: jest.fn(async ({ data }) => {
        const row = { id: `col-${collections.length + 1}`, ...data };
        collections.push(row);
        return row;
      }),
    },
    rawMaterialBatch: {
      create: jest.fn(async ({ data }) => {
        const row = { id: `batch-${batches.length + 1}`, ...data };
        batches.push(row);
        return row;
      }),
    },
    warehouseStock: {
      create: jest.fn(async ({ data }) => {
        stock.push(data);
        return data;
      }),
    },
    stockMovement: {
      create: jest.fn(async ({ data }) => {
        movements.push(data);
        return data;
      }),
    },
  });

  beforeEach(() => {
    inspections = {};
    collections = [];
    batches = [];
    counters = {};
    stock = [];
    movements = [];

    prisma = {
      harvestInspection: {
        findUnique: jest.fn(async ({ where }) => inspections[where.id] ?? null),
      },
      warehouse: { findUnique: jest.fn(async () => ({ id: 'wh-1', name: 'Main' })) },
      $transaction: jest.fn(async (cb: any) => cb(makeTx())),
    };

    service = new CollectionService(prisma as unknown as PrismaService);
  });

  const approvedInspection = (id = 'insp-1', overrides: Record<string, unknown> = {}) => {
    inspections[id] = {
      id,
      farmerId: 'farmer-1',
      cropName: 'Wheat',
      result: 'APPROVED',
      collection: null,
      agreement: { purchaseRate: 25 },
      farmer: { id: 'farmer-1', status: 'ACTIVE', farmerCode: 'SVV-2026-000001' },
      ...overrides,
    };
    return inspections[id];
  };

  const baseDto = {
    inspectionId: 'insp-1',
    branchId: 'branch-1',
    collectionDate: '2026-08-07',
    grossWeight: 1050,
    netWeight: 1000,
  };

  it('mints a batch number in RM-YYYYMMDD-NNN format', async () => {
    approvedInspection();
    const result: any = await service.create(baseDto, 'user-1');

    expect(result.batch.batchNumber).toBe('RM-20260807-001');
    expect(result.batch.batchNumber).toMatch(/^RM-\d{8}-\d{3}$/);
  });

  it('issues sequential batch numbers within the same day', async () => {
    approvedInspection('insp-1');
    approvedInspection('insp-2');
    approvedInspection('insp-3');

    const a: any = await service.create({ ...baseDto, inspectionId: 'insp-1' }, 'u');
    const b: any = await service.create({ ...baseDto, inspectionId: 'insp-2' }, 'u');
    const c: any = await service.create({ ...baseDto, inspectionId: 'insp-3' }, 'u');

    expect([a.batch.batchNumber, b.batch.batchNumber, c.batch.batchNumber]).toEqual([
      'RM-20260807-001',
      'RM-20260807-002',
      'RM-20260807-003',
    ]);
  });

  it('restarts the sequence on a new day', async () => {
    approvedInspection('insp-1');
    approvedInspection('insp-2');

    const day1: any = await service.create(
      { ...baseDto, inspectionId: 'insp-1', collectionDate: '2026-08-07' },
      'u',
    );
    const day2: any = await service.create(
      { ...baseDto, inspectionId: 'insp-2', collectionDate: '2026-08-08' },
      'u',
    );

    expect(day1.batch.batchNumber).toBe('RM-20260807-001');
    expect(day2.batch.batchNumber).toBe('RM-20260808-001');
  });

  it('refuses to collect a harvest that was not approved', async () => {
    approvedInspection('insp-1', { result: 'REJECTED' });
    await expect(service.create(baseDto, 'u')).rejects.toThrow(BadRequestException);

    approvedInspection('insp-2', { result: 'HOLD_FOR_REINSPECTION' });
    await expect(
      service.create({ ...baseDto, inspectionId: 'insp-2' }, 'u'),
    ).rejects.toThrow(/Only APPROVED/);
  });

  it('refuses to collect the same harvest twice', async () => {
    approvedInspection('insp-1', { collection: { id: 'c1', receiptNumber: 'RC-20260807-001' } });
    await expect(service.create(baseDto, 'u')).rejects.toThrow(/already collected/);
  });

  it('rejects netWeight greater than grossWeight', async () => {
    approvedInspection();
    await expect(
      service.create({ ...baseDto, grossWeight: 100, netWeight: 150 }, 'u'),
    ).rejects.toThrow(/netWeight cannot exceed grossWeight/);
  });

  it('falls back to the agreement rate when no rate is supplied', async () => {
    approvedInspection();
    const result: any = await service.create(baseDto, 'u');
    // 1000 kg * 25 = 25000
    expect(result.purchaseRate).toBe(25);
    expect(result.totalAmount).toBe(25000);
  });

  it('prefers an explicit rate over the agreement rate', async () => {
    approvedInspection();
    const result: any = await service.create({ ...baseDto, purchaseRate: 30 }, 'u');
    expect(result.purchaseRate).toBe(30);
    expect(result.totalAmount).toBe(30000);
  });

  it('fails when neither an explicit rate nor an agreement rate exists', async () => {
    approvedInspection('insp-1', { agreement: null });
    await expect(service.create(baseDto, 'u')).rejects.toThrow(/No purchaseRate supplied/);
  });

  it('books stock in and logs a movement when a warehouse is supplied', async () => {
    approvedInspection();
    const result: any = await service.create({ ...baseDto, warehouseId: 'wh-1' }, 'user-9');

    expect(result.batch.status).toBe('STORED');
    expect(stock).toHaveLength(1);
    expect(stock[0]).toMatchObject({ warehouseId: 'wh-1', quantity: 1000 });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      movementType: 'STOCK_IN',
      toWarehouseId: 'wh-1',
      quantity: 1000,
      performedById: 'user-9',
    });
  });

  it('leaves the batch COLLECTED and books no stock when no warehouse is given', async () => {
    approvedInspection();
    const result: any = await service.create(baseDto, 'u');

    expect(result.batch.status).toBe('COLLECTED');
    expect(stock).toHaveLength(0);
    expect(movements).toHaveLength(0);
  });

  it('links the batch back to the farmer who grew it', async () => {
    approvedInspection();
    const result: any = await service.create(baseDto, 'u');
    expect(result.batch.farmerId).toBe('farmer-1');
    expect(result.farmerId).toBe('farmer-1');
  });

  it('throws when the inspection does not exist', async () => {
    await expect(service.create(baseDto, 'u')).rejects.toThrow(NotFoundException);
  });
});
