import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { BarcodePrintView } from "@/components/pos/barcodes/BarcodePrintView";

export const metadata: Metadata = {
  title: "Print Barcodes",
  robots: { index: false, follow: false },
};

export default async function PosBarcodePrintPage() {
  const staff = await requirePermission(STAFF_PERMISSION.ACCESS_INVENTORY);

  return <BarcodePrintView staffName={staff.name} />;
}
