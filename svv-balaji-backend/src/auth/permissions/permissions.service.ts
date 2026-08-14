import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ALL_PERMISSIONS,
  ASSIGNABLE_ROLES,
  PERMISSION_ADMIN_KEY,
  PERMISSION_KEYS,
  assertRegistryIsWellFormed,
  defaultPermissionsFor,
} from './registry';

/**
 * How long a cached grant set is trusted without re-reading the database.
 *
 * A local write invalidates the cache immediately, so this window only matters
 * when ANOTHER API instance makes the change. With one instance the effect is
 * instant; behind a load balancer the worst case is that one node keeps serving
 * the old rules for this long.
 *
 * Thirty seconds is the trade: short enough that revoking someone's access is
 * effectively immediate, long enough that the guard is not a database round
 * trip on every request. If this ever runs on more than a couple of instances,
 * replace the TTL with a Redis pub/sub invalidation rather than shortening it.
 */
const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  permissions: Set<string>;
  loadedAt: number;
}

@Injectable()
export class PermissionsService implements OnModuleInit {
  private readonly logger = new Logger(PermissionsService.name);
  private readonly cache = new Map<UserRole, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    assertRegistryIsWellFormed();
    await this.seedUnconfiguredRoles();
  }

  // --- Reads ----------------------------------------------------------------

  /**
   * Whether a role holds a permission.
   *
   * Super Admin short-circuits. This is the only place that decision is made,
   * and it is made before any database read, so an empty or broken
   * role_permissions table can never lock out administration.
   */
  async can(role: UserRole | undefined, permission: string): Promise<boolean> {
    if (!role) return false;
    if (role === UserRole.SUPER_ADMIN) return true;

    const granted = await this.permissionsFor(role);
    return granted.has(permission);
  }

  /** The effective grant set for a role, from cache when it is warm. */
  async permissionsFor(role: UserRole): Promise<Set<string>> {
    if (role === UserRole.SUPER_ADMIN) {
      return new Set(ALL_PERMISSIONS.map((p) => p.key));
    }

    const cached = this.cache.get(role);
    if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
      return cached.permissions;
    }

    const rows = await this.prisma.rolePermission.findMany({
      where: { role },
      select: { permission: true },
    });

    /**
     * Rows for permissions that no longer exist in the registry are ignored
     * rather than returned. They survive a rename or a removed feature and
     * would otherwise show up as ghost entries on the admin screen.
     */
    const permissions = new Set(
      rows.map((row) => row.permission).filter((key) => PERMISSION_KEYS.has(key)),
    );

    this.cache.set(role, { permissions, loadedAt: Date.now() });
    return permissions;
  }

  /** Sorted list form, for API responses. */
  async listFor(role: UserRole): Promise<string[]> {
    return [...(await this.permissionsFor(role))].sort();
  }

  /** Every assignable role and what it currently holds. */
  async matrix(): Promise<Record<string, string[]>> {
    const rows = await this.prisma.rolePermission.findMany({
      select: { role: true, permission: true },
    });

    const result: Record<string, string[]> = {
      [UserRole.SUPER_ADMIN]: ALL_PERMISSIONS.map((p) => p.key),
    };

    for (const role of ASSIGNABLE_ROLES) result[role] = [];

    for (const row of rows) {
      if (!PERMISSION_KEYS.has(row.permission)) continue;
      result[row.role]?.push(row.permission);
    }

    for (const role of ASSIGNABLE_ROLES) result[role].sort();
    return result;
  }

  /** How many users would be affected by changing a role. */
  async userCounts(): Promise<Record<string, number>> {
    const grouped = await this.prisma.user.groupBy({
      by: ['role'],
      _count: { _all: true },
    });

    const counts: Record<string, number> = {};
    for (const row of grouped) counts[row.role] = row._count._all;
    return counts;
  }

  // --- Writes ---------------------------------------------------------------

  /**
   * Replace a role's entire grant set.
   *
   * Deliberately a replace rather than add/remove calls: the admin screen shows
   * the whole set at once, so sending the whole set back means two people
   * editing concurrently cannot merge into a state neither of them chose.
   */
  async setForRole(role: UserRole, permissions: string[], actorId: string): Promise<string[]> {
    this.assertRoleIsEditable(role);

    const unique = [...new Set(permissions)];
    const unknown = unique.filter((key) => !PERMISSION_KEYS.has(key));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Unknown permission${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}. ` +
          'Permissions are defined in the application, not created here - a key nothing checks ' +
          'would appear to grant access and silently not.',
      );
    }

    if (unique.includes(PERMISSION_ADMIN_KEY)) {
      throw new ForbiddenException(
        `"${PERMISSION_ADMIN_KEY}" cannot be granted to another role. Anyone holding it could ` +
          'give themselves every other permission in the system, so it stays with Super Admin.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { role } }),
      this.prisma.rolePermission.createMany({
        data: unique.map((permission) => ({ role, permission })),
      }),
      this.prisma.rolePermissionState.upsert({
        where: { role },
        create: { role, updatedById: actorId },
        update: { updatedById: actorId },
      }),
    ]);

    this.invalidate(role);
    this.logger.log(`${actorId} set ${unique.length} permissions on ${role}`);
    return unique.sort();
  }

  /** Restore the defaults declared in the registry. */
  async resetRole(role: UserRole, actorId: string): Promise<string[]> {
    this.assertRoleIsEditable(role);
    return this.setForRole(role, defaultPermissionsFor(role), actorId);
  }

  // --- Seeding --------------------------------------------------------------

  /**
   * Give defaults to any role that has never been configured.
   *
   * Keyed on the state table, not on whether grants exist, so a role a Super
   * Admin has deliberately stripped bare stays bare across restarts. Runs on
   * every boot so a role added to the enum later picks up its defaults without
   * anyone remembering to seed it.
   */
  async seedUnconfiguredRoles(): Promise<UserRole[]> {
    const configured = new Set(
      (await this.prisma.rolePermissionState.findMany({ select: { role: true } })).map(
        (row) => row.role,
      ),
    );

    const missing = ASSIGNABLE_ROLES.filter((role) => !configured.has(role));
    if (missing.length === 0) return [];

    for (const role of missing) {
      const defaults = defaultPermissionsFor(role);
      await this.prisma.$transaction([
        this.prisma.rolePermission.deleteMany({ where: { role } }),
        this.prisma.rolePermission.createMany({
          data: defaults.map((permission) => ({ role, permission })),
        }),
        this.prisma.rolePermissionState.create({ data: { role } }),
      ]);
    }

    this.cache.clear();
    this.logger.log(`Seeded default permissions for: ${missing.join(', ')}`);
    return [...missing];
  }

  // --- Internals ------------------------------------------------------------

  invalidate(role?: UserRole): void {
    if (role) this.cache.delete(role);
    else this.cache.clear();
  }

  private assertRoleIsEditable(role: UserRole): void {
    if (role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Super Admin holds every permission by definition and cannot be edited. If it could, ' +
          'the last administrator could lock everyone - including themselves - out of the ' +
          'system, and there would be no way back in through the interface.',
      );
    }

    if (!ASSIGNABLE_ROLES.includes(role)) {
      throw new BadRequestException(`"${role}" is not a role permissions can be assigned to.`);
    }
  }
}
