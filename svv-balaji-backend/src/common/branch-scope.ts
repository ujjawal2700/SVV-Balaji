import { ForbiddenException } from '@nestjs/common';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

/**
 * FRD 5.2 — a branch user sees their branch.
 *
 * Every list endpoint used to take `branchId` as an optional *filter*: helpful
 * when you set it, absent when you did not. That is a convenience, not a
 * boundary, and it meant a Branch Manager authenticated at Hyderabad could
 * list, open and edit every farmer, collection and batch belonging to every
 * other branch. The FRD states the boundary; nothing enforced it.
 *
 * ## The rule
 *
 * - **Super Admin** — sees everything. Returns `undefined`, so no filter is applied.
 * - **Anyone else with a branch** — sees that branch only. Their own `branchId`
 *   overrides whatever the request asked for, so a hand-edited query string
 *   cannot widen it.
 * - **Anyone else without a branch** — refused.
 *
 * That last case is the one worth being deliberate about. A non-super-admin
 * with no branch assigned is a misconfigured account, and there are exactly two
 * ways to treat it: show them everything, or show them nothing. The dashboard
 * currently does the former (`user.branchId ?? undefined` falls through to
 * org-wide), which means the least-configured accounts in the system get the
 * most access — precisely backwards. Failing closed turns a data leak into a
 * support ticket, which is the trade you want.
 */
export const SUPER_ADMIN_ROLE = 'SUPER_ADMIN';

/**
 * The branch this user is confined to, or `undefined` if they are not confined.
 *
 * @throws ForbiddenException when a non-super-admin has no branch assigned.
 */
export function branchScopeFor(user: JwtPayload): string | undefined {
  if (user.role === SUPER_ADMIN_ROLE) return undefined;

  if (!user.branchId) {
    throw new ForbiddenException(
      'Your account is not assigned to a branch, so there is no set of records it can show you. ' +
        'Ask a Super Admin to assign your branch.',
    );
  }

  return user.branchId;
}

/**
 * Merge the scope into a query's `branchId`.
 *
 * Takes the caller's requested branch so a Super Admin can still narrow to one
 * branch deliberately, while a branch user's own branch always wins.
 */
export function scopedBranchId(user: JwtPayload, requested?: string): string | undefined {
  const scope = branchScopeFor(user);
  return scope ?? requested;
}

/**
 * The same rule for records that carry no `branchId` of their own.
 *
 * Agreements, seed distributions and harvest inspections belong to a farmer,
 * and the farmer belongs to a branch — so they are scoped through the relation
 * rather than a column. Returns a Prisma `where` fragment, or `{}` for a Super
 * Admin.
 */
export function scopedByFarmerBranch(user: JwtPayload): { farmer?: { branchId: string } } {
  const scope = branchScopeFor(user);
  return scope ? { farmer: { branchId: scope } } : {};
}
