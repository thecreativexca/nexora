import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/staff-session";
import { OrdersView } from "@/components/pos/orders/OrdersView";
import { STAFF_PERMISSION } from "@/lib/constants/staff";

export const metadata: Metadata = {
  title: "Orders",
  robots: { index: false, follow: false },
};

export default async function PosOrdersPage() {
  const staff = await requirePermission(STAFF_PERMISSION.ACCESS_ORDERS);

  return <OrdersView role={staff.role} />;
}