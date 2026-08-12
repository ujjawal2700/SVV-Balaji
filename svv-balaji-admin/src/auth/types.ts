/**
 * Mirrors the `UserRole` enum in the backend's Prisma schema.
 *
 * CUSTOMER is intentionally absent: it is not an internal staff role. Consumers
 * are modelled separately (the `Customer` table) and will sign in to the B2C
 * app, not to this panel.
 *
 * If the backend adds or renames a role, this list has to change with it - that
 * is a contract change and should appear in DEV_LOG.md.
 */
export const USER_ROLES = [
  'SUPER_ADMIN',
  'BRANCH_MANAGER',
  'PROCUREMENT_MANAGER',
  'AGRICULTURE_EXPERT',
  'PRODUCTION_MANAGER',
  'QA_MANAGER',
  'WAREHOUSE_MANAGER',
  'SALES_TEAM',
  'LOGISTICS_TEAM',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

/** Human-readable role names, for the header and any user-facing copy. */
export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  BRANCH_MANAGER: 'Branch Manager',
  PROCUREMENT_MANAGER: 'Procurement Manager',
  AGRICULTURE_EXPERT: 'Agriculture Expert',
  PRODUCTION_MANAGER: 'Production Manager',
  QA_MANAGER: 'QA Manager',
  WAREHOUSE_MANAGER: 'Warehouse Manager',
  SALES_TEAM: 'Sales Team',
  LOGISTICS_TEAM: 'Logistics Team',
};

/** Shape returned by GET /auth/me. */
export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: UserRole;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  branchId: string | null;
  branch: { id: string; name: string; location: string } | null;
  createdAt: string;
}

/** Shape returned by POST /auth/login and POST /auth/refresh. */
export interface SessionResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
    branchId: string | null;
  };
}

/**
 * Super Admin holds every permission by definition (FRD 5.1), so rather than
 * listing it on every single navigation entry and route guard, it is granted
 * here once.
 */
export function hasRole(role: UserRole | undefined, allowed: readonly UserRole[]): boolean {
  if (!role) return false;
  if (role === 'SUPER_ADMIN') return true;
  return allowed.includes(role);
}
