import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.module';

/**
 * The hierarchy rules matter because a two-level self-relation is easy to get
 * subtly wrong in a way that only breaks on the second edit - these pin the
 * three ways this schema is stricter than "any category can be a parent."
 */
describe('CategoriesService', () => {
  let categories: any[];
  let prisma: any;
  let service: CategoriesService;

  beforeEach(() => {
    categories = [];
    prisma = {
      category: {
        create: jest.fn(async ({ data }) => {
          const row = { id: `cat-${categories.length + 1}`, isActive: true, ...data };
          categories.push(row);
          return row;
        }),
        findUnique: jest.fn(async ({ where }) => categories.find((c) => c.id === where.id) ?? null),
        findFirst: jest.fn(async ({ where }) => {
          return (
            categories.find((c) => {
              if (where.slug !== undefined && c.slug !== where.slug) return false;
              if (where.id?.not && c.id === where.id.not) return false;
              if (where.parentId !== undefined && c.parentId !== where.parentId) return false;
              return true;
            }) ?? null
          );
        }),
        count: jest.fn(async ({ where }) => categories.filter((c) => c.parentId === where.parentId).length),
        // Prisma treats an explicit `undefined` in `data` as "field not
        // included" rather than "set to undefined" - mirrored here, or a
        // service that deliberately omits a field via `undefined` would
        // appear to wipe it in these tests when the real database would not.
        update: jest.fn(async ({ where, data }) => {
          const row = categories.find((c) => c.id === where.id);
          for (const [key, value] of Object.entries(data)) {
            if (value !== undefined) row[key] = value;
          }
          return row;
        }),
        delete: jest.fn(async ({ where }) => {
          categories = categories.filter((c) => c.id !== where.id);
        }),
        findMany: jest.fn(async () => categories),
      },
      product: {
        count: jest.fn(async () => 0),
      },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    service = new CategoriesService(prisma);
  });

  describe('slug handling', () => {
    it('derives a slug from the name when none is given', async () => {
      const category = await service.create({ name: 'Multigrain Flours' } as any);
      expect(category.slug).toBe('multigrain-flours');
    });

    it('appends a numeric suffix on a slug collision', async () => {
      await service.create({ name: 'Flours', slug: 'flours' } as any);
      const second = await service.create({ name: 'Flours (2)', slug: 'flours' } as any);
      expect(second.slug).toBe('flours-2');
    });

    it('leaves the slug untouched when updating unrelated fields', async () => {
      const category = await service.create({ name: 'Flours' } as any);
      const updated = await service.update(category.id, { description: 'Whole grain flours' } as any);
      expect(updated.slug).toBe('flours');
      expect(updated.description).toBe('Whole grain flours');
    });
  });

  describe('hierarchy rules', () => {
    it('refuses a category as its own parent', async () => {
      const category = await service.create({ name: 'Flours' } as any);
      await expect(service.update(category.id, { parentId: category.id } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses a two-cycle: A cannot become B\'s parent while B is A\'s parent', async () => {
      const a = await service.create({ name: 'A' } as any);
      const b = await service.create({ name: 'B', parentId: a.id } as any);
      await expect(service.update(a.id, { parentId: b.id } as any)).rejects.toThrow(BadRequestException);
    });

    it('refuses a parent that does not exist', async () => {
      await expect(
        service.create({ name: 'Orphan', parentId: 'missing-id' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows a legitimate two-level nesting', async () => {
      const parent = await service.create({ name: 'Flours' } as any);
      const child = await service.create({ name: 'Multigrain Flours', parentId: parent.id } as any);
      expect(child.parentId).toBe(parent.id);
    });
  });

  describe('delete guard', () => {
    it('refuses to delete a category with children', async () => {
      const parent = await service.create({ name: 'Flours' } as any);
      await service.create({ name: 'Multigrain Flours', parentId: parent.id } as any);
      await expect(service.remove(parent.id)).rejects.toThrow(ConflictException);
    });

    it('refuses to delete a category with products assigned', async () => {
      const category = await service.create({ name: 'Flours' } as any);
      prisma.product.count.mockResolvedValueOnce(3);
      await expect(service.remove(category.id)).rejects.toThrow(ConflictException);
    });

    it('allows deleting an empty, childless category', async () => {
      const category = await service.create({ name: 'Flours' } as any);
      const result = await service.remove(category.id);
      expect(result.deleted).toBe(true);
      expect(categories).toHaveLength(0);
    });
  });
});
