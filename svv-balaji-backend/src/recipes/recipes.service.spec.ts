import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductionType, RecipeStatus } from '@prisma/client';
import { RecipesService } from './recipes.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Recipes are the formula of record. Two properties matter most: a multigrain
 * blend whose percentages don't total 100 is unreproducible, and approving a
 * version must supersede the previous one so exactly one is live.
 */
describe('RecipesService', () => {
  let prisma: any;
  let service: RecipesService;
  let recipes: any[];

  beforeEach(() => {
    recipes = [];
    prisma = {
      product: { findUnique: jest.fn(async ({ where }) => ({ id: where.id, name: 'Atta' })) },
      recipe: {
        findFirst: jest.fn(async ({ where }) => {
          const matches = recipes
            .filter((r) => r.recipeCode === where.recipeCode)
            .sort((a, b) => b.version - a.version);
          return matches[0] ?? null;
        }),
        findUnique: jest.fn(async ({ where }) => recipes.find((r) => r.id === where.id) ?? null),
        create: jest.fn(async ({ data }) => {
          const row = { id: `r-${recipes.length + 1}`, ...data };
          recipes.push(row);
          return row;
        }),
        update: jest.fn(async ({ where, data }) => {
          const r = recipes.find((x) => x.id === where.id);
          Object.assign(r, data);
          return r;
        }),
        updateMany: jest.fn(async ({ where, data }) => {
          recipes
            .filter((r) => r.recipeCode === where.recipeCode && r.status === where.status)
            .forEach((r) => Object.assign(r, data));
          return { count: 0 };
        }),
      },
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    };
    service = new RecipesService(prisma as unknown as PrismaService);
  });

  const singleGrain = {
    recipeCode: 'WF-001',
    productId: 'p-1',
    name: 'Wheat Flour',
    productionType: ProductionType.SINGLE_GRAIN,
    ingredients: [{ cropName: 'Wheat', quantity: 100 }],
  };

  const multiGrain = {
    recipeCode: 'MG-001',
    productId: 'p-1',
    name: 'Multigrain Atta',
    productionType: ProductionType.MULTI_GRAIN,
    ingredients: [
      { cropName: 'Wheat', quantity: 60, percentage: 60 },
      { cropName: 'Barley', quantity: 25, percentage: 25 },
      { cropName: 'Millet', quantity: 15, percentage: 15 },
    ],
  };

  describe('ingredient validation', () => {
    it('accepts a single-grain recipe with exactly one ingredient', async () => {
      const r = await service.create(singleGrain as any, 'u-1');
      expect(r.version).toBe(1);
    });

    it('rejects a single-grain recipe with more than one ingredient', async () => {
      await expect(
        service.create(
          { ...singleGrain, ingredients: [
            { cropName: 'Wheat', quantity: 50 },
            { cropName: 'Barley', quantity: 50 },
          ] } as any,
          'u-1',
        ),
      ).rejects.toThrow(/exactly one ingredient/);
    });

    it('accepts a multigrain blend whose percentages total 100', async () => {
      const r = await service.create(multiGrain as any, 'u-1');
      expect(r.productionType).toBe(ProductionType.MULTI_GRAIN);
    });

    it('rejects a multigrain blend that does not total 100', async () => {
      await expect(
        service.create(
          { ...multiGrain, ingredients: [
            { cropName: 'Wheat', quantity: 60, percentage: 60 },
            { cropName: 'Barley', quantity: 25, percentage: 25 },
          ] } as any,
          'u-1',
        ),
      ).rejects.toThrow(/must total 100/);
    });

    it('tolerates rounding on thirds (33.33 x 3)', async () => {
      const r = await service.create(
        { ...multiGrain, ingredients: [
          { cropName: 'Wheat', quantity: 1, percentage: 33.33 },
          { cropName: 'Barley', quantity: 1, percentage: 33.33 },
          { cropName: 'Millet', quantity: 1, percentage: 33.34 },
        ] } as any,
        'u-1',
      );
      expect(r).toBeDefined();
    });

    it('requires a percentage on every multigrain ingredient', async () => {
      await expect(
        service.create(
          { ...multiGrain, ingredients: [
            { cropName: 'Wheat', quantity: 60, percentage: 60 },
            { cropName: 'Barley', quantity: 40 },
          ] } as any,
          'u-1',
        ),
      ).rejects.toThrow(/needs a percentage/);
    });

    it('rejects duplicate crops in one recipe', async () => {
      await expect(
        service.create(
          { ...multiGrain, ingredients: [
            { cropName: 'Wheat', quantity: 50, percentage: 50 },
            { cropName: 'wheat', quantity: 50, percentage: 50 },
          ] } as any,
          'u-1',
        ),
      ).rejects.toThrow(/Duplicate ingredient/);
    });

    it('rejects a multigrain recipe with only one ingredient', async () => {
      await expect(
        service.create(
          { ...multiGrain, ingredients: [{ cropName: 'Wheat', quantity: 100, percentage: 100 }] } as any,
          'u-1',
        ),
      ).rejects.toThrow(/at least two ingredients/);
    });
  });

  describe('versioning', () => {
    it('starts at version 1 and increments per recipeCode', async () => {
      const v1 = await service.create(singleGrain as any, 'u-1');
      const v2 = await service.create(singleGrain as any, 'u-1');
      const v3 = await service.create(singleGrain as any, 'u-1');
      expect([v1.version, v2.version, v3.version]).toEqual([1, 2, 3]);
    });

    it('versions different codes independently', async () => {
      await service.create(singleGrain as any, 'u-1');
      const other = await service.create({ ...singleGrain, recipeCode: 'WF-002' } as any, 'u-1');
      expect(other.version).toBe(1);
    });
  });

  describe('approval', () => {
    it('marks the version approved and stamps the approver', async () => {
      const r = await service.create(singleGrain as any, 'u-1');
      const approved = await service.approve(r.id, 'admin-1');
      expect(approved.status).toBe(RecipeStatus.APPROVED);
      expect(approved.approvedById).toBe('admin-1');
      expect(approved.approvedAt).toBeInstanceOf(Date);
    });

    it('supersedes the previously approved version of the same code', async () => {
      const v1 = await service.create(singleGrain as any, 'u-1');
      await service.approve(v1.id, 'admin-1');
      const v2 = await service.create(singleGrain as any, 'u-1');
      await service.approve(v2.id, 'admin-1');

      const stored1 = recipes.find((r) => r.id === v1.id);
      const stored2 = recipes.find((r) => r.id === v2.id);
      expect(stored1.status).toBe(RecipeStatus.INACTIVE);
      expect(stored2.status).toBe(RecipeStatus.APPROVED);

      const live = recipes.filter((r) => r.status === RecipeStatus.APPROVED);
      expect(live).toHaveLength(1);
    });

    it('refuses to approve twice', async () => {
      const r = await service.create(singleGrain as any, 'u-1');
      await service.approve(r.id, 'admin-1');
      await expect(service.approve(r.id, 'admin-1')).rejects.toThrow(/already approved/);
    });

    it('throws for an unknown recipe', async () => {
      await expect(service.approve('nope', 'admin-1')).rejects.toThrow(NotFoundException);
    });

    it('will not let setStatus be used to approve', async () => {
      const r = await service.create(singleGrain as any, 'u-1');
      await expect(service.setStatus(r.id, RecipeStatus.APPROVED)).rejects.toThrow(
        /use the \/approve endpoint/i,
      );
    });
  });
});
