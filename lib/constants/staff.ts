/**
 * Staff roles, permissions and session constants for the /pos portal.
 *
 * Phase 2: Three-role RBAC with per-staff permission overrides.
 *
 * ROLE MAPPING (legacy -> current):
 *   SUPER_ADMIN  -> ADMIN   (highest authority, all permissions)
 *   MANAGER      -> MANAGER (configurable operational permissions)
 *   CASHIER      -> SELLER  (POS billing and offline payment collection)
 *
 * Legacy values are kept in the enum for DB backward compatibility but all
 * new code must use ADMIN and SELLER. Display them as "Admin" and "Seller / Biller".
 *
 * Everything is centralised here so plain role strings and permission checks
 * never get scattered across the codebase. Never accept a role from the
 * browser: read it from the authenticated session and validate it against the
 * database.
 */

export const STAFF_ROLE = {
  /** Highest business authority - full access to all features. */
  ADMIN: "ADMIN",
  /** @legacy alias for ADMIN kept for backward DB compatibility */
  SUPER_ADMIN: "SUPER_ADMIN",
  /** Store operations manager - configurable permissions. */
  MANAGER: "MANAGER",
  /** POS biller / seller - billing and payment collection only. */
  SELLER: "SELLER",
  /** @legacy alias for SELLER kept for backward DB compatibility */
  CASHIER: "CASHIER",
} as const;
export type StaffRole = (typeof STAFF_ROLE)[keyof typeof STAFF_ROLE];

export const STAFF_ROLE_VALUES = [
  STAFF_ROLE.ADMIN,
  STAFF_ROLE.SUPER_ADMIN,
  STAFF_ROLE.MANAGER,
  STAFF_ROLE.SELLER,
  STAFF_ROLE.CASHIER,
] as const;

/** Canonical display labels. Used in UI and receipts. */
export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  ADMIN: "Admin",
  SUPER_ADMIN: "Admin",
  MANAGER: "Manager",
  SELLER: "Seller / Biller",
  CASHIER: "Seller / Biller",
};

/** True for both canonical and legacy ADMIN values. */
export function isAdminRole(role: StaffRole): boolean {
  return role === STAFF_ROLE.ADMIN || role === STAFF_ROLE.SUPER_ADMIN;
}

/** True for both canonical and legacy SELLER values. */
export function isSellerRole(role: StaffRole): boolean {
  return role === STAFF_ROLE.SELLER || role === STAFF_ROLE.CASHIER;
}

/* ---------------------------------------------------------------------------
 * Permissions
 * Phase 2: Granular permission keys covering all business domains.
 * These are the canonical keys used in code. The DB stores overrides as
 * arrays of these strings on each StaffProfile document.
 * ------------------------------------------------------------------------- */

