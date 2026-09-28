import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getPendingStaffId } from "@/lib/auth/mfa-pending";
import { MfaVerifyForm } from "@/components/pos/MfaVerifyForm";
import { staffRoleRequiresMfa } from "@/lib/constants/staff";
import { getStaffViewById } from "@/lib/services/staff.service";

export const metadata: Metadata = {
  title: "Two-step verification",
  robots: { index: false, follow: false },
};

export default async function MfaVerifyPage() {
  const staffId = await getPendingStaffId();
  if (!staffId) redirect("/pos/login");

  const staff = await getStaffViewById(staffId);
  if (!staff || !staffRoleRequiresMfa(staff.role)) redirect("/pos/login");

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900">Two-step verification</h1>
      <div className="mt-6">
        <MfaVerifyForm email={staff.email} />
      </div>
    </div>
  );
}