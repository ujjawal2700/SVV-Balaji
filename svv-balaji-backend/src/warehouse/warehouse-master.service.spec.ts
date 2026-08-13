import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { WarehouseService } from './warehouse.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The warehouse master screen can now close a warehouse. The guard that matters
 * is the stock check: `findAll` hides inactive warehouses from every picker, so
 * closing one that still holds stock would leave that stock with no screen able
 * to transfer or issue it. Reopening it would be the only way out, and nobody
 * would know that was the fix.
 */
describe('WarehouseService - master maintenance', () => {
  const WAREHOUSE_ID = 'w1';

  let warehouses: Record<string, any>;
  let stockLines: number[];
  let counts: number[];
  let prisma: any;
  let service: WarehouseService;

  const counter = { count: jest.fn(async () => ({ __count: true })) };

  beforeEach(() => {
    warehouses = {
      [WAREHOUSE_ID]: { id: WAREHOUSE_ID, name: 'Central Store', isActive: true, branchId: 'b1' },
    };
    stockLines = [0, 0];
    counts = new Array(7).fill(0);

    prisma = {
      warehouse: {
        findUnique: jest.fn(async ({ where }) => warehouses[where.id] ?? null),
        findMany: jest.fn(async ({ where }) =>
          Object.values(warehouses).filter(
            (w: any) => where.isActive === undefined || w.isActive === where.isActive,
          ),
        ),
        update: jest.fn(async ({ where, data }) => {
          warehouses[where.id] = { ...warehouses[where.id], ...data };
          return warehouses[where.id];
        }),
        delete: jest.fn(async ({ where }) => {
          const removed = warehouses[where.id];
          delete warehouses[where.id];
          return removed;
        }),
      },
      warehouseStock: counter,
      finishedGoodsStock: counter,
      rawMaterialBatch: counter,
      stockMovement: counter,
      order: counter,
      orderAllocation: counter,
      // setActive counts two stock tables; remove counts seven relations.
      $transaction: jest.fn(async (operations: unknown[]) =>
        operations.length === 2 ? stockLines : counts,
      ),
    };

    service = new WarehouseService(prisma as unknown as PrismaService);
  });

  it('hides closed warehouses from the pickers by default', async () => {
    warehouses.w2 = { id: 'w2', name: 'Old Shed', isActive: false };
    const listed = await service.findAll();
    expect(listed).toHaveLength(1);
  });

  it('includes closed warehouses when the master screen asks', async () => {
    warehouses.w2 = { id: 'w2', name: 'Old Shed', isActive: false };
    const listed = await service.findAll(undefined, true);
    expect(listed).toHaveLength(2);
  });

  it('edits a warehouse', async () => {
    const result: any = await service.update(WAREHOUSE_ID, { capacity: 5000 });
    expect(result.capacity).toBe(5000);
  });

  it('404s on a warehouse that does not exist', async () => {
    await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('closes an empty warehouse', async () => {
    const result: any = await service.setActive(WAREHOUSE_ID, false);
    expect(result.isActive).toBe(false);
  });

  it('refuses to close a warehouse still holding raw material', async () => {
    stockLines = [3, 0];
    await expect(service.setActive(WAREHOUSE_ID, false)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.setActive(WAREHOUSE_ID, false)).rejects.toThrow(/3 stock lines/);
    expect(warehouses[WAREHOUSE_ID].isActive).toBe(true);
  });

  it('counts finished goods towards the stock check too', async () => {
    stockLines = [0, 1];
    await expect(service.setActive(WAREHOUSE_ID, false)).rejects.toThrow(/1 stock line/);
  });

  it('explains that the stock would otherwise be stranded', async () => {
    stockLines = [1, 0];
    await expect(service.setActive(WAREHOUSE_ID, false)).rejects.toThrow(/stranded/);
  });

  it('reopens a warehouse without any stock check', async () => {
    warehouses[WAREHOUSE_ID].isActive = false;
    stockLines = [9, 9];
    const result: any = await service.setActive(WAREHOUSE_ID, true);
    expect(result.isActive).toBe(true);
  });

  it('deletes a warehouse nothing references', async () => {
    const result = await service.remove(WAREHOUSE_ID);
    expect(result).toEqual({ id: WAREHOUSE_ID, deleted: true });
  });

  it('refuses to delete a warehouse with movement history', async () => {
    counts[2] = 40; // outgoing movements
    await expect(service.remove(WAREHOUSE_ID)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.remove(WAREHOUSE_ID)).rejects.toThrow(/40 stock movements/);
    expect(warehouses[WAREHOUSE_ID]).toBeDefined();
  });

  it('adds incoming and outgoing movements together in the message', async () => {
    counts[2] = 10;
    counts[3] = 5;
    await expect(service.remove(WAREHOUSE_ID)).rejects.toThrow(/15 stock movements/);
  });
});
