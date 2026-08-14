import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'permission';

/**
 * Guards a route with a permission rather than a fixed list of roles.
 *
 *   @RequirePermission('farmers.approve')
 *
 * The key must exist in src/auth/permissions/registry.ts. PermissionsGuard
 * refuses to start a request against a key that does not, rather than failing
 * open - a typo here would otherwise silently unguard the route.
 *
 * This replaced @Roles() on 15 August. The old decorator is still exported and
 * still enforced, so anything not yet converted stays locked down, but nothing
 * new should use it: a role list compiled into the source is exactly what the
 * permission tables exist to remove.
 */
export const RequirePermission = (permission: string) => SetMetadata(PERMISSION_KEY, permission);
