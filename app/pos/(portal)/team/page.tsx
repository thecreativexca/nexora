import type { Metadata } from "next";

import { TeamView } from "@/components/pos/TeamView";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { requirePermission } from "@/lib/auth/staff-session";
import { listStaff } from "@/lib/services/staff.service";

export const metadata: Metadata = {
  title: "Team access",
  robots: { index: false, follow: false },
};

export default async function PosTeamPage() {
  const actor = await requirePermission(STAFF_PERMISSION.MANAGE_TEAM);
  const team = await listStaff();

  return <TeamView actor={actor} team={team} />;
}
