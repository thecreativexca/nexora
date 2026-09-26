import {
  STAFF_PERMISSION,
  staffHasPermission,
  type StaffPermission,
  type StaffRole,
} from "@/lib/constants/staff";

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
    href: "/pos/inventory",
    label: "Inventory",
    permission: STAFF_PERMISSION.ACCESS_INVENTORY,
    description: "Stock levels and products",
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
    description: "Invite and manage staff",
  },
];

export function getNavItems(role: StaffRole): PosNavItem[] {
  return POS_NAV_ITEMS.filter((item) => staffHasPermission(role, item.permission));
}