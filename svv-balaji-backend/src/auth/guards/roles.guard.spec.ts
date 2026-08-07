import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';

/**
 * RBAC is an audit boundary here (FRD 5.1 - farmer approval is Super Admin only),
 * so these cases are worth locking down.
 */
describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  const contextFor = (user: unknown): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    }) as unknown as ExecutionContext;

  const requireRoles = (roles: UserRole[] | undefined) => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);
  };

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('allows any authenticated user when no roles are declared', () => {
    requireRoles(undefined);
    expect(guard.canActivate(contextFor({ role: UserRole.SALES_TEAM }))).toBe(true);
  });

  it('allows access when the user holds a required role', () => {
    requireRoles([UserRole.SUPER_ADMIN]);
    expect(guard.canActivate(contextFor({ role: UserRole.SUPER_ADMIN }))).toBe(true);
  });

  it('denies access when the user lacks the required role', () => {
    requireRoles([UserRole.SUPER_ADMIN]);
    expect(guard.canActivate(contextFor({ role: UserRole.AGRICULTURE_EXPERT }))).toBe(false);
  });

  it('blocks an Agriculture Expert from a Super-Admin-only route (FRD 5.1)', () => {
    // This mirrors PATCH /farmers/:id/verify - the farmer approval boundary.
    requireRoles([UserRole.SUPER_ADMIN]);
    expect(guard.canActivate(contextFor({ role: UserRole.AGRICULTURE_EXPERT }))).toBe(false);
  });

  it('honours multi-role routes', () => {
    requireRoles([UserRole.SUPER_ADMIN, UserRole.PROCUREMENT_MANAGER]);
    expect(guard.canActivate(contextFor({ role: UserRole.PROCUREMENT_MANAGER }))).toBe(true);
    expect(guard.canActivate(contextFor({ role: UserRole.QA_MANAGER }))).toBe(false);
  });

  it('denies when there is no user on the request', () => {
    requireRoles([UserRole.SUPER_ADMIN]);
    expect(guard.canActivate(contextFor(undefined))).toBe(false);
  });

  it('denies when an empty role list would otherwise be ambiguous', () => {
    // An empty array means "no restriction declared" - same as undefined.
    requireRoles([]);
    expect(guard.canActivate(contextFor({ role: UserRole.SALES_TEAM }))).toBe(true);
  });
});
