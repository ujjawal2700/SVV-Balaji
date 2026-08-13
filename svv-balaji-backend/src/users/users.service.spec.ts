import { ConflictException, NotFoundException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * These tests exist because of a specific failure mode: the admin panel now
 * exposes edit, deactivate and delete on the user screen, and the person using
 * it is by definition a Super Admin. Every guard here is protecting them from
 * locking themselves - or everyone - out of the system, in a way that can only
 * be recovered by running a script against the database.
 */
describe('UsersService - edit, deactivate and delete guards', () => {
  const ADMIN_ID = 'admin-1';
  const OTHER_ADMIN_ID = 'admin-2';
  const STAFF_ID = 'staff-1';

  let users: Record<string, any>;
  let prisma: any;
  let service: UsersService;

  /** Every count relation on User, all zero unless a test says otherwise. */
  let counts: number[];

  const countStub = () => ({ __count: true });

  beforeEach(() => {
    users = {
      [ADMIN_ID]: {
        id: ADMIN_ID,
        email: 'admin@svvbalaji.com',
        fullName: 'Super Admin',
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
        passwordHash: 'hashed',
        refreshTokenHash: 'refresh',
      },
      [STAFF_ID]: {
        id: STAFF_ID,
        email: 'asha@svvbalaji.com',
        fullName: 'Asha',
        role: UserRole.PROCUREMENT_MANAGER,
        status: UserStatus.ACTIVE,
        passwordHash: 'hashed',
        refreshTokenHash: null,
      },
    };
    counts = new Array(18).fill(0);

    const counter = { count: jest.fn(async () => countStub()) };

    prisma = {
      user: {
        findUnique: jest.fn(async ({ where }) => {
          if (where.id) return users[where.id] ?? null;
          return Object.values(users).find((u: any) => u.email === where.email) ?? null;
        }),
        update: jest.fn(async ({ where, data }) => {
          // Prisma treats an undefined field as "leave it alone" rather than
          // "set it to undefined". The service relies on that to reactivate a
          // user without clearing their refresh token, so the stub has to
          // behave the same way or the test would pass against a mock that
          // does not match the database.
          const defined = Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== undefined),
          );
          users[where.id] = { ...users[where.id], ...defined };
          return users[where.id];
        }),
        delete: jest.fn(async ({ where }) => {
          const removed = users[where.id];
          delete users[where.id];
          return removed;
        }),
        count: jest.fn(async ({ where }) => {
          // Used only by assertNotLastSuperAdmin.
          return Object.values(users).filter(
            (u: any) =>
              u.id !== where.id.not &&
              u.role === where.role &&
              u.status === where.status,
          ).length;
        }),
      },
      // Every relation counted by remove(). The transaction below returns the
      // `counts` array, so the individual stubs only have to be callable.
      farmerVerificationLog: counter,
      seedDistribution: counter,
      trainingSession: counter,
      fieldVisit: counter,
      procurementPlan: counter,
      harvestInspection: counter,
      rawMaterialCollection: counter,
      stockMovement: counter,
      cleaningGradingRecord: counter,
      recipe: counter,
      productionBatch: counter,
      qualityInspection: counter,
      finishedGoodsBatch: counter,
      customer: counter,
      priceList: counter,
      order: counter,
      orderAllocation: counter,
      $transaction: jest.fn(async () => counts),
    };

    service = new UsersService(prisma as unknown as PrismaService);
  });

  // --- editing -------------------------------------------------------------

  it('never returns the password or refresh token hash', async () => {
    const result: any = await service.findOne(STAFF_ID);
    expect(result.passwordHash).toBeUndefined();
    expect(result.refreshTokenHash).toBeUndefined();
    expect(result.fullName).toBe('Asha');
  });

  it('rejects an email that already belongs to someone else', async () => {
    await expect(
      service.update(STAFF_ID, { email: 'admin@svvbalaji.com' }, ADMIN_ID),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows an edit that keeps the same email', async () => {
    const result: any = await service.update(
      STAFF_ID,
      { email: 'asha@svvbalaji.com', fullName: 'Asha Kumari' },
      ADMIN_ID,
    );
    expect(result.fullName).toBe('Asha Kumari');
  });

  it('refuses to let an admin change their own role', async () => {
    await expect(
      service.update(ADMIN_ID, { role: UserRole.SALES_TEAM }, ADMIN_ID),
    ).rejects.toThrow(/cannot change your own role/i);
  });

  it('404s on a user that does not exist', async () => {
    await expect(service.update('nope', { fullName: 'X' }, ADMIN_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  // --- the lockout guards --------------------------------------------------

  it('refuses to demote the only active Super Admin', async () => {
    await expect(
      service.update(ADMIN_ID, { role: UserRole.BRANCH_MANAGER }, OTHER_ADMIN_ID),
    ).rejects.toThrow(/only active Super Admin/i);
  });

  it('allows demotion once a second active Super Admin exists', async () => {
    users[OTHER_ADMIN_ID] = {
      id: OTHER_ADMIN_ID,
      email: 'second@svvbalaji.com',
      fullName: 'Second Admin',
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    };
    const result: any = await service.update(
      ADMIN_ID,
      { role: UserRole.BRANCH_MANAGER },
      OTHER_ADMIN_ID,
    );
    expect(result.role).toBe(UserRole.BRANCH_MANAGER);
  });

  it('does not count a suspended Super Admin as a fallback', async () => {
    users[OTHER_ADMIN_ID] = {
      id: OTHER_ADMIN_ID,
      email: 'second@svvbalaji.com',
      fullName: 'Second Admin',
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.SUSPENDED,
    };
    await expect(
      service.setStatus(ADMIN_ID, UserStatus.INACTIVE, OTHER_ADMIN_ID),
    ).rejects.toThrow(/only active Super Admin/i);
  });

  it('refuses self-deactivation', async () => {
    await expect(
      service.setStatus(ADMIN_ID, UserStatus.INACTIVE, ADMIN_ID),
    ).rejects.toThrow(/your own account/i);
  });

  it('refuses self-deletion', async () => {
    await expect(service.remove(ADMIN_ID, ADMIN_ID)).rejects.toThrow(/your own account/i);
  });

  // --- deactivation kills the session --------------------------------------

  it('clears the refresh token when a user is deactivated', async () => {
    await service.setStatus(STAFF_ID, UserStatus.SUSPENDED, ADMIN_ID);
    expect(users[STAFF_ID].refreshTokenHash).toBeNull();
    expect(users[STAFF_ID].status).toBe(UserStatus.SUSPENDED);
  });

  it('leaves the refresh token alone when reactivating', async () => {
    users[STAFF_ID].status = UserStatus.INACTIVE;
    users[STAFF_ID].refreshTokenHash = 'still-here';
    await service.setStatus(STAFF_ID, UserStatus.ACTIVE, ADMIN_ID);
    expect(users[STAFF_ID].refreshTokenHash).toBe('still-here');
  });

  it('ends every session on an administrative password reset', async () => {
    await service.resetPassword(STAFF_ID, { password: 'newpassword' });
    expect(users[STAFF_ID].refreshTokenHash).toBeNull();
    expect(users[STAFF_ID].passwordHash).not.toBe('hashed');
  });

  // --- delete --------------------------------------------------------------

  it('deletes a user who has never done anything', async () => {
    const result = await service.remove(STAFF_ID, ADMIN_ID);
    expect(result).toEqual({ id: STAFF_ID, deleted: true });
    expect(users[STAFF_ID]).toBeUndefined();
  });

  it('refuses to delete a user who has recorded work, and says which', async () => {
    counts[6] = 4; // rawMaterialCollection - the seventh count in remove()
    await expect(service.remove(STAFF_ID, ADMIN_ID)).rejects.toThrow(/4 collections/);
    expect(users[STAFF_ID]).toBeDefined();
  });

  it('keeps the audit trail intact rather than cascading it away', async () => {
    counts[0] = 1; // one farmer verification
    await expect(service.remove(STAFF_ID, ADMIN_ID)).rejects.toThrow(
      /1 farmer verification still references it/,
    );
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });
});
