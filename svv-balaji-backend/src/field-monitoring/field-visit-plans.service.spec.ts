import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FieldVisitPlansService } from './field-visit-plans.service';
import { FieldMonitoringService } from './field-monitoring.service';

/**
 * FRD 12.1 planned visits: the plan lifecycle, and the one place it touches the
 * existing visit flow - recording a visit against a plan completes it, and
 * deleting that visit hands the plan back.
 */
describe('Field visit plans', () => {
  const today = new Date().toISOString().slice(0, 10);
  const superAdmin = { sub: 'u-admin', role: 'SUPER_ADMIN', branchId: null } as any;
  const branchUser = { sub: 'u-exec', role: 'AGRICULTURE_EXPERT', branchId: 'b1' } as any;

  let plans: Record<string, any>;
  let prisma: any;

  beforeEach(() => {
    plans = {};
    prisma = {
      farmer: {
        findUnique: jest.fn(async ({ where }) =>
          where.id === 'f1' ? { id: 'f1', fullName: 'Ramesh', branchId: 'b1', status: 'ACTIVE' }
          : where.id === 'f2' ? { id: 'f2', fullName: 'Suresh', branchId: 'b2', status: 'ACTIVE' }
          : where.id === 'f3' ? { id: 'f3', fullName: 'Old', branchId: 'b1', status: 'BLACKLISTED' }
          : null),
      },
      user: { findUnique: jest.fn(async ({ where }) => (where.id === 'u-other' ? { id: 'u-other', status: 'ACTIVE' } : null)) },
      fieldVisitPlan: {
        create: jest.fn(async ({ data }) => (plans.p1 = { status: 'PLANNED', ...data, id: data.id ?? 'p1' })),
        findUnique: jest.fn(async ({ where }) => plans[where.id] ?? null),
        findMany: jest.fn(async () => Object.values(plans)),
        update: jest.fn(async ({ where, data }) => (plans[where.id] = { ...plans[where.id], ...data })),
        updateMany: jest.fn(async ({ where, data }) => {
          const hit = Object.values(plans).filter((p: any) =>
            (where.id === undefined || p.id === where.id) &&
            (where.status === undefined || p.status === where.status) &&
            (where.completedVisitId === undefined || p.completedVisitId === where.completedVisitId));
          hit.forEach((p: any) => Object.assign(p, data));
          return { count: hit.length };
        }),
        delete: jest.fn(async ({ where }) => { delete plans[where.id]; }),
      },
      fieldVisit: {
        create: jest.fn(async ({ data }) => ({ ...data, id: data.id ?? 'v1' })),
        findUnique: jest.fn(async () => ({ id: 'v1' })),
        delete: jest.fn(async () => ({ id: 'v1' })),
      },
    };
    prisma.$transaction = jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)));
  });

  describe('FieldVisitPlansService', () => {
    const service = () => new FieldVisitPlansService(prisma);

    it('defaults the executive to the caller and the branch to the farmer\'s', async () => {
      await service().create({ farmerId: 'f1', plannedDate: today }, superAdmin);
      expect(prisma.fieldVisitPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ expertId: 'u-admin', createdById: 'u-admin', branchId: 'b1' }) }),
      );
    });

    it('refuses a date in the past', async () => {
      await expect(service().create({ farmerId: 'f1', plannedDate: '2020-01-01' }, superAdmin)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a farmer in another branch for a branch user', async () => {
      await expect(service().create({ farmerId: 'f2', plannedDate: today }, branchUser)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a blacklisted farmer', async () => {
      await expect(service().create({ farmerId: 'f3', plannedDate: today }, superAdmin)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses an unknown assigned executive', async () => {
      await expect(service().create({ farmerId: 'f1', plannedDate: today, expertId: 'nobody' }, superAdmin)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cancels a planned visit, then refuses edits; cancelling again is a no-op (offline re-send)', async () => {
      await service().create({ farmerId: 'f1', plannedDate: today }, superAdmin);
      const cancelled = await service().cancel('p1', { reason: 'Rain' });
      expect(cancelled.status).toBe('CANCELLED');
      await expect(service().update('p1', { notes: 'x' })).rejects.toBeInstanceOf(BadRequestException);
      const again = await service().cancel('p1', {});
      expect(again.status).toBe('CANCELLED');
      expect(prisma.fieldVisitPlan.update).toHaveBeenCalledTimes(1);
    });

    it('a re-sent plan (same client id) returns the existing plan instead of a duplicate', async () => {
      const id = '22222222-2222-4222-8222-222222222222';
      await service().create({ id, farmerId: 'f1', plannedDate: today } as any, superAdmin);
      plans[id] = plans.p1;
      await service().create({ id, farmerId: 'f1', plannedDate: today } as any, superAdmin);
      expect(prisma.fieldVisitPlan.create).toHaveBeenCalledTimes(1);
    });

    it('will not delete a completed plan', async () => {
      plans.p1 = { id: 'p1', status: 'COMPLETED' };
      await expect(service().remove('p1')).rejects.toBeInstanceOf(BadRequestException);
      plans.p2 = { id: 'p2', status: 'CANCELLED' };
      await expect(service().remove('p2')).resolves.toEqual({ id: 'p2', deleted: true });
    });

    it('404s an unknown plan', async () => {
      await expect(service().findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('FieldMonitoringService with plans', () => {
    const visits = () => new FieldMonitoringService(prisma);
    const visitDto = { farmerId: 'f1', branchId: 'b1', visitDate: today };

    it('records a visit exactly as before when no plan is given', async () => {
      await visits().createVisit(visitDto as any, 'u-exec');
      expect(prisma.fieldVisit.create).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.fieldVisitPlan.updateMany).not.toHaveBeenCalled();
    });

    it('completes the plan and links it to the new visit', async () => {
      plans.p1 = { id: 'p1', farmerId: 'f1', status: 'PLANNED' };
      await visits().createVisit({ ...visitDto, planId: 'p1' } as any, 'u-exec');
      expect(plans.p1).toMatchObject({ status: 'COMPLETED', completedVisitId: 'v1' });
    });

    it('refuses a plan for another farmer or one already completed', async () => {
      plans.p1 = { id: 'p1', farmerId: 'f2', status: 'PLANNED' };
      await expect(visits().createVisit({ ...visitDto, planId: 'p1' } as any, 'u')).rejects.toBeInstanceOf(BadRequestException);
      plans.p1 = { id: 'p1', farmerId: 'f1', status: 'COMPLETED' };
      await expect(visits().createVisit({ ...visitDto, planId: 'p1' } as any, 'u')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.fieldVisit.create).not.toHaveBeenCalled();
    });

    it('reopens the plan when the visit that completed it is deleted', async () => {
      plans.p1 = { id: 'p1', farmerId: 'f1', status: 'COMPLETED', completedVisitId: 'v1', completedAt: new Date() };
      await visits().removeVisit('v1');
      expect(plans.p1).toMatchObject({ status: 'PLANNED', completedVisitId: null, completedAt: null });
      expect(prisma.fieldVisit.delete).toHaveBeenCalled();
    });
  });
});
