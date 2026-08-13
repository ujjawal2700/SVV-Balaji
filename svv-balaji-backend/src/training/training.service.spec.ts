import { ConflictException, NotFoundException } from '@nestjs/common';
import { TrainingService } from './training.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Attendance is the record of which farmers were actually trained - FRD 11
 * treats it as evidence of the extension work a branch has done - so a session
 * cannot be deleted out from under it. Materials are attachments and go with
 * the session.
 */
describe('TrainingService - session maintenance', () => {
  const SESSION_ID = 's1';
  const FARMER_ID = 'f1';

  let sessions: Record<string, any>;
  let attendanceCount: number;
  let attendances: Record<string, any>;
  let materials: Record<string, any>;
  let deletedMaterialsFor: string[];
  let prisma: any;
  let service: TrainingService;

  beforeEach(() => {
    sessions = {
      [SESSION_ID]: {
        id: SESSION_ID,
        title: 'Kharif sowing best practice',
        branchId: 'b1',
        scheduledDate: new Date('2026-06-10'),
      },
    };
    attendanceCount = 0;
    attendances = { [`${SESSION_ID}:${FARMER_ID}`]: { sessionId: SESSION_ID, farmerId: FARMER_ID } };
    materials = { m1: { id: 'm1', sessionId: SESSION_ID, fileUrl: 'x', fileType: 'pdf' } };
    deletedMaterialsFor = [];

    prisma = {
      trainingSession: {
        findUnique: jest.fn(async ({ where }) => {
          const found = sessions[where.id];
          if (!found) return null;
          return { ...found, _count: { attendances: attendanceCount } };
        }),
        update: jest.fn(async ({ where, data }) => {
          const defined = Object.fromEntries(
            Object.entries(data).filter(([, v]) => v !== undefined),
          );
          sessions[where.id] = { ...sessions[where.id], ...defined };
          return sessions[where.id];
        }),
        delete: jest.fn(async ({ where }) => {
          const removed = sessions[where.id];
          delete sessions[where.id];
          return removed;
        }),
      },
      trainingAttendance: {
        findUnique: jest.fn(async ({ where }) => {
          const key = `${where.sessionId_farmerId.sessionId}:${where.sessionId_farmerId.farmerId}`;
          return attendances[key] ?? null;
        }),
        delete: jest.fn(async ({ where }) => {
          const key = `${where.sessionId_farmerId.sessionId}:${where.sessionId_farmerId.farmerId}`;
          const removed = attendances[key];
          delete attendances[key];
          return removed;
        }),
      },
      trainingMaterial: {
        findUnique: jest.fn(async ({ where }) => materials[where.id] ?? null),
        delete: jest.fn(async ({ where }) => {
          const removed = materials[where.id];
          delete materials[where.id];
          return removed;
        }),
        deleteMany: jest.fn(async ({ where }) => {
          deletedMaterialsFor.push(where.sessionId);
          return { count: 1 };
        }),
      },
      $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
    };

    service = new TrainingService(prisma as unknown as PrismaService);
  });

  it('edits a session', async () => {
    const result: any = await service.updateSession(SESSION_ID, { title: 'Rabi sowing' });
    expect(result.title).toBe('Rabi sowing');
  });

  it('deletes a session nobody attended, taking its materials with it', async () => {
    const result = await service.removeSession(SESSION_ID);
    expect(result).toEqual({ id: SESSION_ID, deleted: true });
    expect(deletedMaterialsFor).toEqual([SESSION_ID]);
  });

  it('refuses to delete a session once attendance is marked', async () => {
    attendanceCount = 12;
    await expect(service.removeSession(SESSION_ID)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.removeSession(SESSION_ID)).rejects.toThrow(/12 attendance records/);
    expect(sessions[SESSION_ID]).toBeDefined();
  });

  it('does not touch the materials when the delete is refused', async () => {
    attendanceCount = 1;
    await expect(service.removeSession(SESSION_ID)).rejects.toThrow();
    expect(deletedMaterialsFor).toEqual([]);
  });

  it('removes a farmer marked present by mistake', async () => {
    await service.removeAttendance(SESSION_ID, FARMER_ID);
    expect(attendances[`${SESSION_ID}:${FARMER_ID}`]).toBeUndefined();
  });

  it('404s when that farmer is not on the session', async () => {
    await expect(service.removeAttendance(SESSION_ID, 'not-there')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('removes a material', async () => {
    await service.removeMaterial(SESSION_ID, 'm1');
    expect(materials.m1).toBeUndefined();
  });

  it('refuses to remove a material belonging to a different session', async () => {
    materials.m1.sessionId = 'another-session';
    await expect(service.removeMaterial(SESSION_ID, 'm1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
