import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CollectionService } from './collection.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Correcting a collection is the most consequential edit in the system, because
 * the net weight is carried in four places at once: the collection row, the
 * batch quantity, the warehouse stock line and the movement ledger. These tests
 * fix two things - that the correction reaches all four, and that it is refused
 * the moment anything downstream has already used the batch.
 *
 * A weighbridge slip read as 500 instead of 50 is the case this exists for.
 */
describe('CollectionService - correction and reversal', () => {
  const COLLECTION_ID = 'c1';
  const BATCH_ID = 'b1';
  const WAREHOUSE_ID = 'w1';
  const USER_ID = 'u1';

  let collections: Record<string, any>;
  let batches: Record<string, any>;
  let stockLines: any[];
  let movements: any[];
  /** [cleaning, consumption, qualityInspections, stockMovements] */
  let touchCounts: number[];
  let laterReceiptCount: number;
  let prisma: any;
  let service: CollectionService;

  const seed = (overrides: { warehoused?: boolean; paymentStatus?: string } = {}) => {
    const warehoused = overrides.warehoused ?? true;

    collections = {
      [COLLECTION_ID]: {
        id: COLLECTION_ID,
        receiptNumber: 'RC-20260813-001',
        grossWeight: 520,
        netWeight: 500,
        purchaseRate: 30,
        totalAmount: 15000,
        unit: 'KG',
        paymentStatus: overrides.paymentStatus ?? 'PENDING',
      },
    };
    batches = {
      [BATCH_ID]: {
        id: BATCH_ID,
        batchNumber: 'RM-20260813-001',
        quantity: 500,
        unit: 'KG',
        warehouseId: warehoused ? WAREHOUSE_ID : null,
      },
    };
    stockLines = warehoused
      ? [{ id: 's1', warehouseId: WAREHOUSE_ID, batchId: BATCH_ID, quantity: 500, unit: 'KG' }]
      : [];
    movements = [];
    touchCounts = [0, 0, 0, warehoused ? 1 : 0]; // the initial receipt only
    laterReceiptCount = 0;
  };

  beforeEach(() => {
    seed();

    const tx = {
      rawMaterialCollection: {
        update: jest.fn(async ({ where, data }) => {
          collections[where.id] = { ...collections[where.id], ...data };
          return collections[where.id];
        }),
        findUnique: jest.fn(async ({ where }) => ({
          ...collections[where.id],
          batch: batches[BATCH_ID] ?? null,
        })),
        delete: jest.fn(async ({ where }) => {
          const removed = collections[where.id];
          delete collections[where.id];
          return removed;
        }),
      },
      rawMaterialBatch: {
        update: jest.fn(async ({ where, data }) => {
          batches[where.id] = { ...batches[where.id], ...data };
          return batches[where.id];
        }),
        delete: jest.fn(async ({ where }) => {
          const removed = batches[where.id];
          delete batches[where.id];
          return removed;
        }),
      },
      warehouseStock: {
        findFirst: jest.fn(async ({ where }) =>
          stockLines.find(
            (s) => s.warehouseId === where.warehouseId && s.batchId === where.batchId,
          ) ?? null,
        ),
        update: jest.fn(async ({ where, data }) => {
          const line = stockLines.find((s) => s.id === where.id);
          Object.assign(line, data);
          return line;
        }),
        deleteMany: jest.fn(async () => {
          stockLines = [];
          return { count: 1 };
        }),
      },
      stockMovement: {
        create: jest.fn(async ({ data }) => {
          movements.push(data);
          return data;
        }),
        deleteMany: jest.fn(async () => {
          movements = [];
          return { count: 1 };
        }),
      },
    };

    prisma = {
      rawMaterialCollection: {
        findUnique: jest.fn(async ({ where }) =>
          collections[where.id]
            ? { ...collections[where.id], batch: batches[BATCH_ID] ?? null }
            : null,
        ),
        count: jest.fn(async () => laterReceiptCount),
      },
      cleaningGradingRecord: { count: jest.fn() },
      productionConsumption: { count: jest.fn() },
      qualityInspection: { count: jest.fn() },
      stockMovement: { count: jest.fn() },
      // The service uses $transaction two ways: an array of counts, and a
      // callback for the write. Both go through here.
      $transaction: jest.fn(async (arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (client: unknown) => Promise<unknown>)(tx)
          : touchCounts,
      ),
    };

    service = new CollectionService(prisma as unknown as PrismaService);
  });

  // --- correcting ----------------------------------------------------------

  it('recalculates the amount payable from the corrected weight', async () => {
    await service.update(COLLECTION_ID, { netWeight: 50 }, USER_ID);
    expect(collections[COLLECTION_ID].netWeight).toBe(50);
    expect(collections[COLLECTION_ID].totalAmount).toBe(1500);
  });

  it('carries the corrected weight onto the batch', async () => {
    await service.update(COLLECTION_ID, { netWeight: 50, grossWeight: 52 }, USER_ID);
    expect(batches[BATCH_ID].quantity).toBe(50);
  });

  it('carries it onto the warehouse stock line too', async () => {
    await service.update(COLLECTION_ID, { netWeight: 50, grossWeight: 52 }, USER_ID);
    expect(stockLines[0].quantity).toBe(50);
  });

  it('writes an ADJUSTMENT to the ledger, with the reason', async () => {
    await service.update(
      COLLECTION_ID,
      { netWeight: 50, grossWeight: 52, correctionReason: 'Weighbridge slip misread' },
      USER_ID,
    );

    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      batchId: BATCH_ID,
      movementType: 'ADJUSTMENT',
      quantity: 450, // the absolute difference, not the new figure
      performedById: USER_ID,
    });
    expect(movements[0].reason).toContain('500 -> 50');
    expect(movements[0].reason).toContain('Weighbridge slip misread');
  });

  it('records a reduction as leaving the warehouse and an increase as entering it', async () => {
    await service.update(COLLECTION_ID, { netWeight: 50, grossWeight: 52 }, USER_ID);
    expect(movements[0].fromWarehouseId).toBe(WAREHOUSE_ID);
    expect(movements[0].toWarehouseId).toBeUndefined();

    seed();
    await service.update(COLLECTION_ID, { netWeight: 600, grossWeight: 620 }, USER_ID);
    expect(movements[0].toWarehouseId).toBe(WAREHOUSE_ID);
    expect(movements[0].fromWarehouseId).toBeUndefined();
  });

  it('writes no ledger entry when only the rate changes', async () => {
    await service.update(COLLECTION_ID, { purchaseRate: 32 }, USER_ID);
    expect(movements).toHaveLength(0);
    expect(collections[COLLECTION_ID].totalAmount).toBe(16000);
  });

  it('does not invent a stock line for a batch that was never warehoused', async () => {
    seed({ warehoused: false });
    await service.update(COLLECTION_ID, { netWeight: 50, grossWeight: 52 }, USER_ID);

    expect(batches[BATCH_ID].quantity).toBe(50);
    expect(stockLines).toHaveLength(0);
    expect(movements).toHaveLength(0);
  });

  it('still refuses a net weight above the gross', async () => {
    await expect(
      service.update(COLLECTION_ID, { netWeight: 600 }, USER_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('checks the net weight against the stored gross when only one is supplied', async () => {
    // gross stays 520, so 530 has to fail even though it was not sent.
    await expect(
      service.update(COLLECTION_ID, { netWeight: 530 }, USER_ID),
    ).rejects.toThrow(/netWeight cannot exceed grossWeight/);
  });

  // --- the untouched guard -------------------------------------------------

  it('refuses a correction once the batch has been cleaned', async () => {
    touchCounts = [1, 0, 0, 1];
    await expect(service.update(COLLECTION_ID, { netWeight: 50 }, USER_ID)).rejects.toThrow(
      /1 cleaning\/grading record/,
    );
  });

  it('refuses once production has consumed the batch', async () => {
    touchCounts = [0, 2, 0, 1];
    await expect(service.update(COLLECTION_ID, { netWeight: 50 }, USER_ID)).rejects.toThrow(
      /2 production consumptions/,
    );
  });

  it('refuses once the batch has moved since receipt', async () => {
    touchCounts = [0, 0, 0, 3]; // receipt plus two more
    await expect(service.update(COLLECTION_ID, { netWeight: 50 }, USER_ID)).rejects.toThrow(
      /2 stock movements since receipt/,
    );
  });

  it('does not count the initial receipt as a movement', async () => {
    touchCounts = [0, 0, 0, 1];
    await expect(service.update(COLLECTION_ID, { netWeight: 50 }, USER_ID)).resolves.toBeDefined();
  });

  it('names the batch in the refusal so it can be looked up', async () => {
    touchCounts = [0, 0, 1, 1];
    await expect(service.update(COLLECTION_ID, { netWeight: 50 }, USER_ID)).rejects.toThrow(
      /RM-20260813-001/,
    );
  });

  // --- reversing -----------------------------------------------------------

  it('deletes the batch, its stock and its movements with the collection', async () => {
    const result = await service.remove(COLLECTION_ID);

    expect(result).toEqual({
      id: COLLECTION_ID,
      deleted: true,
      batchDeleted: 'RM-20260813-001',
    });
    expect(collections[COLLECTION_ID]).toBeUndefined();
    expect(batches[BATCH_ID]).toBeUndefined();
    expect(stockLines).toHaveLength(0);
  });

  it('refuses to delete once the farmer has been paid', async () => {
    seed({ paymentStatus: 'PAID' });
    await expect(service.remove(COLLECTION_ID)).rejects.toThrow(/has been paid/);
    expect(collections[COLLECTION_ID]).toBeDefined();
  });

  it('refuses a partial payment too, not just a full one', async () => {
    seed({ paymentStatus: 'PARTIAL' });
    await expect(service.remove(COLLECTION_ID)).rejects.toThrow(/PARTIAL/);
  });

  it('refuses to delete a used batch', async () => {
    touchCounts = [0, 1, 0, 1];
    await expect(service.remove(COLLECTION_ID)).rejects.toThrow(/1 production consumption/);
  });

  /**
   * The receipt counter counts existing rows rather than incrementing a
   * sequence, so removing a receipt makes the next one reuse its number. Until
   * that is fixed the delete has to refuse, or two farmers end up sharing a
   * receipt number with no way to tell their payments apart.
   */
  it('refuses when a later receipt exists for the same day', async () => {
    laterReceiptCount = 2;
    await expect(service.remove(COLLECTION_ID)).rejects.toThrow(/would make the next one reuse it/);
    expect(collections[COLLECTION_ID]).toBeDefined();
  });

  it('404s on a collection that does not exist', async () => {
    await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update('missing', {}, USER_ID)).rejects.toBeInstanceOf(NotFoundException);
  });
});
