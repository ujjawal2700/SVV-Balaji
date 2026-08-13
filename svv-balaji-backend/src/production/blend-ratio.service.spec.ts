import { BadRequestException } from '@nestjs/common';
import { ProductionType } from '@prisma/client';
import { ProductionService } from './production.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/sequence.service';

/**
 * The blend ratio gate, added when the client confirmed multigrain scope on
 * 14 Aug 2026 (A-05).
 *
 * Approving a recipe fixes a ratio. Before this, nothing made that ratio true
 * at production time: an approved 60/40 wheat-bajra blend could be produced
 * from 90% wheat, packed, labelled and sold as the approved blend, and the
 * system would have agreed. These tests exist because that is a mislabelled
 * food problem rather than a data quality one.
 */
describe('ProductionService - blend ratio enforcement', () => {
  const RECIPE_ID = 'r1';
  const WAREHOUSE_ID = 'w1';
  const USER_ID = 'u1';

  let recipe: any;
  let batches: Record<string, any>;
  let prisma: any;
  let service: ProductionService;

  const batch = (id: string, cropName: string, quantity = 100000) => ({
    id,
    batchNumber: `RM-20260814-${id}`,
    cropName,
    status: 'STORED',
    stock: [{ warehouseId: WAREHOUSE_ID, quantity, reservedQuantity: 0 }],
  });

  /** A run that consumes the given { batchId: quantity } pairs. */
  const run = (consumed: Record<string, number>) =>
    service.createProductionBatch(
      {
        recipeId: RECIPE_ID,
        warehouseId: WAREHOUSE_ID,
        branchId: 'b1',
        productionDate: '2026-08-14',
        plannedQuantity: 1000,
        consumptions: Object.entries(consumed).map(([rawMaterialBatchId, quantityUsed]) => ({
          rawMaterialBatchId,
          quantityUsed,
        })),
      } as any,
      USER_ID,
    );

  beforeEach(() => {
    recipe = {
      id: RECIPE_ID,
      recipeCode: 'MG-ATTA',
      version: 2,
      status: 'APPROVED',
      productId: 'p1',
      unit: 'KG',
      productionType: ProductionType.MULTI_GRAIN,
      ingredients: [
        { cropName: 'Wheat', percentage: 60 },
        { cropName: 'Bajra', percentage: 40 },
      ],
    };

    batches = {
      w: batch('w', 'Wheat'),
      b: batch('b', 'Bajra'),
      w2: batch('w2', 'Wheat'),
      j: batch('j', 'Jowar'),
    };

    const tx = {
      productionBatch: {
        create: jest.fn(async ({ data }) => ({ id: 'pb1', ...data })),
        findUnique: jest.fn(async () => ({ id: 'pb1', productionBatchNumber: 'PB-20260814-001' })),
      },
      productionConsumption: { create: jest.fn(async () => ({})) },
      warehouseStock: { update: jest.fn(async () => ({})) },
      stockMovement: { create: jest.fn(async () => ({})) },
      rawMaterialBatch: { update: jest.fn(async () => ({})) },
    };

    prisma = {
      recipe: { findUnique: jest.fn(async () => recipe) },
      rawMaterialBatch: {
        findMany: jest.fn(async ({ where }) =>
          where.id.in.map((id: string) => batches[id]).filter(Boolean),
        ),
      },
      $transaction: jest.fn(async (fn: (client: unknown) => Promise<unknown>) => fn(tx)),
    };

    const sequence = { next: jest.fn(async () => 'PB-20260814-001') };

    service = new ProductionService(
      prisma as unknown as PrismaService,
      sequence as unknown as SequenceService,
    );
  });

  // --- multigrain now runs at all ------------------------------------------

  it('accepts a multigrain run that matches the recipe exactly', async () => {
    await expect(run({ w: 600, b: 400 })).resolves.toBeDefined();
  });

  it('no longer refuses multigrain outright', async () => {
    // The old MULTIGRAIN_ENABLED gate refused every MULTI_GRAIN recipe whatever
    // the mix. Explicitly pinned so nobody reintroduces it as a flag.
    await expect(run({ w: 600, b: 400 })).resolves.toBeDefined();
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('holds the ratio, not the absolute quantity - a bigger run still passes', async () => {
    await expect(run({ w: 1200, b: 800 })).resolves.toBeDefined();
  });

  it('accepts several batches of the same grain adding up to its share', async () => {
    await expect(run({ w: 300, w2: 300, b: 400 })).resolves.toBeDefined();
  });

  // --- the gate ------------------------------------------------------------

  it('refuses a mix that drifts beyond tolerance', async () => {
    await expect(run({ w: 900, b: 100 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('names the grain, both percentages and the quantity needed', async () => {
    await expect(run({ w: 900, b: 100 })).rejects.toThrow(/Wheat is 90.00% of the mix/);
    await expect(run({ w: 900, b: 100 })).rejects.toThrow(/recipe says 60.00%/);
    await expect(run({ w: 900, b: 100 })).rejects.toThrow(/needs 600.00 of the 1000.00 total/);
  });

  it('allows drift inside the tolerance', async () => {
    // 60.4 / 39.6 - within 0.5pp on both grains.
    await expect(run({ w: 604, b: 396 })).resolves.toBeDefined();
  });

  it('refuses drift just outside the tolerance', async () => {
    // 60.6 / 39.4 - 0.6pp out on both.
    await expect(run({ w: 606, b: 394 })).rejects.toThrow(/does not match recipe/);
  });

  it('refuses a blend missing one of its grains entirely', async () => {
    await expect(run({ w: 1000 })).rejects.toThrow(/calls for Bajra/);
    await expect(run({ w: 1000 })).rejects.toThrow(/has to be in the mix/);
  });

  it('lists every missing grain, not just the first', async () => {
    recipe.ingredients = [
      { cropName: 'Wheat', percentage: 50 },
      { cropName: 'Bajra', percentage: 30 },
      { cropName: 'Jowar', percentage: 20 },
    ];
    await expect(run({ w: 1000 })).rejects.toThrow(/Bajra and Jowar/);
  });

  it('still refuses a grain that is not in the recipe at all', async () => {
    await expect(run({ w: 600, b: 400, j: 100 })).rejects.toThrow(/not an ingredient/);
  });

  // --- the details that would bite in the field -----------------------------

  it('matches crop names case- and whitespace-insensitively', async () => {
    // The recipe says "Wheat"; the collection clerk typed "wheat ".
    batches.w.cropName = 'wheat ';
    batches.b.cropName = ' BAJRA';
    await expect(run({ w: 600, b: 400 })).resolves.toBeDefined();
  });

  it('leaves single-grain runs alone', async () => {
    recipe.productionType = ProductionType.SINGLE_GRAIN;
    recipe.ingredients = [{ cropName: 'Wheat', percentage: null }];
    // No percentages to satisfy - a single-grain run is whatever wheat it uses.
    await expect(run({ w: 250 })).resolves.toBeDefined();
  });

  it('still refuses an unapproved recipe before it looks at the mix', async () => {
    recipe.status = 'DRAFT';
    await expect(run({ w: 600, b: 400 })).rejects.toThrow(/must be APPROVED/);
  });

  it('still refuses a QA-rejected batch before it looks at the mix', async () => {
    batches.b.status = 'REJECTED';
    await expect(run({ w: 600, b: 400 })).rejects.toThrow(/rejected by QA/);
  });

  it('still refuses to draw more than the warehouse holds', async () => {
    batches.b.stock[0].quantity = 100;
    await expect(run({ w: 600, b: 400 })).rejects.toThrow(/Insufficient stock/);
  });

  it('counts reserved stock as unavailable', async () => {
    batches.b.stock[0].quantity = 400;
    batches.b.stock[0].reservedQuantity = 50;
    await expect(run({ w: 600, b: 400 })).rejects.toThrow(/available 350/);
  });
});
