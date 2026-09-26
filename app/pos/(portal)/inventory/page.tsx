import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { InventoryView } from "@/components/pos/inventory/InventoryView";

export const metadata: Metadata = {
  title: "Inventory",
  robots: { index: false, follow: false },
};

export default async function PosInventoryPage() {
  const staff = await requirePermission(STAFF_PERMISSION.ACCESS_INVENTORY);

  return <InventoryView staffName={staff.name} />;
}