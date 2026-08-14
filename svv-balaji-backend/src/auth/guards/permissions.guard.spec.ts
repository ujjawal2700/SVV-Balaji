import { ExecutionContext, ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { PermissionsGuard } from './permissions.guard';

function contextFor(role?: UserRole): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

/**
 * Returns whatever the test says the route is decorated with. The guard reads
 * two keys - the permission and the legacy role list - so the stub answers on
 * the metadata key it is asked for.
 */
function reflectorWith(metadata: Record<string, unknown>): Reflector {
  return {
    getAllAndOverride: (key: string) => metadata[key],
  } as unknown as Reflector;
}

describe('PermissionsGuard', () => {
  const permissions = { can: jest.fn() };

  beforeEach(() => permissions.can.mockReset());

  it('allows a route with no decorator at all', async () => {
    const guard = new PermissionsGuard(reflectorWith({}), permissions as never);
    await expect(guard.canActivate(contextFor(UserRole.LOGISTICS_TEAM))).resolves.toBe(true);
  });

  it('allows when the role holds the permission', async () => {
    permissions.can.mockResolvedValue(true);
    const guard = new PermissionsGuard(
      reflectorWith({ permission: 'farmers.view' }),
      permissions as never,
    );

    await expect(guard.canActivate(contextFor(UserRole.AGRICULTURE_EXPERT))).resolves.toBe(true);
    expect(permissions.can).toHaveBeenCalledWith(UserRole.AGRICULTURE_EXPERT, 'farmers.view');
  });

  it('refuses with a message naming the action and where to grant it', async () => {
    permissions.can.mockResolvedValue(false);
    const guard = new PermissionsGuard(
      reflectorWith({ permission: 'farmers.approve' }),
      permissions as never,
    );

    await expect(guard.canActivate(contextFor(UserRole.SALES_TEAM))).rejects.toThrow(
      /approve a farmer.*Roles & Permissions/s,
    );
  });

  it('treats an unknown permission key as a bug, not a denial', async () => {
    // A 403 would send an administrator looking for a checkbox that cannot
    // exist. The route is asking for something the registry never defined.
    const guard = new PermissionsGuard(
      reflectorWith({ permission: 'farmers.teleport' }),
      permissions as never,
    );

    await expect(guard.canActivate(contextFor(UserRole.SUPER_ADMIN))).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(permissions.can).not.toHaveBeenCalled();
  });

  it('still enforces a legacy @Roles() route', async () => {
    // Anything not converted must stay locked rather than falling open.
    const guard = new PermissionsGuard(
      reflectorWith({ roles: [UserRole.QA_MANAGER] }),
      permissions as never,
    );

    await expect(guard.canActivate(contextFor(UserRole.QA_MANAGER))).resolves.toBe(true);
    await expect(guard.canActivate(contextFor(UserRole.SALES_TEAM))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(guard.canActivate(contextFor(UserRole.SUPER_ADMIN))).resolves.toBe(true);
  });

  it('refuses an unauthenticated request to a guarded route', async () => {
    permissions.can.mockResolvedValue(false);
    const guard = new PermissionsGuard(
      reflectorWith({ permission: 'farmers.view' }),
      permissions as never,
    );

    await expect(guard.canActivate(contextFor(undefined))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
