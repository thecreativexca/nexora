import type { Metadata } from "next";
import Link from "next/link";

import { OrderCard } from "@/components/account/OrderCard";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { buttonClasses } from "@/components/ui/Button";
import { requireCustomer } from "@/lib/auth/customer-session";
import { listCustomerOrders } from "@/lib/services/order.service";
import { pluralize } from "@/lib/utils/format";
import type { CustomerOrderSummary } from "@/types/order";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

export default async function AccountOverviewPage() {
  const customer = await requireCustomer("/account");

  let orders: CustomerOrderSummary[] = [];
  let loadFailed = false;

  try {
    orders = await listCustomerOrders(customer.id);
  } catch {
    loadFailed = true;
  }

  const firstName = customer.name.trim().split(/\s+/)[0] || "there";
  const activeOrders = orders.filter((order) => order.isActive);
  const pastOrders = orders.filter((order) => !order.isActive);
  const needsProfile = !customer.phone || !customer.address;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-bold text-slate-900">Hello, {firstName}</h2>
        <p className="mt-1 text-sm text-slate-600">
          This is everything tied to your Nexora account.
        </p>

        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Total orders
            </dt>
            <dd className="mt-1 text-2xl font-bold text-slate-900">{orders.length}</dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              In progress
            </dt>
            <dd className="mt-1 text-2xl font-bold text-slate-900">{activeOrders.length}</dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Completed
            </dt>
            <dd className="mt-1 text-2xl font-bold text-slate-900">{pastOrders.length}</dd>
          </div>
        </dl>

        {needsProfile ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
            <p>
              Add your phone and delivery address to check out faster next time.
            </p>
            <Link href="/account/profile" className={buttonClasses("secondary", "sm")}>
              Complete profile
            </Link>
          </div>
        ) : null}
      </section>

      {loadFailed ? (
        <ErrorState
          title="We could not load your orders"
          description="The order database is temporarily unavailable. Please refresh the page in a moment - your orders are safe."
        />
      ) : orders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          description="When you place an order while signed in, it will appear here so you can track it."
          action={
            <Link href="/products" className={buttonClasses("primary")}>
              Browse products
            </Link>
          }
        />
      ) : (
        <>
          {activeOrders.length > 0 ? (
            <section aria-labelledby="active-orders">
              <h2 id="active-orders" className="text-lg font-bold text-slate-900">
                Active orders
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {pluralize(activeOrders.length, "order")} on the way.
              </p>
              <div className="mt-3 grid gap-3">
                {activeOrders.map((order) => (
                  <OrderCard key={order.orderNumber} order={order} />
                ))}
              </div>
            </section>
          ) : null}

          {pastOrders.length > 0 ? (
            <section aria-labelledby="past-orders">
              <h2 id="past-orders" className="text-lg font-bold text-slate-900">
                Past orders
              </h2>
              <div className="mt-3 grid gap-3">
                {pastOrders.map((order) => (
                  <OrderCard key={order.orderNumber} order={order} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
