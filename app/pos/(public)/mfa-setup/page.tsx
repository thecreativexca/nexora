import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getPendingStaffId } from "@/lib/auth/mfa-pending";
import { MfaSetupForm } from "@/components/pos/MfaSetupForm";
import { staffRoleRequiresMfa } from "@/lib/constants/staff";
import { getStaffViewById } from "@/lib/services/staff.service";

export const metadata: Metadata = {
  title: "Set up two-step verification",
  robots: { index: false, follow: false },
};

export default async function MfaSetupPage() {
  const staffId = await getPendingStaffId();
  if (!staffId) redirect("/pos/login");

  const staff = await getStaffViewById(staffId);
  if (!staff || !staffRoleRequiresMfa(staff.role)) redirect("/pos/login");
  if (staff.mfaEnabled) redirect("/pos/mfa/verify");

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900">Two-step verification</h1>
      <div className="mt-6">
        <MfaSetupForm />
      </div>
    </div>
  );
}