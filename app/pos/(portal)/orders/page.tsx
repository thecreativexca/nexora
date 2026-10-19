import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireStaff } from "@/lib/auth/staff-session";
import { OrdersView } from "@/components/pos/orders/OrdersView";
import { STAFF_PERMISSION } from "@/lib/constants/staff";

export const metadata: Metadata = {
  title: "Orders",
  robots: { index: false, follow: false },
};

export default async function PosOrdersPage() {
  const staff = await requireStaff();
  const canAccess =
    staff.effectivePermissions.includes(STAFF_PERMISSION.ACCESS_ORDERS) ||
    staff.effectivePermissions.includes(STAFF_PERMISSION.ORDERS_VIEW_OWN);
  if (!canAccess) redirect("/pos");

  return <OrdersView role={staff.role} effectivePermissions={staff.effectivePermissions} />;
}