import {
  STAFF_PERMISSION,
  STAFF_ROLE_PERMISSIONS,
  type StaffPermission,
  type StaffRole,
} from "@/lib/constants/staff";
import type { StaffView } from "@/types/staff";

/**
 * Sidebar / dashboard navigation for the /pos portal. Rendered as a list of
 * links by a client component; visibility is decided from the role at request
 * time (never from the browser).
 */
export interface PosNavItem {
  href: string;
  label: string;
  permission: StaffPermission;
  description: string;
}

export const POS_NAV_ITEMS: PosNavItem[] = [
  {
    href: "/pos",
    label: "Dashboard",
    permission: STAFF_PERMISSION.ACCESS_DASHBOARD,
    description: "Overview of today",
  },
  {
    href: "/pos/register",
    label: "Register",
    permission: STAFF_PERMISSION.ACCESS_REGISTER,
    description: "Take in-store payments",
  },
  {
    href: "/pos/orders",
    label: "Orders",
    permission: STAFF_PERMISSION.ACCESS_ORDERS,
    description: "Browse and update customer orders",
  },
  {
    href: "/pos/customers",
    label: "Customers",
    permission: STAFF_PERMISSION.ACCESS_CUSTOMERS,
    description: "Find customer accounts and order history",
  },
  {
    href: "/pos/inventory",
    label: "Inventory",
    permission: STAFF_PERMISSION.ACCESS_INVENTORY,
    description: "Stock levels and products",
  },
  {
    href: "/pos/barcodes/print",
    label: "Print Barcodes",
    permission: STAFF_PERMISSION.ACCESS_INVENTORY,
    description: "Print barcode labels for inventory",
  },
  {
    href: "/pos/reports",
    label: "Reports",
    permission: STAFF_PERMISSION.ACCESS_REPORTS,
    description: "Sales and performance",
  },
  {
    href: "/pos/team",
    label: "Team access",
    permission: STAFF_PERMISSION.MANAGE_TEAM,
    description: "Add and manage staff",
  },
];

export function getNavItems(staffOrRole: StaffView | StaffRole): PosNavItem[] {
  const permissions: readonly StaffPermission[] =
    typeof staffOrRole === "string"
      ? STAFF_ROLE_PERMISSIONS[staffOrRole] ?? []
      : staffOrRole.effectivePermissions ?? STAFF_ROLE_PERMISSIONS[staffOrRole.role] ?? [];

  return POS_NAV_ITEMS.filter((item) => {
    if (item.permission === STAFF_PERMISSION.ACCESS_DASHBOARD) {
      return (
        permissions.includes(STAFF_PERMISSION.ACCESS_DASHBOARD) ||
        permissions.includes(STAFF_PERMISSION.ACCESS_STORE_DASHBOARD)
      );
    }
    if (item.permission === STAFF_PERMISSION.ACCESS_ORDERS) {
      return (
        permissions.includes(STAFF_PERMISSION.ACCESS_ORDERS) ||
        permissions.includes(STAFF_PERMISSION.ORDERS_VIEW_OWN)
      );
    }
    if (item.permission === STAFF_PERMISSION.ACCESS_REPORTS) {
      return (
        permissions.includes(STAFF_PERMISSION.ACCESS_REPORTS) ||
        permissions.includes(STAFF_PERMISSION.REPORTS_VIEW_OWN)
      );
    }
    return permissions.includes(item.permission);
  });
}
