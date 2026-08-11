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
    if (where.channel && row.channel !== where.channel) return false;
    if (where.isActive !== undefined && row.isActive !== where.isActive) return false;
    if (where.minQuantity?.lte !== undefined && !(row.minQuantity <= where.minQuantity.lte)) {
      return false;
    }
    if (where.effectiveFrom?.lte && !(row.effectiveFrom <= where.effectiveFrom.lte)) return false;

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
