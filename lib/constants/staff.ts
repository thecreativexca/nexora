/**
 * Staff roles, permissions and session constants for the /pos portal (Phase 3).
 *
 * Everything is centralised here so plain role strings and permission checks
 * never get scattered across the codebase. Never accept a role from the
 * browser: read it from the authenticated session and validate it against the
 * database.
 */
export const STAFF_ROLE = {
  SUPER_ADMIN: "SUPER_ADMIN",
  MANAGER: "MANAGER",
  CASHIER: "CASHIER",
} as const;
export type StaffRole = (typeof STAFF_ROLE)[keyof typeof STAFF_ROLE];

export const STAFF_ROLE_VALUES = [
  STAFF_ROLE.SUPER_ADMIN,
  STAFF_ROLE.MANAGER,
  STAFF_ROLE.CASHIER,
] as const;

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  SUPER_ADMIN: "Super admin",
  MANAGER: "Manager",
  CASHIER: "Cashier",
};

/* ---------------------------------------------------------------------------
 * Permissions
 * ------------------------------------------------------------------------- */

export const STAFF_PERMISSION = {
  ACCESS_DASHBOARD: "ACCESS_DASHBOARD",
  ACCESS_REGISTER: "ACCESS_REGISTER",
  ACCESS_INVENTORY: "ACCESS_INVENTORY",
  ACCESS_ORDERS: "ACCESS_ORDERS",
  ACCESS_REPORTS: "ACCESS_REPORTS",
  ACCESS_CUSTOMERS: "ACCESS_CUSTOMERS",
  MANAGE_ORDER_STATUS: "MANAGE_ORDER_STATUS",
  ISSUE_REFUND: "ISSUE_REFUND",
  MANAGE_TEAM: "MANAGE_TEAM",
  MANAGE_STAFF: "MANAGE_STAFF",
  MANAGE_CUSTOMERS: "MANAGE_CUSTOMERS",
  INVITE_MANAGER: "INVITE_MANAGER",
  INVITE_CASHIER: "INVITE_CASHIER",
} as const;
export type StaffPermission = (typeof STAFF_PERMISSION)[keyof typeof STAFF_PERMISSION];

export const ALL_STAFF_PERMISSIONS: readonly StaffPermission[] = [
  STAFF_PERMISSION.ACCESS_DASHBOARD,
  STAFF_PERMISSION.ACCESS_REGISTER,
  STAFF_PERMISSION.ACCESS_INVENTORY,
  STAFF_PERMISSION.ACCESS_ORDERS,
  STAFF_PERMISSION.ACCESS_REPORTS,
  STAFF_PERMISSION.ACCESS_CUSTOMERS,
  STAFF_PERMISSION.MANAGE_ORDER_STATUS,
  STAFF_PERMISSION.ISSUE_REFUND,
  STAFF_PERMISSION.MANAGE_TEAM,
  STAFF_PERMISSION.MANAGE_STAFF,
  STAFF_PERMISSION.MANAGE_CUSTOMERS,
  STAFF_PERMISSION.INVITE_MANAGER,
  STAFF_PERMISSION.INVITE_CASHIER,
];

/** Coarse role -> permission map. Target-level rules are enforced in services. */
export const STAFF_ROLE_PERMISSIONS: Record<StaffRole, readonly StaffPermission[]> = {
  SUPER_ADMIN: ALL_STAFF_PERMISSIONS,
  MANAGER: [
    STAFF_PERMISSION.ACCESS_DASHBOARD,
    STAFF_PERMISSION.ACCESS_REGISTER,
    STAFF_PERMISSION.ACCESS_INVENTORY,
    STAFF_PERMISSION.ACCESS_ORDERS,
    STAFF_PERMISSION.ACCESS_REPORTS,
    STAFF_PERMISSION.ACCESS_CUSTOMERS,
    STAFF_PERMISSION.MANAGE_ORDER_STATUS,
    STAFF_PERMISSION.ISSUE_REFUND,
    STAFF_PERMISSION.MANAGE_TEAM,
    STAFF_PERMISSION.MANAGE_STAFF,
    STAFF_PERMISSION.MANAGE_CUSTOMERS,
    STAFF_PERMISSION.INVITE_CASHIER,
  ],
  CASHIER: [
    STAFF_PERMISSION.ACCESS_DASHBOARD,
    STAFF_PERMISSION.ACCESS_REGISTER,
    STAFF_PERMISSION.ACCESS_ORDERS,
    STAFF_PERMISSION.ACCESS_CUSTOMERS,
  ],
};

