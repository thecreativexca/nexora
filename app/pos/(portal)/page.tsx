import type { Metadata } from "next";

import { requireStaff } from "@/lib/auth/staff-session";
import { DashboardView } from "@/components/pos/DashboardView";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default async function PosDashboardPage() {
  const staff = await requireStaff();
  return <DashboardView staff={staff} />;
}