export const STAFF_PERMISSION = {
  // ---- Dashboard ----
  /** View the company-wide overview dashboard (revenue, staff, analytics). */
  ACCESS_DASHBOARD: "ACCESS_DASHBOARD",
  /** View the store-scoped operational dashboard. */
  ACCESS_STORE_DASHBOARD: "ACCESS_STORE_DASHBOARD",

  // ---- POS Register ----
  /** Access and operate the POS billing register. */
  ACCESS_REGISTER: "ACCESS_REGISTER",
  /** Apply discounts at the POS (requires pos.access). */
  POS_APPLY_DISCOUNT: "POS_APPLY_DISCOUNT",

  // ---- Inventory / Products ----
  /** Read inventory and product catalogue. */
  ACCESS_INVENTORY: "ACCESS_INVENTORY",
  /** Create new products. */
  INVENTORY_CREATE: "INVENTORY_CREATE",
  /** Edit existing products (name, description, image, category). */
  INVENTORY_UPDATE: "INVENTORY_UPDATE",
  /** Change product prices. */
  INVENTORY_UPDATE_PRICE: "INVENTORY_UPDATE_PRICE",
  /** Adjust stock levels manually. */
  INVENTORY_ADJUST_STOCK: "INVENTORY_ADJUST_STOCK",
  /** Archive / deactivate products. */
  INVENTORY_ARCHIVE: "INVENTORY_ARCHIVE",

  // ---- Orders ----
  /** Browse all orders. */
  ACCESS_ORDERS: "ACCESS_ORDERS",
  /** View only own POS sales (used by sellers). */
  ORDERS_VIEW_OWN: "ORDERS_VIEW_OWN",
  /** Move online orders through the delivery workflow. */
  MANAGE_ORDER_STATUS: "MANAGE_ORDER_STATUS",

  // ---- Payments ----
  /** View payment collections and history. */
  PAYMENTS_READ: "PAYMENTS_READ",
  /** Record an offline payment against an order. */
  PAYMENTS_COLLECT: "PAYMENTS_COLLECT",
  /** Verify pending payments (bank transfer / cheque clearance). */
  PAYMENTS_VERIFY: "PAYMENTS_VERIFY",
  /** Request a refund (creates an approval request). */
  PAYMENTS_REFUND_REQUEST: "PAYMENTS_REFUND_REQUEST",
  /** Approve / reject a refund request (higher authority). */
  PAYMENTS_REFUND_APPROVE: "PAYMENTS_REFUND_APPROVE",
  /** Issue an offline refund directly (no approval required). */
  ISSUE_REFUND: "ISSUE_REFUND",

  // ---- Reports ----
  /** Access sales reports and analytics. */
  ACCESS_REPORTS: "ACCESS_REPORTS",
  /** View only own sales performance. */
  REPORTS_VIEW_OWN: "REPORTS_VIEW_OWN",
  /** Export report data. */
  REPORTS_EXPORT: "REPORTS_EXPORT",

  // ---- Customers ----
  /** Browse customer accounts. */
  ACCESS_CUSTOMERS: "ACCESS_CUSTOMERS",
  /** Update customer records. */
  CUSTOMERS_UPDATE: "CUSTOMERS_UPDATE",

  // ---- Staff / Team management ----
  /** View the team list. */
  MANAGE_TEAM: "MANAGE_TEAM",
  /** Manage staff (add, edit, activate, deactivate). */
  MANAGE_STAFF: "MANAGE_STAFF",
  /** Manage customer accounts. */
  MANAGE_CUSTOMERS: "MANAGE_CUSTOMERS",
  /** Add Manager-level accounts. */
  INVITE_MANAGER: "INVITE_MANAGER",
  /** Add Seller-level accounts. */
  INVITE_SELLER: "INVITE_SELLER",
  /** @legacy kept for DB backward compatibility */
  INVITE_CASHIER: "INVITE_CASHIER",
  /** Configure permission overrides for staff. */
  MANAGE_PERMISSIONS: "MANAGE_PERMISSIONS",

  // ---- Audit ----
  /** Read audit logs. */
  AUDIT_READ: "AUDIT_READ",

  // ---- Settings ----
  /** Read system/store settings. */
  SETTINGS_READ: "SETTINGS_READ",
  /** Change system/store settings. */
  SETTINGS_UPDATE: "SETTINGS_UPDATE",
} as const;
export type StaffPermission = (typeof STAFF_PERMISSION)[keyof typeof STAFF_PERMISSION];

export const ALL_STAFF_PERMISSIONS: readonly StaffPermission[] = Object.values(STAFF_PERMISSION);

/**
 * Default permissions for each role.
 * Per-staff overrides (grants/denies) are applied on top of these defaults.
 *
 * Admin: all permissions.
 * Manager: broad operational, no global settings or permission management.
 * Seller: POS, own orders, limited payments, own reports.
 */
