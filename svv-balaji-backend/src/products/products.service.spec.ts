import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.module';

/**
 * The Add/Edit Product screen now writes a product, its variants, its content
 * lists and its price rules in one save. These specs pin the guards that keep
 * that from going wrong in ways a form cannot see: a variant id smuggled in
 * from another product, a SKU that collides across the product/variant split,
 * and - most importantly - a save that says nothing about prices closing the
 * live price ladder.
 */
describe('ProductsService', () => {
  let prisma: any;
  let pricing: any;
  let service: ProductsService;

  const baseProduct = {
    id: 'prod-atta',
    name: 'Premium Chakki Atta',
    sku: 'DT-ATTA-10KG',
    slug: 'premium-atta',
    showOnStorefront: true,
    variants: [{ id: 'var-5kg' }],
  };

  beforeEach(() => {
    prisma = {
      product: {
        findUnique: jest.fn(async ({ where }) => {
          if (where.id === 'prod-atta') return baseProduct;
          if (where.sku === 'TAKEN-SKU') return { id: 'other', name: 'Some Other Product' };
          return null;
        }),
        findMany: jest.fn(async () => []),
        create: jest.fn(async ({ data }) => ({
          id: 'new-prod',
          ...data,
          variants: (data.variants?.create ?? []).map((v: any, i: number) => ({ id: `new-var-${i}`, ...v })),
        })),
        update: jest.fn(async ({ data }) => ({ id: 'prod-atta', ...data, variants: [] })),
      },
      category: { findUnique: jest.fn(async () => ({ id: 'cat-1' })) },
      productVariant: {
        findUnique: jest.fn(async () => null),
        findMany: jest.fn(async () => []),
        deleteMany: jest.fn(async () => ({ count: 0 })),
        update: jest.fn(async () => ({})),
        create: jest.fn(async ({ data }) => ({ id: 'created-var', ...data })),
      },
      productSpecification: { deleteMany: jest.fn(), createMany: jest.fn() },
      productFaq: { deleteMany: jest.fn(), createMany: jest.fn() },
      productOffer: { deleteMany: jest.fn(), createMany: jest.fn() },
      priceList: { findFirst: jest.fn(async () => null) },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    pricing = { syncLadder: jest.fn(async () => ({ created: 0, superseded: 0, closed: 0 })) };
    service = new ProductsService(prisma, pricing);
  });

  describe('variant ownership', () => {
    it('refuses to update a variant id that belongs to a different product', async () => {
      await expect(
        service.update(
          'prod-atta',
          { variants: [{ id: 'var-of-someone-else', name: 'Hijacked', sku: 'NEW-SKU' }] },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);

      // Nothing was written - the check happens before the transaction opens.
      expect(prisma.productVariant.update).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('updates a variant that does belong to the product, in place', async () => {
      await service.update(
        'prod-atta',
        { variants: [{ id: 'var-5kg', name: '5kg Bag', sku: 'DT-ATTA-5KG' }] },
        'user-1',
      );

      expect(prisma.productVariant.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'var-5kg' } }),
      );
      expect(prisma.productVariant.create).not.toHaveBeenCalled();
    });

    it('deletes only the variants the operator removed, so kept ones keep their price history', async () => {
      await service.update(
        'prod-atta',
        { variants: [{ id: 'var-5kg', name: '5kg Bag', sku: 'DT-ATTA-5KG' }] },
        'user-1',
      );

      expect(prisma.productVariant.deleteMany).toHaveBeenCalledWith({
        where: { productId: 'prod-atta', id: { notIn: ['var-5kg'] } },
      });
    });
  });

  describe('SKU uniqueness across products and variants', () => {
    it('refuses a variant SKU that is already a product SKU', async () => {
      prisma.product.findMany.mockResolvedValueOnce([{ sku: 'TAKEN-SKU', name: 'Some Other Product' }]);

      await expect(
        service.update(
          'prod-atta',
          { variants: [{ name: '1kg', sku: 'TAKEN-SKU' }] },
          'user-1',
        ),
      ).rejects.toThrow(/already belongs to "Some Other Product"/);
    });

    it("refuses a variant that reuses its own product's SKU", async () => {
      await expect(
        service.update(
          'prod-atta',
          { variants: [{ name: '10kg Bag', sku: 'DT-ATTA-10KG' }] },
          'user-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('refuses the same SKU twice in one payload', async () => {
      await expect(
        service.update(
          'prod-atta',
          {
            variants: [
              { name: 'A', sku: 'DUP' },
              { name: 'B', sku: 'DUP' },
            ],
          },
          'user-1',
        ),
      ).rejects.toThrow(/appears twice/);
    });

    it('refuses a new product whose SKU is held by a variant', async () => {
      prisma.product.findUnique.mockResolvedValueOnce(null);
      prisma.productVariant.findUnique.mockResolvedValueOnce({
        id: 'v',
        name: '5kg Bag',
        product: { name: 'Premium Chakki Atta' },
      });

      await expect(
        service.create({ name: 'X', sku: 'DT-ATTA-5KG', unit: 'KG' }, 'user-1'),
      ).rejects.toThrow(/Premium Chakki Atta - 5kg Bag/);
    });
  });

  describe('price sync', () => {
    it('does not touch prices when the save says nothing about them', async () => {
      await service.update('prod-atta', { description: 'New copy' }, 'user-1');

      // Omitting `pricing` on a PATCH must never close the live ladder.
      expect(pricing.syncLadder).not.toHaveBeenCalled();
    });

    it('syncs the B2C price and the B2B ladder for the product', async () => {
      await service.update(
        'prod-atta',
        {
          pricing: {
            gstRatePercent: 5,
            b2cPrice: 450,
            b2bTiers: [
              { minQuantity: 1, unitPrice: 432 },
              { minQuantity: 10, unitPrice: 384 },
            ],
          },
        },
        'user-1',
      );

      expect(pricing.syncLadder).toHaveBeenCalledTimes(2);
      expect(pricing.syncLadder).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          channel: 'B2C',
          variantId: null,
          tiers: [{ minQuantity: 1, unitPrice: 450 }],
          gstRatePercent: 5,
          createdById: 'user-1',
        }),
      );
      expect(pricing.syncLadder).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          channel: 'B2B',
          tiers: [
            { minQuantity: 1, unitPrice: 432, tierTotal: null },
            { minQuantity: 10, unitPrice: 384, tierTotal: null },
          ],
        }),
      );
    });

    it('prices a newly created variant against its own id, not the product', async () => {
      await service.update(
        'prod-atta',
        { variants: [{ name: '1kg', sku: 'DT-ATTA-1KG', pricing: { b2cPrice: 60 } }] },
        'user-1',
      );

      expect(pricing.syncLadder).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ variantId: 'created-var', channel: 'B2C' }),
      );
    });

    it('keeps the GST rate the product already charges when the save does not restate it', async () => {
      prisma.priceList.findFirst.mockResolvedValueOnce({ gstRatePercent: 12 });

      await service.update('prod-atta', { pricing: { b2cPrice: 460 } }, 'user-1');

      expect(pricing.syncLadder).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ gstRatePercent: 12 }),
      );
    });

    it('creates a product and prices its variants in the same transaction', async () => {
      await service.create(
        {
          name: 'Premium Chakki Atta',
          sku: 'DT-ATTA-10KG',
          unit: 'KG',
          variants: [{ name: '5kg Bag', sku: 'DT-ATTA-5KG', pricing: { b2cPrice: 240 } }],
          pricing: { b2cPrice: 450 },
        },
        'user-1',
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(pricing.syncLadder).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ variantId: 'new-var-0', tiers: [{ minQuantity: 1, unitPrice: 240 }] }),
      );
    });
  });

  describe('publishing', () => {
    it('gives a product a slug the moment it is first published', async () => {
      prisma.product.findUnique.mockImplementation(async ({ where }: any) =>
        where.id === 'prod-atta' ? { ...baseProduct, slug: null, showOnStorefront: false } : null,
      );
      prisma.product.findFirst = jest.fn(async () => null);

      await service.update('prod-atta', { showOnStorefront: true }, 'user-1');

      const written = prisma.product.update.mock.calls[0][0].data;
      expect(written.slug).toBe('premium-chakki-atta');
    });

    it('404s an unknown product', async () => {
      await expect(service.update('missing', {}, 'user-1')).rejects.toThrow(NotFoundException);
    });
  });
});
