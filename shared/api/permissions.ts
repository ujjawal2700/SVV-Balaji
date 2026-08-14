import { api } from './client';
import type { UserRole } from '../auth/types';

/** One switch on the Roles & Permissions screen. */
export interface PermissionDefinition {
  key: string;
  label: string;
  description: string;
  defaultRoles: UserRole[];
}

/** A page's worth of switches. */
export interface PermissionGroup {
  key: string;
  label: string;
  /** The panel route this group governs, when it has one. */
  path?: string;
  /** The permission that opens that page. */
  viewKey?: string;
  permissions: PermissionDefinition[];
}

export interface PermissionRegistry {
  groups: PermissionGroup[];
  assignableRoles: UserRole[];
  /** What each role gets on "reset to defaults". */
  defaults: Record<string, string[]>;
}

export interface PermissionMatrix {
  /** Role -> permission keys currently granted. */
  matrix: Record<string, string[]>;
  /** Role -> how many staff accounts hold it, so a change can be costed. */
  userCounts: Record<string, number>;
}

export const permissionsApi = {
  /** What CAN be granted. Comes from the application, not the database. */
  registry() {
    return api.get<PermissionRegistry>('/permissions').then((r) => r.data);
  },

  /** What IS granted, right now. */
  matrix() {
    return api.get<PermissionMatrix>('/permissions/matrix').then((r) => r.data);
  },

  /**
   * Replaces a role's whole set. Sending the full list rather than a delta is
   * deliberate: the screen shows everything at once, so two administrators
   * editing at the same time cannot merge into a third state neither chose.
   */
  setForRole(role: UserRole, permissions: string[]) {
    return api
      .put<{ role: string; permissions: string[] }>(`/permissions/roles/${role}`, { permissions })
      .then((r) => r.data);
  },

  resetRole(role: UserRole) {
    return api
      .post<{ role: string; permissions: string[] }>(`/permissions/roles/${role}/reset`)
      .then((r) => r.data);
  },
};