export const STAFF_ROLE_PERMISSIONS: Record<StaffRole, readonly StaffPermission[]> = {
  ADMIN: ALL_STAFF_PERMISSIONS,
  // Legacy alias - same as ADMIN
  SUPER_ADMIN: ALL_STAFF_PERMISSIONS,
  MANAGER: [
    STAFF_PERMISSION.ACCESS_DASHBOARD,
    STAFF_PERMISSION.ACCESS_STORE_DASHBOARD,
    STAFF_PERMISSION.ACCESS_REGISTER,
    STAFF_PERMISSION.POS_APPLY_DISCOUNT,
    STAFF_PERMISSION.ACCESS_INVENTORY,
    STAFF_PERMISSION.INVENTORY_CREATE,
    STAFF_PERMISSION.INVENTORY_UPDATE,
    STAFF_PERMISSION.INVENTORY_ADJUST_STOCK,
    STAFF_PERMISSION.ACCESS_ORDERS,
    STAFF_PERMISSION.ORDERS_VIEW_OWN,
    STAFF_PERMISSION.MANAGE_ORDER_STATUS,
    STAFF_PERMISSION.PAYMENTS_READ,
    STAFF_PERMISSION.PAYMENTS_COLLECT,
    STAFF_PERMISSION.PAYMENTS_VERIFY,
    STAFF_PERMISSION.PAYMENTS_REFUND_REQUEST,
    STAFF_PERMISSION.ISSUE_REFUND,
    STAFF_PERMISSION.ACCESS_REPORTS,
    STAFF_PERMISSION.REPORTS_VIEW_OWN,
    STAFF_PERMISSION.REPORTS_EXPORT,
    STAFF_PERMISSION.ACCESS_CUSTOMERS,
    STAFF_PERMISSION.CUSTOMERS_UPDATE,
    STAFF_PERMISSION.MANAGE_TEAM,
    STAFF_PERMISSION.MANAGE_STAFF,
    STAFF_PERMISSION.MANAGE_CUSTOMERS,
    STAFF_PERMISSION.INVITE_SELLER,
    STAFF_PERMISSION.INVITE_CASHIER,
  ],
  SELLER: [
    STAFF_PERMISSION.ACCESS_STORE_DASHBOARD,
    STAFF_PERMISSION.ACCESS_REGISTER,
    STAFF_PERMISSION.ACCESS_ORDERS,
    STAFF_PERMISSION.ORDERS_VIEW_OWN,
    STAFF_PERMISSION.PAYMENTS_COLLECT,
    STAFF_PERMISSION.REPORTS_VIEW_OWN,
    STAFF_PERMISSION.ACCESS_CUSTOMERS,
  ],
  // Legacy alias - same as SELLER
  CASHIER: [
    STAFF_PERMISSION.ACCESS_STORE_DASHBOARD,
    STAFF_PERMISSION.ACCESS_REGISTER,
    STAFF_PERMISSION.ACCESS_ORDERS,
    STAFF_PERMISSION.ORDERS_VIEW_OWN,
    STAFF_PERMISSION.PAYMENTS_COLLECT,
    STAFF_PERMISSION.REPORTS_VIEW_OWN,
    STAFF_PERMISSION.ACCESS_CUSTOMERS,
  ],
};

/**
 * Checks whether a staff role has a permission, ignoring per-staff overrides.
 * For per-staff override resolution, use `resolveStaffPermissions()` instead.
 */
export function staffHasPermission(role: StaffRole, permission: StaffPermission): boolean {
  return (STAFF_ROLE_PERMISSIONS[role] as readonly StaffPermission[]).includes(permission);
}

/**
 * Resolves effective permissions for a staff member, applying per-staff
 * grant/deny overrides on top of role defaults.
 *
 * @param role    The staff member's role.
 * @param grants  Permissions explicitly granted beyond the role default.
 * @param denies  Permissions explicitly revoked from the role default.
 */
export function resolveEffectivePermissions(
  role: StaffRole,
  grants: readonly StaffPermission[] = [],
  denies: readonly StaffPermission[] = [],
): StaffPermission[] {
  const base = new Set<StaffPermission>(STAFF_ROLE_PERMISSIONS[role]);
  for (const g of grants) base.add(g);
  for (const d of denies) base.delete(d);
  return Array.from(base);
}

/**
 * Returns true if the staff member's effective permission set includes the
 * given permission key.
 */
export function hasEffectivePermission(
  effectivePermissions: readonly StaffPermission[],
  permission: StaffPermission,
): boolean {
  return (effectivePermissions as StaffPermission[]).includes(permission);
}

/**
 * Roles an actor may add to the team. The role submitted from a form is never
 * trusted - this matrix is the single source of truth.
 */
