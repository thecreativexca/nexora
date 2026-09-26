import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentStaff } from "@/lib/auth/staff-session";
import { JoinForm } from "@/components/pos/JoinForm";

export const metadata: Metadata = {
  title: "Join the team",
  robots: { index: false, follow: false },
};

export default async function PosJoinPage() {
  const staff = await getCurrentStaff();
  if (staff) redirect("/pos");

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900">Join with an invitation</h1>
      <div className="mt-6">
        <JoinForm />
      </div>
    </div>
  );
}