import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentStaff } from "@/lib/auth/staff-session";
import { StaffLoginForm } from "@/components/pos/StaffLoginForm";

export const metadata: Metadata = {
  title: "Staff sign in",
  robots: { index: false, follow: false },
};

export default async function PosLoginPage() {
  const staff = await getCurrentStaff();
  if (staff) redirect("/pos");

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900">Sign in</h1>
      <p className="mt-1 text-sm text-slate-600">
        Use your work email and password to open the portal.
      </p>
      <div className="mt-6">
        <StaffLoginForm />
      </div>
    </div>
  );
}