export function staffCanAddRole(actorRole: StaffRole, targetRole: StaffRole): boolean {
  if (isAdminRole(actorRole)) {
    return targetRole === STAFF_ROLE.MANAGER || isSellerRole(targetRole);
  }
  if (actorRole === STAFF_ROLE.MANAGER) {
    return isSellerRole(targetRole);
  }
  return false;
}

export const ADDABLE_STAFF_ROLES = [
  STAFF_ROLE.MANAGER,
  STAFF_ROLE.SELLER,
  STAFF_ROLE.CASHIER,
] as const;

/**
 * May `actor` change the role of `target` to `newRole`?
 *
 * - Nobody may change their own role.
 * - Admin accounts can never be modified by non-admins.
 * - Only an Admin may change roles.
 * - Cannot promote anyone to Admin role.
 */
export function staffCanChangeRole(
  actorRole: StaffRole,
  actorId: string,
  targetRole: StaffRole,
  targetId: string,
  newRole: StaffRole,
): boolean {
  if (actorId === targetId) return false;
  if (isAdminRole(targetRole)) return false;
  if (isAdminRole(newRole)) return false;
  if (!isAdminRole(actorRole)) return false;
  return true;
}

/**
 * May `actor` activate/deactivate `target`?
 *
 * - Nobody may deactivate themselves.
 * - Admin accounts can never be touched by non-admins.
 * - Admin can manage Manager and Seller.
 * - Manager may only manage Seller accounts (when explicitly permitted).
 */
export function staffCanManageActive(
  actorRole: StaffRole,
  actorId: string,
  targetRole: StaffRole,
  targetId: string,
): boolean {
  if (actorId === targetId) return false;
  if (isAdminRole(targetRole)) return false;
  if (isAdminRole(actorRole)) return true;
  if (actorRole === STAFF_ROLE.MANAGER) return isSellerRole(targetRole);
  return false;
}

/**
 * May actor configure permission overrides for a target?
 * Only Admin can configure permissions. Never self.
 */
export function staffCanManagePermissions(
  actorRole: StaffRole,
  actorId: string,
  targetId: string,
): boolean {
  if (actorId === targetId) return false;
  return isAdminRole(actorRole);
}

/* ---------------------------------------------------------------------------
 * Session cookies
 * ------------------------------------------------------------------------- */

export const STAFF_SESSION_COOKIE = "nexora_staff_session";
export const STAFF_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/* ---------------------------------------------------------------------------
 * Account security thresholds
 * ------------------------------------------------------------------------- */

export const INVALID_STAFF_CREDENTIALS_MESSAGE = "Invalid email or password.";

export const MAX_LOGIN_FAILURES = 5;
export const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

/** Model name used by ObjectId `ref`s for staff records. */
export const STAFF_PROFILE_MODEL = "StaffProfile";
export const CUSTOMER_MODEL = "Customer";

/* ---------------------------------------------------------------------------
 * Permission display helpers
 * ------------------------------------------------------------------------- */

/** Human-readable labels for each permission (used in the Admin UI). */
export const STAFF_PERMISSION_LABELS: Record<StaffPermission, string> = {
  ACCESS_DASHBOARD: "View global dashboard",
  ACCESS_STORE_DASHBOARD: "View store dashboard",
  ACCESS_REGISTER: "Access POS register",
  POS_APPLY_DISCOUNT: "Apply discounts at POS",
  ACCESS_INVENTORY: "View inventory & products",
  INVENTORY_CREATE: "Create products",
  INVENTORY_UPDATE: "Edit product details",
  INVENTORY_UPDATE_PRICE: "Change product prices",
  INVENTORY_ADJUST_STOCK: "Adjust stock levels",
  INVENTORY_ARCHIVE: "Archive / deactivate products",
  ACCESS_ORDERS: "View all orders",
  ORDERS_VIEW_OWN: "View own sales",
  MANAGE_ORDER_STATUS: "Update order delivery status",
  PAYMENTS_READ: "View payment collections",
  PAYMENTS_COLLECT: "Record offline payments",
  PAYMENTS_VERIFY: "Verify pending payments",
  PAYMENTS_REFUND_REQUEST: "Request a refund",
  PAYMENTS_REFUND_APPROVE: "Approve / reject refunds",
  ISSUE_REFUND: "Issue refunds directly",
  ACCESS_REPORTS: "View sales reports",
  REPORTS_VIEW_OWN: "View own sales performance",
  REPORTS_EXPORT: "Export reports",
  ACCESS_CUSTOMERS: "View customer accounts",
  CUSTOMERS_UPDATE: "Edit customer records",
  MANAGE_TEAM: "View staff team",
  MANAGE_STAFF: "Manage staff accounts",
  MANAGE_CUSTOMERS: "Manage customer accounts",
  INVITE_MANAGER: "Add managers",
  INVITE_SELLER: "Add sellers",
  INVITE_CASHIER: "Add sellers (legacy)",
  MANAGE_PERMISSIONS: "Configure staff permissions",
  AUDIT_READ: "View audit logs",
  SETTINGS_READ: "View system settings",
  SETTINGS_UPDATE: "Change system settings",
};

