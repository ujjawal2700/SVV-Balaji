import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ProcurementPlanStatus } from '@prisma/client';
import { ProcurementService } from './procurement.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The two "consumed record" boundaries in procurement.
 *
 * A plan stops being editable when it stops being a forecast. An inspection
 * stops being editable the moment a collection has been recorded against it -
 * its result is what allowed that collection to happen, and its crop name has
 * been copied onto the resulting batch.
 */
describe('ProcurementService - plan and inspection maintenance', () => {
  const PLAN_ID = 'p1';
  const INSPECTION_ID = 'i1';

  let plans: Record<string, any>;
  let inspections: Record<string, any>;
  let inspectionCount: number;
  let deletedDocsFor: string[];
  let prisma: any;
  let service: ProcurementService;

  beforeEach(() => {
    plans = {
      [PLAN_ID]: {
        id: PLAN_ID,
        cropName: 'Wheat',
        plannedQuantity: 10000,
        unit: 'KG',
        status: ProcurementPlanStatus.DRAFT,
        scheduledFrom: new Date('2026-09-01'),
        scheduledTo: new Date('2026-10-01'),
        branchId: 'b1',
      },
    };
    inspections = {
      [INSPECTION_ID]: {
        id: INSPECTION_ID,
        farmerId: 'f1',
        cropName: 'Wheat',
        result: 'APPROVED',
        collection: null,
      },
    };
    inspectionCount = 0;
    deletedDocsFor = [];

    prisma = {
      procurementPlan: {
        findUnique: jest.fn(async ({ where }) => plans[where.id] ?? null),
        update: jest.fn(async ({ where, data }) => {
          const defined = Object.fromEntries(
            Object.entries(data).filter(([, v]) => v !== undefined),
          );
          plans[where.id] = { ...plans[where.id], ...defined };
          return plans[where.id];
        }),
        delete: jest.fn(async ({ where }) => {
          const removed = plans[where.id];
          delete plans[where.id];
          return removed;
        }),
      },
      harvestInspection: {
        count: jest.fn(async () => inspectionCount),
        findUnique: jest.fn(async ({ where }) => inspections[where.id] ?? null),
        update: jest.fn(async ({ where, data }) => {
          const defined = Object.fromEntries(
            Object.entries(data).filter(([, v]) => v !== undefined),
          );
          inspections[where.id] = { ...inspections[where.id], ...defined };
          return inspections[where.id];
        }),
        delete: jest.fn(async ({ where }) => {
          const removed = inspections[where.id];
          delete inspections[where.id];
          return removed;
        }),
      },
      harvestInspectionDocument: {
        deleteMany: jest.fn(async ({ where }) => {
          deletedDocsFor.push(where.inspectionId);
          return { count: 1 };
        }),
      },
      agreement: { findUnique: jest.fn(async () => null) },
      $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
    };

    service = new ProcurementService(prisma as unknown as PrismaService);
  });

  // --- plans ---------------------------------------------------------------

  it('edits a DRAFT plan', async () => {
    const result: any = await service.updatePlan(PLAN_ID, { plannedQuantity: 12000 });
    expect(result.plannedQuantity).toBe(12000);
  });

  it('edits a SCHEDULED plan - it is still a forecast', async () => {
    plans[PLAN_ID].status = ProcurementPlanStatus.SCHEDULED;
    const result: any = await service.updatePlan(PLAN_ID, { cropName: 'Bajra' });
    expect(result.cropName).toBe('Bajra');
  });

  it('refuses to edit a plan that is IN_PROGRESS', async () => {
    plans[PLAN_ID].status = ProcurementPlanStatus.IN_PROGRESS;
    await expect(service.updatePlan(PLAN_ID, { plannedQuantity: 1 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.updatePlan(PLAN_ID, { plannedQuantity: 1 })).rejects.toThrow(
      /measured against/,
    );
  });

  it('refuses to edit a COMPLETED plan', async () => {
    plans[PLAN_ID].status = ProcurementPlanStatus.COMPLETED;
    await expect(service.updatePlan(PLAN_ID, { notes: 'x' })).rejects.toThrow(/COMPLETED/);
  });

  it('validates the window against the stored date when only one end is supplied', async () => {
    // scheduledFrom stays 01-Sep, so a 15-Aug end date has to fail.
    await expect(
      service.updatePlan(PLAN_ID, { scheduledTo: '2026-08-15' }),
    ).rejects.toThrow(/scheduledTo cannot be earlier/);
  });

  it('deletes a plan nothing references', async () => {
    const result = await service.removePlan(PLAN_ID);
    expect(result).toEqual({ id: PLAN_ID, deleted: true });
  });

  it('refuses to delete a plan with inspections booked against it', async () => {
    inspectionCount = 3;
    await expect(service.removePlan(PLAN_ID)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.removePlan(PLAN_ID)).rejects.toThrow(/3 inspections/);
  });

  // --- inspections ---------------------------------------------------------

  it('corrects an uncollected inspection', async () => {
    const result: any = await service.updateInspection(INSPECTION_ID, { moistureLevel: 11.5 });
    expect(result.moistureLevel).toBe(11.5);
  });

  it('refuses to correct a collected inspection, naming the receipt', async () => {
    inspections[INSPECTION_ID].collection = { receiptNumber: 'RC-20260813-001' };

    await expect(
      service.updateInspection(INSPECTION_ID, { result: 'REJECTED' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateInspection(INSPECTION_ID, { result: 'REJECTED' }),
    ).rejects.toThrow(/RC-20260813-001/);
  });

  it('leaves the result untouched when the correction is refused', async () => {
    inspections[INSPECTION_ID].collection = { receiptNumber: 'RC-20260813-001' };
    await expect(
      service.updateInspection(INSPECTION_ID, { result: 'REJECTED' }),
    ).rejects.toThrow();
    expect(inspections[INSPECTION_ID].result).toBe('APPROVED');
  });

  it('refuses an agreement belonging to a different farmer', async () => {
    prisma.agreement.findUnique = jest.fn(async () => ({ id: 'a1', farmerId: 'someone-else' }));
    await expect(
      service.updateInspection(INSPECTION_ID, { agreementId: 'a1' }),
    ).rejects.toThrow(/does not belong to this farmer/);
  });

  it('deletes an uncollected inspection along with its documents', async () => {
    const result = await service.removeInspection(INSPECTION_ID);
    expect(result).toEqual({ id: INSPECTION_ID, deleted: true });
    expect(deletedDocsFor).toEqual([INSPECTION_ID]);
  });

  it('refuses to delete a collected inspection and points at the collection', async () => {
    inspections[INSPECTION_ID].collection = { receiptNumber: 'RC-20260813-001' };
    await expect(service.removeInspection(INSPECTION_ID)).rejects.toThrow(
      /Delete the collection first/,
    );
    expect(deletedDocsFor).toEqual([]);
  });

  it('404s on records that do not exist', async () => {
    await expect(service.updatePlan('missing', {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateInspection('missing', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
