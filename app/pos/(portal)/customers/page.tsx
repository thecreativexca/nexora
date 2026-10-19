import type { Metadata } from "next";

import { CustomersView } from "@/components/pos/customers/CustomersView";
import { requirePermission } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { listCustomersForStaff } from "@/lib/services/customer.service";

export const metadata: Metadata = {
  title: "Customers",
  robots: { index: false, follow: false },
};

export default async function PosCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const staff = await requirePermission(STAFF_PERMISSION.ACCESS_CUSTOMERS);
  const params = await searchParams;
  const status = params.status === "active" || params.status === "inactive" ? params.status : "all";
  const page = Number.parseInt(params.page ?? "1", 10);
  const search = (params.q ?? "").trim().slice(0, 80);
  const result = await listCustomersForStaff({ search, status, page: Number.isFinite(page) ? page : 1 });

  return (
    <CustomersView
      role={staff.role}
      result={result}
      search={search}
      status={status}
      effectivePermissions={staff.effectivePermissions}
    />
  );
}