/**
 * Groups permissions for display in the permission editor UI.
 * Each group has a label and a list of permission keys.
 */
export const STAFF_PERMISSION_GROUPS: {
  label: string;
  permissions: StaffPermission[];
}[] = [
  {
    label: "Dashboard",
    permissions: [
      STAFF_PERMISSION.ACCESS_DASHBOARD,
      STAFF_PERMISSION.ACCESS_STORE_DASHBOARD,
    ],
  },
  {
    label: "POS Register",
    permissions: [
      STAFF_PERMISSION.ACCESS_REGISTER,
      STAFF_PERMISSION.POS_APPLY_DISCOUNT,
    ],
  },
  {
    label: "Inventory & Products",
    permissions: [
      STAFF_PERMISSION.ACCESS_INVENTORY,
      STAFF_PERMISSION.INVENTORY_CREATE,
      STAFF_PERMISSION.INVENTORY_UPDATE,
      STAFF_PERMISSION.INVENTORY_UPDATE_PRICE,
      STAFF_PERMISSION.INVENTORY_ADJUST_STOCK,
      STAFF_PERMISSION.INVENTORY_ARCHIVE,
    ],
  },
  {
    label: "Orders",
    permissions: [
      STAFF_PERMISSION.ACCESS_ORDERS,
      STAFF_PERMISSION.ORDERS_VIEW_OWN,
      STAFF_PERMISSION.MANAGE_ORDER_STATUS,
    ],
  },
  {
    label: "Payments",
    permissions: [
      STAFF_PERMISSION.PAYMENTS_READ,
      STAFF_PERMISSION.PAYMENTS_COLLECT,
      STAFF_PERMISSION.PAYMENTS_VERIFY,
      STAFF_PERMISSION.PAYMENTS_REFUND_REQUEST,
      STAFF_PERMISSION.PAYMENTS_REFUND_APPROVE,
      STAFF_PERMISSION.ISSUE_REFUND,
    ],
  },
  {
    label: "Reports",
    permissions: [
      STAFF_PERMISSION.ACCESS_REPORTS,
      STAFF_PERMISSION.REPORTS_VIEW_OWN,
      STAFF_PERMISSION.REPORTS_EXPORT,
    ],
  },
  {
    label: "Customers",
    permissions: [
      STAFF_PERMISSION.ACCESS_CUSTOMERS,
      STAFF_PERMISSION.CUSTOMERS_UPDATE,
      STAFF_PERMISSION.MANAGE_CUSTOMERS,
    ],
  },
  {
    label: "Staff & Team",
    permissions: [
      STAFF_PERMISSION.MANAGE_TEAM,
      STAFF_PERMISSION.MANAGE_STAFF,
      STAFF_PERMISSION.INVITE_MANAGER,
      STAFF_PERMISSION.INVITE_SELLER,
      STAFF_PERMISSION.MANAGE_PERMISSIONS,
    ],
  },
  {
    label: "Audit & Settings",
    permissions: [
      STAFF_PERMISSION.AUDIT_READ,
      STAFF_PERMISSION.SETTINGS_READ,
      STAFF_PERMISSION.SETTINGS_UPDATE,
    ],
  },
];
