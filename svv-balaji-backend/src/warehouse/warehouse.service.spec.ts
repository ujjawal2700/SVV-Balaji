import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WarehouseService } from './warehouse.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The invariant under test: WarehouseStock.quantity is never mutated without a
 * matching StockMovement row. If those two drift apart, inventory
 * discrepancies become impossible to investigate.
 */
describe('WarehouseService', () => {
  let prisma: any;
  let service: WarehouseService;
  let stock: Record<string, any>;
  let movements: any[];

  const key = (warehouseId: string, batchId: string) => `${warehouseId}|${batchId}`;

  const makeTx = () => ({
    warehouseStock: {
      upsert: jest.fn(async ({ where, update, create }) => {
        const k = key(where.warehouseId_batchId.warehouseId, where.warehouseId_batchId.batchId);
        if (stock[k]) {
          if (update.quantity?.increment) stock[k].quantity += update.quantity.increment;
          if (update.storageLocation) stock[k].storageLocation = update.storageLocation;
        } else {
          stock[k] = { reservedQuantity: 0, ...create };
        }
        return stock[k];
      }),
      update: jest.fn(async ({ where, data }) => {
        const k = key(where.warehouseId_batchId.warehouseId, where.warehouseId_batchId.batchId);
        if (data.quantity?.decrement !== undefined) stock[k].quantity -= data.quantity.decrement;
        else if (data.quantity?.increment !== undefined) stock[k].quantity += data.quantity.increment;
        else if (typeof data.quantity === 'number') stock[k].quantity = data.quantity;
        return stock[k];
      }),
    },
    stockMovement: {
      create: jest.fn(async ({ data }) => {
        movements.push(data);
        return data;
      }),
    },
    rawMaterialBatch: { update: jest.fn(async ({ data }) => data) },
  });

  beforeEach(() => {
    stock = {};
    movements = [];

    prisma = {
      warehouse: { findUnique: jest.fn(async ({ where }) => ({ id: where.id, name: 'W' })) },
      rawMaterialBatch: { findUnique: jest.fn(async ({ where }) => ({ id: where.id })) },
      warehouseStock: {
        findUnique: jest.fn(async ({ where }) => {
          const k = key(where.warehouseId_batchId.warehouseId, where.warehouseId_batchId.batchId);
          return stock[k] ?? null;
        }),
      },
      $transaction: jest.fn(async (cb: any) => cb(makeTx())),
    };

    service = new WarehouseService(prisma as unknown as PrismaService);
  });

  const seed = (warehouseId: string, batchId: string, quantity: number, reserved = 0) => {
    stock[key(warehouseId, batchId)] = {
      warehouseId,
      batchId,
      quantity,
      reservedQuantity: reserved,
    };
  };

  describe('stockIn', () => {
    it('increases the balance and logs a movement', async () => {
      await service.stockIn('wh-1', { batchId: 'b-1', quantity: 1000 }, 'u-1');

      expect(stock[key('wh-1', 'b-1')].quantity).toBe(1000);
      expect(movements).toHaveLength(1);
      expect(movements[0]).toMatchObject({
        movementType: 'STOCK_IN',
        toWarehouseId: 'wh-1',
        quantity: 1000,
        performedById: 'u-1',
      });
    });

    it('accumulates onto existing stock', async () => {
      seed('wh-1', 'b-1', 500);
      await service.stockIn('wh-1', { batchId: 'b-1', quantity: 250 }, 'u-1');
      expect(stock[key('wh-1', 'b-1')].quantity).toBe(750);
    });
  });

  describe('stockOut', () => {
    it('decreases the balance and logs a movement', async () => {
      seed('wh-1', 'b-1', 1000);
      await service.stockOut('wh-1', { batchId: 'b-1', quantity: 300 }, 'u-1');

      expect(stock[key('wh-1', 'b-1')].quantity).toBe(700);
      expect(movements[0]).toMatchObject({ movementType: 'STOCK_OUT', fromWarehouseId: 'wh-1' });
    });

    it('refuses to over-draw and leaves the balance untouched', async () => {
      seed('wh-1', 'b-1', 100);
      await expect(
        service.stockOut('wh-1', { batchId: 'b-1', quantity: 500 }, 'u-1'),
      ).rejects.toThrow(BadRequestException);

      expect(stock[key('wh-1', 'b-1')].quantity).toBe(100);
      expect(movements).toHaveLength(0);
    });

    it('treats reserved quantity as unavailable', async () => {
      seed('wh-1', 'b-1', 100, 80); // only 20 free
      await expect(
        service.stockOut('wh-1', { batchId: 'b-1', quantity: 50 }, 'u-1'),
      ).rejects.toThrow(/Insufficient unreserved stock/);
    });

    it('throws when the batch has no stock in that warehouse', async () => {
      await expect(
        service.stockOut('wh-1', { batchId: 'nope', quantity: 1 }, 'u-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('transfer', () => {
    it('moves quantity between warehouses and conserves the total', async () => {
      seed('wh-1', 'b-1', 1000);
      await service.transfer(
        { batchId: 'b-1', fromWarehouseId: 'wh-1', toWarehouseId: 'wh-2', quantity: 400 },
        'u-1',
      );

      expect(stock[key('wh-1', 'b-1')].quantity).toBe(600);
      expect(stock[key('wh-2', 'b-1')].quantity).toBe(400);
      expect(
        stock[key('wh-1', 'b-1')].quantity + stock[key('wh-2', 'b-1')].quantity,
      ).toBe(1000);
    });

    it('rejects a transfer to the same warehouse', async () => {
      await expect(
        service.transfer(
          { batchId: 'b-1', fromWarehouseId: 'wh-1', toWarehouseId: 'wh-1', quantity: 10 },
          'u-1',
        ),
      ).rejects.toThrow(/must differ/);
    });

    it('rejects a transfer larger than available stock', async () => {
      seed('wh-1', 'b-1', 50);
      await expect(
        service.transfer(
          { batchId: 'b-1', fromWarehouseId: 'wh-1', toWarehouseId: 'wh-2', quantity: 500 },
          'u-1',
        ),
      ).rejects.toThrow(/Insufficient/);
    });
  });

  describe('adjust', () => {
    it('sets an absolute quantity and logs the signed delta', async () => {
      seed('wh-1', 'b-1', 500);
      await service.adjust('wh-1', { batchId: 'b-1', newQuantity: 480, reason: 'spillage' }, 'u-1');

      expect(stock[key('wh-1', 'b-1')].quantity).toBe(480);
      expect(movements[0]).toMatchObject({
        movementType: 'ADJUSTMENT',
        quantity: 20,
        fromWarehouseId: 'wh-1', // negative delta = stock leaving
        toWarehouseId: null,
        reason: 'spillage',
      });
    });

    it('logs an upward adjustment as incoming', async () => {
      seed('wh-1', 'b-1', 500);
      await service.adjust('wh-1', { batchId: 'b-1', newQuantity: 520, reason: 'recount' }, 'u-1');

      expect(movements[0]).toMatchObject({
        movementType: 'ADJUSTMENT',
        quantity: 20,
        toWarehouseId: 'wh-1',
        fromWarehouseId: null,
      });
    });

    it('rejects a no-op adjustment', async () => {
      seed('wh-1', 'b-1', 500);
      await expect(
        service.adjust('wh-1', { batchId: 'b-1', newQuantity: 500, reason: 'x' }, 'u-1'),
      ).rejects.toThrow(/nothing to adjust/);
    });
  });
});
