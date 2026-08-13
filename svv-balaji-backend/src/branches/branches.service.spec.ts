import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { BranchesService } from './branches.service';
import { PrismaService } from '../prisma/prisma.service';

describe('BranchesService - edit, deactivate and delete', () => {
  const BRANCH_ID = 'b1';

  let branches: Record<string, any>;
  let counts: number[];
  let activeUserCount: number;
  let prisma: any;
  let service: BranchesService;

  const counter = { count: jest.fn(async () => ({ __count: true })) };

  beforeEach(() => {
    branches = {
      [BRANCH_ID]: { id: BRANCH_ID, name: 'Nagpur', location: 'MH', isActive: true },
    };
    counts = new Array(11).fill(0);
    activeUserCount = 0;

    prisma = {
      branch: {
        findUnique: jest.fn(async ({ where }) => branches[where.id] ?? null),
        findMany: jest.fn(async ({ where }) =>
          Object.values(branches).filter((b: any) => !where || b.isActive === where.isActive),
        ),
        update: jest.fn(async ({ where, data }) => {
          branches[where.id] = { ...branches[where.id], ...data };
          return branches[where.id];
        }),
        delete: jest.fn(async ({ where }) => {
          const removed = branches[where.id];
          delete branches[where.id];
          return removed;
        }),
      },
      user: { count: jest.fn(async () => activeUserCount) },
      farmer: counter,
      warehouse: counter,
      trainingSession: counter,
      fieldVisit: counter,
      procurementPlan: counter,
      rawMaterialCollection: counter,
      rawMaterialBatch: counter,
      productionBatch: counter,
      customer: counter,
      order: counter,
      $transaction: jest.fn(async () => counts),
    };

    service = new BranchesService(prisma as unknown as PrismaService);
  });

  it('lists every branch by default so a deactivated one can be brought back', async () => {
    branches.b2 = { id: 'b2', name: 'Wardha', isActive: false };
    const all = await service.findAll();
    expect(all).toHaveLength(2);
  });

  it('lists only active branches when asked, which is what the pickers do', async () => {
    branches.b2 = { id: 'b2', name: 'Wardha', isActive: false };
    const active = await service.findAll(true);
    expect(active).toHaveLength(1);
  });

  it('edits a branch', async () => {
    const result: any = await service.update(BRANCH_ID, { name: 'Nagpur Central' });
    expect(result.name).toBe('Nagpur Central');
  });

  it('404s on a branch that does not exist', async () => {
    await expect(service.update('missing', { name: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deactivates a branch nobody is assigned to', async () => {
    const result: any = await service.setActive(BRANCH_ID, false);
    expect(result.isActive).toBe(false);
  });

  it('refuses to deactivate a branch with active users still on it', async () => {
    activeUserCount = 4;
    await expect(service.setActive(BRANCH_ID, false)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.setActive(BRANCH_ID, false)).rejects.toThrow(/4 active users/);
    expect(branches[BRANCH_ID].isActive).toBe(true);
  });

  it('does not check users when reactivating - only closing is guarded', async () => {
    branches[BRANCH_ID].isActive = false;
    activeUserCount = 4;
    const result: any = await service.setActive(BRANCH_ID, true);
    expect(result.isActive).toBe(true);
  });

  it('is idempotent - setting the state it already has does nothing', async () => {
    await service.setActive(BRANCH_ID, true);
    expect(prisma.branch.update).not.toHaveBeenCalled();
  });

  it('deletes a branch nothing references', async () => {
    const result = await service.remove(BRANCH_ID);
    expect(result).toEqual({ id: BRANCH_ID, deleted: true });
  });

  it('refuses to delete a branch that has farmers, and says how many', async () => {
    counts[1] = 12; // farmers
    await expect(service.remove(BRANCH_ID)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.remove(BRANCH_ID)).rejects.toThrow(/12 farmers/);
    expect(branches[BRANCH_ID]).toBeDefined();
  });

  it('reports several blockers at once rather than one at a time', async () => {
    counts[0] = 2; // users
    counts[2] = 1; // warehouses
    await expect(service.remove(BRANCH_ID)).rejects.toThrow(/2 users and 1 warehouse/);
  });
});