export function staffHasPermission(role: StaffRole, permission: StaffPermission): boolean {
  return STAFF_ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Roles an actor may invite. The role submitted from a form is never trusted -
 * this matrix is the single source of truth.
 */
export function staffCanInviteRole(actorRole: StaffRole, targetRole: StaffRole): boolean {
  if (actorRole === STAFF_ROLE.SUPER_ADMIN) {
    return targetRole === STAFF_ROLE.MANAGER || targetRole === STAFF_ROLE.CASHIER;
  }
  if (actorRole === STAFF_ROLE.MANAGER) {
    return targetRole === STAFF_ROLE.CASHIER;
  }
  return false;
}

export const INVITEABLE_STAFF_ROLES = [
  STAFF_ROLE.MANAGER,
  STAFF_ROLE.CASHIER,
] as const;

/**
 * May `actor` change the role of `target` to `newRole`?
 *
 * - Nobody may change their own role.
 * - Super-Admin accounts can never be modified by anyone.
 * - Only a Super-Admin may change roles, and only Cashier <-> Manager.
 * - A Manager can never promote anyone to Manager.
 */
export function staffCanChangeRole(
  actorRole: StaffRole,
  actorId: string,
  targetRole: StaffRole,
  targetId: string,
  newRole: StaffRole,
): boolean {
  if (actorId === targetId) return false;
  if (targetRole === STAFF_ROLE.SUPER_ADMIN) return false;
  if (newRole === STAFF_ROLE.SUPER_ADMIN) return false;
  if (actorRole !== STAFF_ROLE.SUPER_ADMIN) return false;
  return true;
}

/**
 * May `actor` activate/deactivate `target`?
 *
 * - Nobody may deactivate themselves.
 * - Super-Admin accounts can never be touched by anyone (prevents accidental
 *   lock-out of the whole board).
 * - MANAGER may only manage CASHIER accounts.
 */
export function staffCanManageActive(
  actorRole: StaffRole,
  actorId: string,
  targetRole: StaffRole,
  targetId: string,
): boolean {
  if (actorId === targetId) return false;
  if (targetRole === STAFF_ROLE.SUPER_ADMIN) return false;
  if (actorRole === STAFF_ROLE.SUPER_ADMIN) return true;
  if (actorRole === STAFF_ROLE.MANAGER) return targetRole === STAFF_ROLE.CASHIER;
  return false;
}

/** MFA is mandatory for these roles and optional for the rest (Cashier). */
export const MFA_REQUIRED_ROLES: readonly StaffRole[] = [
  STAFF_ROLE.SUPER_ADMIN,
  STAFF_ROLE.MANAGER,
];

export function staffRoleRequiresMfa(role: StaffRole): boolean {
  return MFA_REQUIRED_ROLES.includes(role);
}

/* ---------------------------------------------------------------------------
 * Session cookies
 * ------------------------------------------------------------------------- */

/**
 * HttpOnly cookie carrying the opaque staff session token. Deliberately
 * different from the customer session cookie - the two security domains never
 * share identity.
 */
export const STAFF_SESSION_COOKIE = "nexora_staff_session";
export const STAFF_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Short-lived, HMAC-signed pre-authentication cookie used while a staff member
 * completes mandatory MFA. It never grants portal access on its own.
 */
export const STAFF_MFA_PENDING_COOKIE = "nexora_staff_mfa_pending";
export const STAFF_MFA_PENDING_TTL_MS = 10 * 60 * 1000;

/* ---------------------------------------------------------------------------
 * Invitations
 * ------------------------------------------------------------------------- */

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const STAFF_INVITATION_STATUS = {
  PENDING: "PENDING",
  USED: "USED",
  EXPIRED: "EXPIRED",
} as const;
export type StaffInvitationStatus =
  (typeof STAFF_INVITATION_STATUS)[keyof typeof STAFF_INVITATION_STATUS];

export const STAFF_INVITATION_STATUS_LABELS: Record<StaffInvitationStatus, string> = {
  PENDING: "Pending",
  USED: "Used",
  EXPIRED: "Expired",
};

/* ---------------------------------------------------------------------------
 * Account security thresholds
 * ------------------------------------------------------------------------- */

export const INVALID_STAFF_CREDENTIALS_MESSAGE = "Invalid email or password.";

/** After this many consecutive failures an account is temporarily locked. */
export const MAX_LOGIN_FAILURES = 5;
export const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

/** Failed MFA attempts before the pending pre-auth state is revoked. */
export const MFA_MAX_ATTEMPTS = 5;

/** Model name used by ObjectId `ref`s for staff records. */
export const STAFF_PROFILE_MODEL = "StaffProfile";
export const CUSTOMER_MODEL = "Customer";
