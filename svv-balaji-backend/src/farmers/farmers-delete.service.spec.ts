import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FarmersService } from './farmers.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Deleting a farmer is the one destructive action on the farm-sourcing screens,
 * and the farmer row is the anchor of the entire farm-to-fork chain. These
 * tests fix the boundary: an unapproved entry created by mistake can go; a
 * farmer who has been issued a traceability code never can, because the code
 * is drawn from an atomic per-year counter and is never reissued - a printed
 * agreement or an old batch record carrying that code would resolve to nothing.
 */
describe('FarmersService - update and delete', () => {
  const FARMER_ID = 'f1';

  let farmers: Record<string, any>;
  let counts: number[];
  let deletedLogsFor: string[];
  let prisma: any;
  let service: FarmersService;

  const counter = { count: jest.fn(async () => ({ __count: true })) };

  beforeEach(() => {
    farmers = {
      [FARMER_ID]: {
        id: FARMER_ID,
        fullName: 'Ramesh Patil',
        farmerCode: null,
        mobile: '9800000000',
        village: 'Wardha',
        branchId: 'b1',
      },
    };
    counts = new Array(7).fill(0);
    deletedLogsFor = [];

    prisma = {
      farmer: {
        findUnique: jest.fn(async ({ where }) => farmers[where.id] ?? null),
        update: jest.fn(async ({ where, data }) => {
          farmers[where.id] = { ...farmers[where.id], ...data };
          return farmers[where.id];
        }),
        delete: jest.fn(async ({ where }) => {
          const removed = farmers[where.id];
          delete farmers[where.id];
          return removed;
        }),
      },
      farmerVerificationLog: {
        deleteMany: jest.fn(async ({ where }) => {
          deletedLogsFor.push(where.farmerId);
          return { count: 1 };
        }),
      },
      agreement: counter,
      seedDistribution: counter,
      trainingAttendance: counter,
      fieldVisit: counter,
      harvestInspection: counter,
      rawMaterialCollection: counter,
      rawMaterialBatch: counter,
      // remove() calls $transaction twice: once for the counts, once for the
      // delete pair. The counts call passes seven promises; the delete call
      // passes two, and its members have already run by the time it is awaited.
      $transaction: jest.fn(async (operations: unknown[]) =>
        operations.length === 7 ? counts : Promise.all(operations as Promise<unknown>[]),
      ),
    };

    service = new FarmersService(prisma as unknown as PrismaService);
  });

  // --- update --------------------------------------------------------------

  it('corrects details on an unapproved farmer', async () => {
    const result: any = await service.update(FARMER_ID, { fullName: 'Ramesh B. Patil' });
    expect(result.fullName).toBe('Ramesh B. Patil');
  });

  it('corrects details on an approved farmer without touching the code', async () => {
    farmers[FARMER_ID].farmerCode = 'SVV-2026-000001';
    await service.update(FARMER_ID, { mobile: '9811111111' });

    expect(farmers[FARMER_ID].mobile).toBe('9811111111');
    expect(farmers[FARMER_ID].farmerCode).toBe('SVV-2026-000001');
  });

  it('404s when updating a farmer that does not exist', async () => {
    await expect(service.update('missing', { fullName: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  // --- delete --------------------------------------------------------------

  it('deletes an unapproved farmer with nothing recorded against them', async () => {
    const result = await service.remove(FARMER_ID);
    expect(result).toEqual({ id: FARMER_ID, deleted: true });
    expect(farmers[FARMER_ID]).toBeUndefined();
  });

  it('removes the verification logs alongside the farmer, not before', async () => {
    await service.remove(FARMER_ID);
    expect(deletedLogsFor).toEqual([FARMER_ID]);
  });

  it('refuses to delete an approved farmer and names the code', async () => {
    farmers[FARMER_ID].farmerCode = 'SVV-2026-000001';

    await expect(service.remove(FARMER_ID)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.remove(FARMER_ID)).rejects.toThrow(/SVV-2026-000001/);
    expect(farmers[FARMER_ID]).toBeDefined();
  });

  it('points an approved farmer at the status change instead', async () => {
    farmers[FARMER_ID].farmerCode = 'SVV-2026-000001';
    await expect(service.remove(FARMER_ID)).rejects.toThrow(/INACTIVE or BLACKLISTED/);
  });

  it('checks the code before the relation counts, so the message is the useful one', async () => {
    farmers[FARMER_ID].farmerCode = 'SVV-2026-000001';
    counts[5] = 3; // collections - would otherwise produce a vaguer message

    await expect(service.remove(FARMER_ID)).rejects.toThrow(/traceability code/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses to delete an unapproved farmer who already has an agreement', async () => {
    counts[0] = 1;
    await expect(service.remove(FARMER_ID)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.remove(FARMER_ID)).rejects.toThrow(/1 agreement/);
  });

  it('never deletes the verification logs when the delete is refused', async () => {
    counts[3] = 2; // field visits
    await expect(service.remove(FARMER_ID)).rejects.toThrow(/2 field visits/);
    expect(deletedLogsFor).toEqual([]);
  });

  it('404s when deleting a farmer that does not exist', async () => {
    await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
