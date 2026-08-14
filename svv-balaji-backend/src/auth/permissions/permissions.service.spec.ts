import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PermissionsService } from './permissions.service';
import {
  ALL_PERMISSIONS,
  ASSIGNABLE_ROLES,
  PERMISSION_ADMIN_KEY,
  PERMISSION_GROUPS,
  assertRegistryIsWellFormed,
  defaultPermissionsFor,
} from './registry';

/**
 * A stand-in for the two permission tables.
 *
 * It stores rows and honours the (role, permission) uniqueness the schema
 * declares, because the service leans on `deleteMany` then `createMany` inside
 * a transaction. A mock that let duplicates through would pass tests the real
 * database would fail.
 */
function makePrisma() {
  let grants: { role: UserRole; permission: string }[] = [];
  let state: { role: UserRole }[] = [];
  let users: { role: UserRole }[] = [];

  return {
    _grants: () => grants,
    _setUsers: (rows: { role: UserRole }[]) => {
      users = rows;
    },
    rolePermission: {
      findMany: jest.fn(({ where }: any = {}) =>
        Promise.resolve(where?.role ? grants.filter((g) => g.role === where.role) : grants),
      ),
      deleteMany: jest.fn(({ where }: any) => {
        grants = grants.filter((g) => g.role !== where.role);
        return Promise.resolve({ count: 0 });
      }),
      createMany: jest.fn(({ data }: any) => {
        for (const row of data) {
          if (!grants.some((g) => g.role === row.role && g.permission === row.permission)) {
            grants.push(row);
          }
        }
        return Promise.resolve({ count: data.length });
      }),
    },
    rolePermissionState: {
      findMany: jest.fn(() => Promise.resolve(state)),
      create: jest.fn(({ data }: any) => {
        state.push({ role: data.role });
        return Promise.resolve(data);
      }),
      upsert: jest.fn(({ where }: any) => {
        if (!state.some((s) => s.role === where.role)) state.push({ role: where.role });
        return Promise.resolve({});
      }),
    },
    user: {
      groupBy: jest.fn(() =>
        Promise.resolve(
          [...new Set(users.map((u) => u.role))].map((role) => ({
            role,
            _count: { _all: users.filter((u) => u.role === role).length },
          })),
        ),
      ),
    },
    /**
     * The service passes an array of prepared operations. Prisma would run them
     * in order in one transaction; here they have already been invoked by the
     * time the array is built, so awaiting them is enough.
     */
    $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  };
}

describe('permission registry', () => {
  it('has no duplicate keys and every group points at a real view permission', () => {
    expect(() => assertRegistryIsWellFormed()).not.toThrow();
  });

  it('never grants a permission to Super Admin by default', () => {
    // Super Admin bypasses the check entirely. Listing it in defaults would
    // imply it could be revoked, which is the one state we must not reach.
    for (const permission of ALL_PERMISSIONS) {
      expect(permission.defaultRoles).not.toContain(UserRole.SUPER_ADMIN);
    }
  });

  it('keeps the permission that grants permissions to Super Admin alone', () => {
    const admin = ALL_PERMISSIONS.find((p) => p.key === PERMISSION_ADMIN_KEY);
    expect(admin).toBeDefined();
    expect(admin!.defaultRoles).toEqual([]);
  });

  it('gives every group that governs a page a view permission', () => {
    for (const group of PERMISSION_GROUPS) {
      if (!group.path) continue;
      expect(group.viewKey).toBeDefined();
      expect(group.permissions.map((p) => p.key)).toContain(group.viewKey);
    }
  });

  it('reproduces the access each role had before permissions became editable', () => {
    // Spot checks against the @Roles() decorators these defaults were read off.
    // If one of these changes, it is a deliberate change to who can do what and
    // belongs in DEV_LOG, not in a quiet edit to the registry.
    expect(defaultPermissionsFor(UserRole.AGRICULTURE_EXPERT)).toEqual(
      expect.arrayContaining(['fieldVisits.create', 'seed.create', 'training.create']),
    );
    expect(defaultPermissionsFor(UserRole.AGRICULTURE_EXPERT)).not.toContain('farmers.approve');
    expect(defaultPermissionsFor(UserRole.QA_MANAGER)).toContain('quality.release');
    expect(defaultPermissionsFor(UserRole.WAREHOUSE_MANAGER)).toContain('stock.move');
    expect(defaultPermissionsFor(UserRole.SALES_TEAM)).not.toContain('stock.move');
    // Only Super Admin approved farmers, recipes or created users.
    for (const role of ASSIGNABLE_ROLES) {
      expect(defaultPermissionsFor(role)).not.toContain('farmers.approve');
      expect(defaultPermissionsFor(role)).not.toContain('recipes.approve');
      expect(defaultPermissionsFor(role)).not.toContain('users.create');
    }
  });
});

