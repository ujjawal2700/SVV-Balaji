import { BadRequestException } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../common/sequence.service';

/**
 * B2B and B2C are different commercial relationships, not a display toggle.
 * These tests pin the rules that separate them, because getting one wrong
 * produces either an invoice the client cannot file or a debt they cannot
 * collect.
 */
describe('CustomersService', () => {
  let customers: any[];
  let counters: Record<string, number>;
  let prisma: any;
  let service: CustomersService;

  const VALID_GSTIN = '29ABCDE1234F1Z5';

  const b2bDto = (over: Partial<any> = {}): any => ({
    channel: 'B2B',
    type: 'DISTRIBUTOR',
    name: 'Sri Venkatesh Traders',
    phone: '9876543210',
    gstin: VALID_GSTIN,
    billingAddress: '12 Market Road, Hubli',
    ...over,
  });

  const b2cDto = (over: Partial<any> = {}): any => ({
    channel: 'B2C',
    type: 'CONSUMER',
    name: 'Anita Rao',
    phone: '9812345670',
    billingAddress: '4 Lake View, Bengaluru',
    ...over,
  });

  beforeEach(() => {
    customers = [];
    counters = {};
    prisma = {
      customer: {
        create: jest.fn(async ({ data }) => {
          const row = { id: `cust-${customers.length + 1}`, status: 'ACTIVE', ...data };
          customers.push(row);
          return row;
        }),
        findUnique: jest.fn(async ({ where }) => customers.find((c) => c.id === where.id) ?? null),
        findFirst: jest.fn(async ({ where }) =>
          customers.find((c) => where.gstin && c.gstin === where.gstin) ?? null,
        ),
        update: jest.fn(async ({ where, data }) => {
          const row = customers.find((c) => c.id === where.id);
          Object.assign(row, data);
          return row;
        }),
        findMany: jest.fn(async () => customers),
      },
      branch: { findUnique: jest.fn(async () => ({ id: 'branch-1', name: 'Hubli' })) },
      user: { findUnique: jest.fn(async () => ({ id: 'user-1', fullName: 'Sales Exec' })) },
      order: { findMany: jest.fn(async () => []) },
      sequenceCounter: {
        findUnique: jest.fn(async ({ where }) =>
          counters[where.key] === undefined ? null : { key: where.key, lastNumber: counters[where.key] },
        ),
        create: jest.fn(async ({ data }) => {
          counters[data.key] = data.lastNumber;
          return data;
        }),
        update: jest.fn(async ({ where }) => {
          counters[where.key] += 1;
          return { key: where.key, lastNumber: counters[where.key] };
        }),
      },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    service = new CustomersService(prisma as unknown as PrismaService, new SequenceService());
  });

  describe('customer codes', () => {
    it('stamps the channel into the code and numbers each channel separately', async () => {
      const first = await service.create(b2bDto());
      const consumer = await service.create(b2cDto());
      const second = await service.create(b2bDto({ name: 'Balaji Stores', gstin: '29ZZZZZ9999Z1Z9' }));

      expect(first.customerCode).toBe('CUST-B2B-000001');
      expect(consumer.customerCode).toBe('CUST-B2C-000001');
      expect(second.customerCode).toBe('CUST-B2B-000002');
    });
  });

  describe('B2B rules', () => {
    it('requires a GSTIN, because it goes on the tax invoice', async () => {
      await expect(service.create(b2bDto({ gstin: undefined }))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a malformed GSTIN', async () => {
      await expect(service.create(b2bDto({ gstin: '29ABCDE' }))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects CONSUMER as a B2B customer type', async () => {
      await expect(service.create(b2bDto({ type: 'CONSUMER' }))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses a GSTIN already registered to another account', async () => {
      await service.create(b2bDto());
      await expect(service.create(b2bDto({ name: 'Someone Else' }))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('accepts credit terms and a limit', async () => {
      const created = await service.create(
        b2bDto({ paymentTerms: 'CREDIT_30', creditLimit: 500000 }),
      );
      expect(created.paymentTerms).toBe('CREDIT_30');
      expect(created.creditLimit).toBe(500000);
    });
  });

  describe('B2C rules', () => {
    it('rejects a GSTIN on a consumer account', async () => {
      await expect(service.create(b2cDto({ gstin: VALID_GSTIN }))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects credit terms - consumers pay up front', async () => {
      await expect(service.create(b2cDto({ paymentTerms: 'CREDIT_15' }))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a credit limit', async () => {
      await expect(service.create(b2cDto({ creditLimit: 10000 }))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects an assigned sales executive', async () => {
      await expect(service.create(b2cDto({ assignedToId: 'user-1' }))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a non-CONSUMER type', async () => {
      await expect(service.create(b2cDto({ type: 'RETAILER' }))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('defaults a consumer to prepaid', async () => {
      const created = await service.create(b2cDto());
      expect(created.paymentTerms).toBe('PREPAID');
    });
  });

  describe('channel is fixed at registration', () => {
    it('refuses to move a customer between channels', async () => {
      const created = await service.create(b2bDto());

      await expect(service.update(created.id, { channel: 'B2C' } as any)).rejects.toThrow(
        /cannot be moved between channels/,
      );
    });
  });

  describe('credit position', () => {
    it('reports exposure and headroom against the limit', async () => {
      const created = await service.create(
        b2bDto({ paymentTerms: 'CREDIT_30', creditLimit: 100000 }),
      );
      prisma.order.findMany.mockResolvedValueOnce([
        { orderNumber: 'SO-20260811-001', total: 30000, orderDate: new Date(), paymentStatus: 'PENDING' },
        { orderNumber: 'SO-20260811-002', total: 25000, orderDate: new Date(), paymentStatus: 'PARTIAL' },
      ]);

      const position = await service.creditPosition(created.id);

      expect(position.currentExposure).toBe(55000);
      expect(position.availableCredit).toBe(45000);
      expect(position.overLimit).toBe(false);
    });

    it('flags a customer already over their limit', async () => {
      const created = await service.create(
        b2bDto({ paymentTerms: 'CREDIT_30', creditLimit: 50000 }),
      );
      prisma.order.findMany.mockResolvedValueOnce([
        { orderNumber: 'SO-1', total: 80000, orderDate: new Date(), paymentStatus: 'PENDING' },
      ]);

      const position = await service.creditPosition(created.id);

      expect(position.overLimit).toBe(true);
      expect(position.availableCredit).toBe(0);
    });
  });
});
