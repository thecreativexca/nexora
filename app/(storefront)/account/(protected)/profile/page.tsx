import type { Metadata } from "next";

import { ProfileForm } from "@/components/account/ProfileForm";
import { requireCustomer } from "@/lib/auth/customer-session";

export const metadata: Metadata = {
  title: "Your profile",
  robots: { index: false, follow: false },
};

export default async function AccountProfilePage() {
  const customer = await requireCustomer("/account/profile");

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-bold text-slate-900">Profile</h2>
      <p className="mt-1 text-sm text-slate-600">
        Changing your details here never alters the address or contact details saved on past orders.
      </p>
      <div className="mt-5">
        <ProfileForm customer={customer} />
      </div>
    </div>
  );
}
