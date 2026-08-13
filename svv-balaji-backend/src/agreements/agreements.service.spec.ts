import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AgreementsService } from './agreements.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * An agreement's rate is not a note - it is the figure a collection falls back
 * on when no rate is entered at weighing, and its quality standards are what
 * the inspector judged against. So it stays editable exactly as long as nobody
 * has relied on it.
 */
describe('AgreementsService - edit and delete', () => {
  const AGREEMENT_ID = 'a1';

  let agreements: Record<string, any>;
  let inspectionCount: number;
  let prisma: any;
  let service: AgreementsService;

  beforeEach(() => {
    agreements = {
      [AGREEMENT_ID]: {
        id: AGREEMENT_ID,
        farmerId: 'f1',
        cropName: 'Wheat',
        purchaseRate: 2400,
        expectedQuantity: 5000,
        agreementDate: new Date('2026-06-01'),
        status: 'PENDING',
        _count: { harvestInspections: 0 },
      },
    };
    inspectionCount = 0;

    prisma = {
      agreement: {
        findUnique: jest.fn(async ({ where }) => {
          const found = agreements[where.id];
          if (!found) return null;
          return { ...found, _count: { harvestInspections: inspectionCount } };
        }),
        update: jest.fn(async ({ where, data }) => {
          const defined = Object.fromEntries(
            Object.entries(data).filter(([, v]) => v !== undefined),
          );
          agreements[where.id] = { ...agreements[where.id], ...defined };
          return agreements[where.id];
        }),
        delete: jest.fn(async ({ where }) => {
          const removed = agreements[where.id];
          delete agreements[where.id];
          return removed;
        }),
      },
      harvestInspection: { count: jest.fn(async () => inspectionCount) },
    };

    service = new AgreementsService(prisma as unknown as PrismaService);
  });

  it('edits an agreement nobody has inspected against', async () => {
    const result: any = await service.update(AGREEMENT_ID, { purchaseRate: 2500 });
    expect(result.purchaseRate).toBe(2500);
  });

  it('refuses the edit once an inspection has used it, and quotes the rate', async () => {
    inspectionCount = 1;

    await expect(service.update(AGREEMENT_ID, { purchaseRate: 2500 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.update(AGREEMENT_ID, { purchaseRate: 2500 })).rejects.toThrow(/2400/);
  });

  it('leaves the rate untouched when the edit is refused', async () => {
    inspectionCount = 2;
    await expect(service.update(AGREEMENT_ID, { purchaseRate: 9999 })).rejects.toThrow();
    expect(agreements[AGREEMENT_ID].purchaseRate).toBe(2400);
  });

  it('suggests raising a new agreement rather than leaving the user stuck', async () => {
    inspectionCount = 1;
    await expect(service.update(AGREEMENT_ID, { cropName: 'Bajra' })).rejects.toThrow(
      /raise a new agreement/,
    );
  });

  it('deletes an unused agreement', async () => {
    const result = await service.remove(AGREEMENT_ID);
    expect(result).toEqual({ id: AGREEMENT_ID, deleted: true });
    expect(agreements[AGREEMENT_ID]).toBeUndefined();
  });

  it('refuses to delete one an inspection references', async () => {
    inspectionCount = 4;
    await expect(service.remove(AGREEMENT_ID)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.remove(AGREEMENT_ID)).rejects.toThrow(/4 inspections/);
  });

  it('404s on an agreement that does not exist', async () => {
    await expect(service.update('missing', {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
