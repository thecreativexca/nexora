import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { RegisterView } from "@/components/pos/register/RegisterView";

export const metadata: Metadata = {
  title: "Register",
  robots: { index: false, follow: false },
};

export default async function PosRegisterPage() {
  const staff = await requirePermission(STAFF_PERMISSION.ACCESS_REGISTER);

  return <RegisterView staffName={staff.name} />;
}