describe('PermissionsService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: PermissionsService;

  beforeEach(async () => {
    prisma = makePrisma();
    service = new PermissionsService(prisma as never);
    await service.onModuleInit();
  });

  it('seeds defaults for every assignable role on first boot', async () => {
    for (const role of ASSIGNABLE_ROLES) {
      const granted = await service.listFor(role);
      expect(granted).toEqual(defaultPermissionsFor(role).sort());
    }
  });

  it('does not hand defaults back to a role that was deliberately stripped bare', async () => {
    await service.setForRole(UserRole.SALES_TEAM, [], 'actor-1');
    expect(await service.listFor(UserRole.SALES_TEAM)).toEqual([]);

    // A restart re-runs the seeder. The state row is what stops it undoing the
    // administrator's decision.
    const seeded = await service.seedUnconfiguredRoles();
    expect(seeded).toEqual([]);
    expect(await service.listFor(UserRole.SALES_TEAM)).toEqual([]);
  });

  it('lets Super Admin do everything without reading the database', async () => {
    prisma.rolePermission.findMany.mockClear();
    expect(await service.can(UserRole.SUPER_ADMIN, 'farmers.approve')).toBe(true);
    expect(await service.can(UserRole.SUPER_ADMIN, 'rolePermissions.manage')).toBe(true);
    expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
  });

  it('denies a role nothing was granted to', async () => {
    expect(await service.can(UserRole.LOGISTICS_TEAM, 'farmers.approve')).toBe(false);
    expect(await service.can(undefined, 'farmers.view')).toBe(false);
  });

  it('grants access as soon as the permission is added', async () => {
    expect(await service.can(UserRole.LOGISTICS_TEAM, 'farmers.view')).toBe(false);

    await service.setForRole(UserRole.LOGISTICS_TEAM, ['farmers.view'], 'actor-1');

    // No waiting for a token to expire: the write invalidates the cache, so the
    // very next check sees it. This is the property that justifies not putting
    // permissions in the JWT.
    expect(await service.can(UserRole.LOGISTICS_TEAM, 'farmers.view')).toBe(true);
  });

  it('revokes access as soon as the permission is removed', async () => {
    expect(await service.can(UserRole.AGRICULTURE_EXPERT, 'fieldVisits.create')).toBe(true);
    await service.setForRole(UserRole.AGRICULTURE_EXPERT, ['fieldVisits.view'], 'actor-1');
    expect(await service.can(UserRole.AGRICULTURE_EXPERT, 'fieldVisits.create')).toBe(false);
    expect(await service.can(UserRole.AGRICULTURE_EXPERT, 'fieldVisits.view')).toBe(true);
  });

  it('replaces the whole set rather than merging', async () => {
    await service.setForRole(UserRole.SALES_TEAM, ['orders.view'], 'actor-1');
    expect(await service.listFor(UserRole.SALES_TEAM)).toEqual(['orders.view']);
  });

  it('refuses a permission key that no route checks', async () => {
    await expect(
      service.setForRole(UserRole.SALES_TEAM, ['orders.view', 'orders.teleport'], 'actor-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    // And nothing was written - the whole set is validated before any of it.
    expect(await service.listFor(UserRole.SALES_TEAM)).toEqual(
      defaultPermissionsFor(UserRole.SALES_TEAM).sort(),
    );
  });

  it('refuses to give another role the power to grant permissions', async () => {
    await expect(
      service.setForRole(UserRole.BRANCH_MANAGER, [PERMISSION_ADMIN_KEY], 'actor-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses to edit Super Admin at all', async () => {
    await expect(service.setForRole(UserRole.SUPER_ADMIN, [], 'actor-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.resetRole(UserRole.SUPER_ADMIN, 'actor-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('restores the defaults on reset', async () => {
    await service.setForRole(UserRole.QA_MANAGER, [], 'actor-1');
    expect(await service.listFor(UserRole.QA_MANAGER)).toEqual([]);

    await service.resetRole(UserRole.QA_MANAGER, 'actor-1');
    expect(await service.listFor(UserRole.QA_MANAGER)).toEqual(
      defaultPermissionsFor(UserRole.QA_MANAGER).sort(),
    );
  });

  it('ignores stored rows for permissions that no longer exist', async () => {
    // Survives a renamed or removed feature. They would otherwise appear as
    // ghost entries on the admin screen with no label to render.
    prisma.rolePermission.createMany({
      data: [{ role: UserRole.SALES_TEAM, permission: 'orders.teleport' }],
    });
    service.invalidate();

    expect(await service.listFor(UserRole.SALES_TEAM)).not.toContain('orders.teleport');
  });

  it('reports how many users a change would affect', async () => {
    prisma._setUsers([
      { role: UserRole.SALES_TEAM },
      { role: UserRole.SALES_TEAM },
      { role: UserRole.QA_MANAGER },
    ]);

    const counts = await service.userCounts();
    expect(counts[UserRole.SALES_TEAM]).toBe(2);
    expect(counts[UserRole.QA_MANAGER]).toBe(1);
  });

  it('returns a complete matrix including Super Admin', async () => {
    const matrix = await service.matrix();
    expect(Object.keys(matrix)).toEqual(
      expect.arrayContaining([UserRole.SUPER_ADMIN, ...ASSIGNABLE_ROLES]),
    );
    expect(matrix[UserRole.SUPER_ADMIN]).toHaveLength(ALL_PERMISSIONS.length);
  });
});
