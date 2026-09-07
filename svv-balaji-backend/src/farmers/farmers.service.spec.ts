import { NotFoundException } from '@nestjs/common';
import { FarmerVerificationAction } from '@prisma/client';
import { FarmersService } from './farmers.service';
import { PrismaService } from '../prisma/prisma.service';
import { FarmerPerformanceService } from './farmer-performance.service';

/**
 * The farmerCode is the anchor of the whole farm-to-fork traceability chain
 * (FRD 8.1). These tests lock down the two properties that matter most:
 * it is issued ONLY on approval, and it never collides.
 */
describe('FarmersService - traceability code', () => {
  const YEAR = new Date().getFullYear();

  let prisma: any;
  let service: FarmersService;
  let counters: Record<number, { year: number; lastNumber: number }>;
  let farmers: Record<string, any>;
  let verificationLogs: any[];

  /** Minimal in-memory stand-in for the Prisma transaction client. */
  const makeTxClient = () => ({
    farmer: {
      update: jest.fn(async ({ where, data }) => {
        farmers[where.id] = { ...farmers[where.id], ...data };
        return farmers[where.id];
      }),
      findUnique: jest.fn(async ({ where }) => farmers[where.id] ?? null),
    },
    farmerVerificationLog: {
      create: jest.fn(async ({ data }) => {
        verificationLogs.push(data);
        return data;
      }),
    },
    farmerCodeCounter: {
      findUnique: jest.fn(async ({ where }) => counters[where.year] ?? null),
      create: jest.fn(async ({ data }) => {
        counters[data.year] = { ...data };
        return counters[data.year];
      }),
      update: jest.fn(async ({ where, data }) => {
        counters[where.year].lastNumber += data.lastNumber.increment;
        return counters[where.year];
      }),
    },
  });

  beforeEach(() => {
    counters = {};
    farmers = {};
    verificationLogs = [];

    prisma = {
      farmer: {
        findUnique: jest.fn(async ({ where }) => farmers[where.id] ?? null),
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (cb: any) => cb(makeTxClient())),
    };

    service = new FarmersService(
      prisma as unknown as PrismaService,
      // FarmersService injects this but never calls it; a bare stub keeps the
      // constructor honest without inventing behaviour the tests don't exercise.
      { recalculate: jest.fn() } as unknown as FarmerPerformanceService,
    );
  });

  const seedFarmer = (id: string, overrides: Record<string, unknown> = {}) => {
    farmers[id] = {
      id,
      fullName: 'Test Farmer',
      status: 'PENDING_VERIFICATION',
      farmerCode: null,
      // Approval refuses an incomplete record (registration-completeness.ts), so
      // a farmer seeded here has every required field filled. These tests are
      // about code issuance, not completeness; blank one via `overrides` to
      // exercise the gate.
      aadhaarNumber: '1234 5678 9012',
      address: '12 Market Road, Nagpur',
      farmSizeAcres: 4.5,
      landType: 'IRRIGATED',
      irrigationType: 'DRIP',
      cropDetails: 'Soybean, kharif',
      bankAccountName: 'Test Farmer',
      bankName: 'State Bank of India',
      bankAccountNo: '30123456789',
      ifscCode: 'SBIN0001234',
      ...overrides,
    };
  };

  it('issues a code in SVV-YYYY-NNNNNN format on approval', async () => {
    seedFarmer('f1');
    await service.verify('f1', { action: FarmerVerificationAction.APPROVED }, 'admin-1');

    expect(farmers['f1'].farmerCode).toBe(`SVV-${YEAR}-000001`);
    expect(farmers['f1'].farmerCode).toMatch(/^SVV-\d{4}-\d{6}$/);
    expect(farmers['f1'].status).toBe('ACTIVE');
  });

  it('issues sequential, non-colliding codes across farmers', async () => {
    seedFarmer('f1');
    seedFarmer('f2');
    seedFarmer('f3');

    await service.verify('f1', { action: FarmerVerificationAction.APPROVED }, 'admin-1');
    await service.verify('f2', { action: FarmerVerificationAction.APPROVED }, 'admin-1');
    await service.verify('f3', { action: FarmerVerificationAction.APPROVED }, 'admin-1');

    const codes = ['f1', 'f2', 'f3'].map((id) => farmers[id].farmerCode);
    expect(codes).toEqual([`SVV-${YEAR}-000001`, `SVV-${YEAR}-000002`, `SVV-${YEAR}-000003`]);
    expect(new Set(codes).size).toBe(3);
  });

  it('does NOT reissue a code when an already-approved farmer is re-approved', async () => {
    seedFarmer('f1');
    await service.verify('f1', { action: FarmerVerificationAction.APPROVED }, 'admin-1');
    const first = farmers['f1'].farmerCode;

    await service.verify('f1', { action: FarmerVerificationAction.APPROVED }, 'admin-2');

    expect(farmers['f1'].farmerCode).toBe(first);
    expect(counters[YEAR].lastNumber).toBe(1); // counter not burned twice
  });

  it('does NOT issue a code on rejection', async () => {
    seedFarmer('f1');
    await service.verify('f1', { action: FarmerVerificationAction.REJECTED }, 'admin-1');

    expect(farmers['f1'].farmerCode).toBeNull();
    expect(farmers['f1'].status).toBe('INACTIVE');
    expect(counters[YEAR]).toBeUndefined();
  });

  it('does NOT issue a code or change status when documents are requested', async () => {
    seedFarmer('f1');
    await service.verify(
      'f1',
      { action: FarmerVerificationAction.DOCUMENTS_REQUESTED, remarks: 'Need Aadhaar' },
      'admin-1',
    );

    expect(farmers['f1'].farmerCode).toBeNull();
    expect(farmers['f1'].status).toBe('PENDING_VERIFICATION');
  });

  it('writes an audit log entry for every verification action', async () => {
    seedFarmer('f1');
    await service.verify(
      'f1',
      { action: FarmerVerificationAction.APPROVED, remarks: 'Docs verified' },
      'admin-99',
    );

    expect(verificationLogs).toHaveLength(1);
    expect(verificationLogs[0]).toMatchObject({
      farmerId: 'f1',
      action: FarmerVerificationAction.APPROVED,
      remarks: 'Docs verified',
      verifiedById: 'admin-99',
    });
  });

  it('pads the sequence to six digits', async () => {
    counters[YEAR] = { year: YEAR, lastNumber: 41 };
    seedFarmer('f1');
    await service.verify('f1', { action: FarmerVerificationAction.APPROVED }, 'admin-1');

    expect(farmers['f1'].farmerCode).toBe(`SVV-${YEAR}-000042`);
  });

  it('throws when the farmer does not exist', async () => {
    await expect(
      service.verify('missing', { action: FarmerVerificationAction.APPROVED }, 'admin-1'),
    ).rejects.toThrow(NotFoundException);
  });
});
