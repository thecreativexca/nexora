import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireStaff } from "@/lib/auth/staff-session";
import { ReportsView } from "@/components/pos/reports/ReportsView";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { isSellerRole } from "@/lib/constants/staff";

export const metadata: Metadata = {
  title: "Reports",
  robots: { index: false, follow: false },
};

export default async function PosReportsPage() {
  const staff = await requireStaff();
  const canAccess =
    staff.effectivePermissions.includes(STAFF_PERMISSION.ACCESS_REPORTS) ||
    staff.effectivePermissions.includes(STAFF_PERMISSION.REPORTS_VIEW_OWN);
  if (!canAccess) redirect("/pos");

  return (
    <ReportsView
      ownSalesOnly={isSellerRole(staff.role)}
      canExport={staff.effectivePermissions.includes(STAFF_PERMISSION.REPORTS_EXPORT)}
    />
  );
}
