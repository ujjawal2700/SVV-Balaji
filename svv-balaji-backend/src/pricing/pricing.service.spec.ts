import { BadRequestException } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The pricing engine is where the client's 11-Aug-2026 decision actually lands:
 * the same pack sells to a distributor and to a consumer at different prices.
 *
 * The property that matters most is isolation - there must be no path by which
 * a B2C order picks up a B2B rate. Everything else here is precedence.
 */
describe('PricingService', () => {
  let rows: any[];
  let prisma: any;
  let service: PricingService;

  const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

  /** Applies the same where-shape the service builds, so filtering is real. */
  const matches = (row: any, where: any): boolean => {
    if (where.productId && row.productId !== where.productId) return false;
    // Null is a value, not "unset" - a product-level lookup must not match a
    // variant's row. `in` rather than a truthiness check for that reason.
    if ('variantId' in where && row.variantId !== where.variantId) return false;
    if (where.channel && row.channel !== where.channel) return false;
    if (where.isActive !== undefined && row.isActive !== where.isActive) return false;
    if (where.minQuantity?.lte !== undefined && !(row.minQuantity <= where.minQuantity.lte)) {
      return false;
    }
    if (where.effectiveFrom?.lte && !(row.effectiveFrom <= where.effectiveFrom.lte)) return false;
    // A bare `customerType: null` means "channel-wide rules only".
    if ('customerType' in where && where.customerType === null && row.customerType !== null) {
      return false;
    }
    // Top-level OR over effectiveTo, the "still in force" window.
    if (where.OR) {
      const ok = where.OR.some((c: any) => {
        if (c.effectiveTo === null) return row.effectiveTo === null;
        return row.effectiveTo !== null && row.effectiveTo > c.effectiveTo.gt;
      });
      if (!ok) return false;
    }

    for (const clause of where.AND ?? []) {
      if (clause.OR) {
        const ok = clause.OR.some((c: any) => {
          if ('effectiveTo' in c) {
            if (c.effectiveTo === null) return row.effectiveTo === null;
            return row.effectiveTo !== null && row.effectiveTo > c.effectiveTo.gt;
          }
          if ('customerType' in c) return row.customerType === c.customerType;
          return false;
        });
        if (!ok) return false;
      } else if ('customerType' in clause) {
        if (row.customerType !== clause.customerType) return false;
      }
    }
    return true;
  };

  const price = (over: Partial<any>) => ({
    id: `pl-${rows.length + 1}`,
    productId: 'prod-atta',
    variantId: null,
    tierTotal: null,
    channel: 'B2B',
    customerType: null,
    unitPrice: 100,
    gstRatePercent: 5,
    minQuantity: 1,
    currency: 'INR',
    effectiveFrom: D('2026-01-01'),
    effectiveTo: null,
    isActive: true,
    createdById: 'user-1',
    ...over,
  });

  beforeEach(() => {
    rows = [];
    prisma = {
      priceList: {
        findMany: jest.fn(async ({ where }) => rows.filter((r) => matches(r, where))),
        findFirst: jest.fn(async () => null),
        findUnique: jest.fn(async ({ where }) => rows.find((r) => r.id === where.id) ?? null),
        create: jest.fn(async ({ data }) => {
          const row = { id: `pl-${rows.length + 1}`, ...data };
          rows.push(row);
          return row;
        }),
        update: jest.fn(async ({ where, data }) => {
          const row = rows.find((r) => r.id === where.id);
          Object.assign(row, data);
          return row;
        }),
      },
      product: {
        findUnique: jest.fn(async () => ({ id: 'prod-atta', name: 'Wheat Atta 5kg', sku: 'ATTA-5' })),
      },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    service = new PricingService(prisma as unknown as PrismaService);
  });

  describe('channel isolation', () => {
    it('never returns a B2B price to a B2C order', async () => {
      rows.push(price({ channel: 'B2B', unitPrice: 180 }));
      rows.push(price({ channel: 'B2C', unitPrice: 250, customerType: 'CONSUMER' }));

      const consumer = await service.resolve({
        productId: 'prod-atta',
        channel: 'B2C',
        customerType: 'CONSUMER' as any,
        quantity: 1,
        on: D('2026-08-11'),
      });

      expect(consumer.unitPrice).toBe(250);
      expect(consumer.channel).toBe('B2C');
    });

    it('never returns a B2C price to a B2B order', async () => {
      rows.push(price({ channel: 'B2B', unitPrice: 180, customerType: 'DISTRIBUTOR' }));
      rows.push(price({ channel: 'B2C', unitPrice: 250, customerType: 'CONSUMER' }));

      const distributor = await service.resolve({
        productId: 'prod-atta',
        channel: 'B2B',
        customerType: 'DISTRIBUTOR' as any,
        quantity: 1,
        on: D('2026-08-11'),
      });

      expect(distributor.unitPrice).toBe(180);
    });

    it('refuses to guess when the channel has no price at all', async () => {
      rows.push(price({ channel: 'B2B', unitPrice: 180 }));

      await expect(
        service.resolve({
          productId: 'prod-atta',
          channel: 'B2C' as any,
          customerType: 'CONSUMER' as any,
          quantity: 1,
          on: D('2026-08-11'),
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('variant isolation', () => {
    it('never charges a variant rate to a line that did not ask for that variant', async () => {
      rows.push(price({ unitPrice: 450, variantId: null }));
      rows.push(price({ unitPrice: 240, variantId: 'var-5kg' }));

      const productLine = await service.resolve({
        productId: 'prod-atta',
        channel: 'B2B' as any,
        quantity: 1,
        on: D('2026-08-11'),
      });

      expect(productLine.unitPrice).toBe(450);
    });

    it('resolves a variant to its own rate, not the product rate', async () => {
      rows.push(price({ unitPrice: 450, variantId: null }));
      rows.push(price({ unitPrice: 240, variantId: 'var-5kg' }));

      const variantLine = await service.resolve({
        productId: 'prod-atta',
        variantId: 'var-5kg',
        channel: 'B2B' as any,
        quantity: 1,
        on: D('2026-08-11'),
      });

      expect(variantLine.unitPrice).toBe(240);
    });

    it('refuses to fall back to the product rate when a variant has none', async () => {
      // Charging the 10kg price for a 5kg bag is worse than refusing the line.
      rows.push(price({ unitPrice: 450, variantId: null }));

      await expect(
        service.resolve({
          productId: 'prod-atta',
          variantId: 'var-5kg',
          channel: 'B2B' as any,
          quantity: 1,
          on: D('2026-08-11'),
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('syncLadder (the Add/Edit Product price tables)', () => {
    const NOW = new Date('2026-09-19T10:00:00.000Z');
    const sync = (tiers: { minQuantity: number; unitPrice: number }[], over: Partial<any> = {}) =>
      service.syncLadder(prisma as any, {
        productId: 'prod-atta',
        channel: 'B2B' as any,
        tiers,
        gstRatePercent: 5,
        createdById: 'user-1',
        now: NOW,
        ...over,
      });

    it('creates one rule per tier when the product has no prices yet', async () => {
      const result = await sync([
        { minQuantity: 1, unitPrice: 198 },
        { minQuantity: 10, unitPrice: 176 },
      ]);

      expect(result).toEqual({ created: 2, superseded: 0, closed: 0 });
      expect(rows.map((r) => r.minQuantity).sort((a, b) => a - b)).toEqual([1, 10]);
    });

    it('writes nothing when the saved ladder already matches - a save of an unrelated field must not churn price history', async () => {
      rows.push(price({ minQuantity: 1, unitPrice: 198, effectiveFrom: D('2026-01-01') }));
      rows.push(price({ minQuantity: 10, unitPrice: 176, effectiveFrom: D('2026-01-01') }));

      const result = await sync([
        { minQuantity: 1, unitPrice: 198 },
        { minQuantity: 10, unitPrice: 176 },
      ]);

      expect(result).toEqual({ created: 0, superseded: 0, closed: 0 });
      expect(prisma.priceList.create).not.toHaveBeenCalled();
      expect(prisma.priceList.update).not.toHaveBeenCalled();
    });

    it('supersedes a changed price instead of editing it in place', async () => {
      rows.push(price({ id: 'old', minQuantity: 1, unitPrice: 198, effectiveFrom: D('2026-01-01') }));

      const result = await sync([{ minQuantity: 1, unitPrice: 210 }]);

      expect(result).toEqual({ created: 0, superseded: 1, closed: 0 });
      const old = rows.find((r) => r.id === 'old');
      // The old rate is closed the instant before, so a past invoice still
      // reproduces at 198 while anything from now on resolves 210.
      expect(old.unitPrice).toBe(198);
      expect(old.effectiveTo).toEqual(new Date(NOW.getTime() - 1));
      const fresh = rows.find((r) => r.id !== 'old');
      expect(fresh.unitPrice).toBe(210);
      expect(fresh.effectiveFrom).toEqual(NOW);
    });

    it('closes a tier the operator removed from the table', async () => {
      rows.push(price({ id: 't1', minQuantity: 1, unitPrice: 198, effectiveFrom: D('2026-01-01') }));
      rows.push(price({ id: 't50', minQuantity: 50, unitPrice: 158, effectiveFrom: D('2026-01-01') }));

      const result = await sync([{ minQuantity: 1, unitPrice: 198 }]);

      expect(result).toEqual({ created: 0, superseded: 0, closed: 1 });
      expect(rows.find((r) => r.id === 't50').effectiveTo).toEqual(NOW);
      expect(rows.find((r) => r.id === 't1').effectiveTo).toBeNull();
    });

    it('never touches a customer-type-specific rate set on the Price Lists screen', async () => {
      rows.push(
        price({ id: 'dist', customerType: 'DISTRIBUTOR', minQuantity: 1, unitPrice: 170, effectiveFrom: D('2026-01-01') }),
      );

      const result = await sync([{ minQuantity: 1, unitPrice: 198 }]);

      // The channel-wide rule is created; the distributor arrangement is left alone.
      expect(result.created).toBe(1);
      expect(rows.find((r) => r.id === 'dist').effectiveTo).toBeNull();
      expect(rows.find((r) => r.id === 'dist').unitPrice).toBe(170);
    });

    it('keeps one variant ladder separate from the product ladder', async () => {
      rows.push(price({ id: 'prod-rate', minQuantity: 1, unitPrice: 450, effectiveFrom: D('2026-01-01') }));

      await sync([{ minQuantity: 1, unitPrice: 240 }], { variantId: 'var-5kg' });

      // The product-level rate is untouched; the variant got its own row.
      expect(rows.find((r) => r.id === 'prod-rate').effectiveTo).toBeNull();
      expect(rows.filter((r) => r.variantId === 'var-5kg')).toHaveLength(1);
    });

    it('refuses two tiers that start at the same quantity', async () => {
      await expect(
        sync([
          { minQuantity: 10, unitPrice: 176 },
          { minQuantity: 10, unitPrice: 170 },
        ]),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('precedence', () => {
    it('prefers a customer-type rule over a channel-wide one', async () => {
      rows.push(price({ unitPrice: 200, customerType: null }));
      rows.push(price({ unitPrice: 170, customerType: 'DISTRIBUTOR' }));

      const resolved = await service.resolve({
        productId: 'prod-atta',
        channel: 'B2B' as any,
        customerType: 'DISTRIBUTOR' as any,
        quantity: 5,
        on: D('2026-08-11'),
      });

      expect(resolved.unitPrice).toBe(170);
      expect(resolved.appliedRule).toContain('DISTRIBUTOR');
    });

    it('applies the highest quantity break the line qualifies for', async () => {
      rows.push(price({ unitPrice: 200, minQuantity: 1 }));
      rows.push(price({ unitPrice: 185, minQuantity: 50 }));
      rows.push(price({ unitPrice: 175, minQuantity: 100 }));

      const small = await service.resolve({
        productId: 'prod-atta',
        channel: 'B2B' as any,
        quantity: 10,
        on: D('2026-08-11'),
      });
      const bulk = await service.resolve({
        productId: 'prod-atta',
        channel: 'B2B' as any,
        quantity: 60,
        on: D('2026-08-11'),
      });

      expect(small.unitPrice).toBe(200);
      expect(bulk.unitPrice).toBe(185);
    });

    it('ignores a rule that has expired and one that has not started', async () => {
      rows.push(
        price({ unitPrice: 150, effectiveFrom: D('2026-01-01'), effectiveTo: D('2026-06-30') }),
      );
      rows.push(price({ unitPrice: 220, effectiveFrom: D('2026-12-01') }));
      rows.push(price({ unitPrice: 190, effectiveFrom: D('2026-07-01') }));

      const resolved = await service.resolve({
        productId: 'prod-atta',
        channel: 'B2B' as any,
        quantity: 1,
        on: D('2026-08-11'),
      });

      expect(resolved.unitPrice).toBe(190);
    });

    it('ignores a deactivated rule', async () => {
      rows.push(price({ unitPrice: 120, isActive: false }));
      rows.push(price({ unitPrice: 190 }));

      const resolved = await service.resolve({
        productId: 'prod-atta',
        channel: 'B2B' as any,
        quantity: 1,
        on: D('2026-08-11'),
      });

      expect(resolved.unitPrice).toBe(190);
    });
  });

  describe('supersede', () => {
    it('closes the old rate the instant before the new one starts', async () => {
      const original = price({ unitPrice: 190, effectiveFrom: D('2026-01-01') });
      rows.push(original);

      const replacement = await service.supersede(
        original.id,
        { unitPrice: 205, effectiveFrom: '2026-09-01T00:00:00.000Z' },
        'user-1',
      );

      expect(original.effectiveTo).toEqual(new Date(D('2026-09-01').getTime() - 1));
      expect(Number(replacement.unitPrice)).toBe(205);
      expect(replacement.channel).toBe(original.channel);
    });

    it('refuses a replacement dated before the rule it supersedes', async () => {
      const original = price({ effectiveFrom: D('2026-06-01') });
      rows.push(original);

      await expect(
        service.supersede(original.id, { unitPrice: 205, effectiveFrom: '2026-01-01' }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('coherence', () => {
    it('refuses a CONSUMER price on the B2B channel', async () => {
      await expect(
        service.create(
          {
            productId: 'prod-atta',
            channel: 'B2B' as any,
            customerType: 'CONSUMER' as any,
            unitPrice: 200,
            effectiveFrom: '2026-08-11',
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses a DISTRIBUTOR price on the B2C channel', async () => {
      await expect(
        service.create(
          {
            productId: 'prod-atta',
            channel: 'B2C' as any,
            customerType: 'DISTRIBUTOR' as any,
            unitPrice: 200,
            effectiveFrom: '2026-08-11',
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
