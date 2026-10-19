import type { StaffPermission, StaffRole } from "@/lib/constants/staff";

/**
 * Safe staff shape that may be sent to the browser / used in Server Components.
 * Never includes passwordHash or internal identifiers beyond _id.
 *
 * Phase 2: `effectivePermissions` carries the resolved permission set (role
 * defaults + grants - denies) so permission checks in React Server Components
 * do not need to re-query the database after the session has been loaded.
 */
export interface StaffView {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  isActive: boolean;
  /** Resolved permission set: role defaults + granted - denied. */
  effectivePermissions: StaffPermission[];
  /** Raw permission grants stored on the profile (for the permission editor). */
  permissionGrants: StaffPermission[];
  /** Raw permission denies stored on the profile (for the permission editor). */
  permissionDenies: StaffPermission[];
  lastLoginAt: string | null;
  invitedBy: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface StaffAuthResult {
  staff: StaffView;
}
