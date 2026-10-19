import Link from "next/link";

import { CustomerAccountActions } from "@/components/pos/customers/CustomerAccountActions";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import {
  STAFF_PERMISSION,
  staffHasPermission,
  type StaffPermission,
  type StaffRole,
} from "@/lib/constants/staff";
import { formatDate, formatDateTime, pluralize } from "@/lib/utils/format";
import { formatMoney } from "@/lib/utils/money";
import type { CustomerAdminListResult } from "@/types/customer";

function pageHref(page: number, search: string, status: string): string {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (status !== "all") params.set("status", status);
  params.set("page", String(page));
  return `/pos/customers?${params.toString()}`;
}

export function CustomersView({
  role,
  result,
  search,
  status,
  effectivePermissions,
}: {
  role: StaffRole;
  result: CustomerAdminListResult;
  search: string;
  status: "all" | "active" | "inactive";
  effectivePermissions?: StaffPermission[];
}) {
  const canManage = effectivePermissions
    ? effectivePermissions.includes(STAFF_PERMISSION.MANAGE_CUSTOMERS)
    : staffHasPermission(role, STAFF_PERMISSION.MANAGE_CUSTOMERS);

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Account directory</p>
        <h1 className="page-title mt-1 text-3xl font-bold text-slate-950">Customers</h1>
        <p className="mt-1 text-sm text-slate-600">
          Search registered accounts, review order activity{canManage ? " and control sign-in access" : ""}.
        </p>
      </section>

      <form className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:flex-row" action="/pos/customers">
        <label className="flex-1">
          <span className="sr-only">Search customers</span>
          <input
            name="q"
            defaultValue={search}
            placeholder="Search name, email or phone"
            maxLength={80}
            className="h-11 w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400"
          />
        </label>
        <label>
          <span className="sr-only">Account status</span>
          <select
            name="status"
            defaultValue={status}
            className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm"
          >
            <option value="all">All accounts</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <button className={buttonClasses("primary", "md")} type="submit">Search</button>
        {(search || status !== "all") ? (
          <Link className={buttonClasses("secondary", "md")} href="/pos/customers">Clear</Link>
        ) : null}
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 text-sm text-slate-600">
          {result.total} {pluralize(result.total, "customer")}
        </div>
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Contact</th>
              <th className="px-4 py-3 font-semibold">Orders</th>
              <th className="px-4 py-3 font-semibold">Last activity</th>
              <th className="px-4 py-3 font-semibold">Joined</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              {canManage ? <th className="px-4 py-3 text-right font-semibold">Action</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {result.customers.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 7 : 6} className="px-4 py-10 text-center text-slate-500">
                  No customer accounts match these filters.
                </td>
              </tr>
            ) : result.customers.map((customer) => (
              <tr key={customer.id} className="align-top">
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-900">{customer.name}</p>
                  <p className="text-xs text-slate-500">ID {customer.id.slice(-8).toUpperCase()}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <p>{customer.email}</p>
                  <p className="text-xs">{customer.phone || "No phone saved"}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <p>{customer.orderCount} {pluralize(customer.orderCount, "order")}</p>
                  <p className="text-xs font-medium text-slate-900">{formatMoney(customer.totalSpentInPaise)}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {customer.lastOrderAt
                    ? formatDateTime(customer.lastOrderAt)
                    : customer.lastLoginAt
                      ? `Login ${formatDateTime(customer.lastLoginAt)}`
                      : "No activity yet"}
                </td>
                <td className="px-4 py-3 text-slate-600">{formatDate(customer.createdAt)}</td>
                <td className="px-4 py-3">
                  <Badge tone={customer.isActive ? "success" : "neutral"}>
                    {customer.isActive ? "Active" : "Inactive"}
                  </Badge>
                </td>
                {canManage ? (
                  <td className="px-4 py-3 text-right">
                    <CustomerAccountActions
                      customerId={customer.id}
                      customerName={customer.name}
                      isActive={customer.isActive}
                    />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.totalPages > 1 ? (
        <nav aria-label="Customer pages" className="flex items-center justify-between gap-3">
          {result.page > 1 ? (
            <Link className={buttonClasses("secondary", "sm")} href={pageHref(result.page - 1, search, status)}>Previous</Link>
          ) : <span />}
          <p className="text-sm text-slate-600">Page <strong>{result.page}</strong> of {result.totalPages}</p>
          {result.page < result.totalPages ? (
            <Link className={buttonClasses("secondary", "sm")} href={pageHref(result.page + 1, search, status)}>Next</Link>
          ) : <span />}
        </nav>
      ) : null}
    </div>
  );
}
