import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/staff-session";
import { ReportsView } from "@/components/pos/reports/ReportsView";
import { STAFF_PERMISSION } from "@/lib/constants/staff";

export const metadata: Metadata = {
  title: "Reports",
  robots: { index: false, follow: false },
};

export default async function PosReportsPage() {
  await requirePermission(STAFF_PERMISSION.ACCESS_REPORTS);

  return <ReportsView />;
}