import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentStaff } from "@/lib/auth/staff-session";

export const metadata: Metadata = {
  title: "Staff sign in",
  robots: { index: false, follow: false },
};

export default async function PosLoginPage() {
  const staff = await getCurrentStaff();
  if (staff) redirect("/pos");
  redirect("/account/login?next=%2Fpos");
}
