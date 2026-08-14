import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ALL_PERMISSIONS, PERMISSION_KEYS } from '../permissions/registry';
import { PermissionsService } from '../permissions/permissions.service';

/**
 * The single authority on whether a request is allowed.
 *
 * Handles both decorators during and after the migration:
 *
 *   @RequirePermission('x')  -> checked against the role's grants in the database
 *   @Roles(A, B)             -> checked against the compiled list, as before
 *   neither                  -> open to any authenticated user
 *
 * Keeping @Roles working matters: converting 87 routes in one pass and having a
 * guard that ignored the old decorator would have quietly unguarded anything
 * missed. Both are enforced, so a missed route stays locked rather than opening.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required && (!requiredRoles || requiredRoles.length === 0)) return true;

    const { user } = context.switchToHttp().getRequest();
    const role: UserRole | undefined = user?.role;

    // Legacy path, for any route still carrying @Roles().
    if (!required) {
      if (role === UserRole.SUPER_ADMIN) return true;
      if (!role || !requiredRoles!.includes(role)) {
        throw new ForbiddenException('Your role does not have access to this action.');
      }
      return true;
    }

    /**
     * A key that is not in the registry is a programming error, not a denial.
     * Reported as a 500 because returning 403 would look like a permissions
     * problem the administrator could fix from the UI - and no amount of
     * ticking boxes can grant a permission that does not exist.
     */
    if (!PERMISSION_KEYS.has(required)) {
      throw new InternalServerErrorException(
        `Route requires "${required}", which is not defined in the permission registry.`,
      );
    }

    if (await this.permissions.can(role, required)) return true;

    const definition = ALL_PERMISSIONS.find((p) => p.key === required);
    throw new ForbiddenException(
      `Your role cannot ${definition ? definition.label.toLowerCase() : `perform "${required}"`}. ` +
        'A Super Admin can grant this under Administration -> Roles & Permissions.',
    );
  }
}
