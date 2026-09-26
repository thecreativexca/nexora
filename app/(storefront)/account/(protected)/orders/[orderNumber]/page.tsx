import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OrderStatusTracker } from "@/components/account/OrderStatusTracker";
import { ProductImage } from "@/components/common/ProductImage";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Price } from "@/components/ui/Price";
import { TruckIcon } from "@/components/ui/icons";
import { requireCustomer } from "@/lib/auth/customer-session";
import { getCustomerOrderByNumber } from "@/lib/services/order.service";
import { formatDateTime } from "@/lib/utils/format";
import { formatMoney } from "@/lib/utils/money";

export const metadata: Metadata = {
  title: "Order details",
  robots: { index: false, follow: false },
};

export default async function AccountOrderPage({
  params,
}: PageProps<"/account/orders/[orderNumber]">) {
  const customer = await requireCustomer("/account");
  const { orderNumber } = await params;

  // Scoped to the signed-in customer: another account's order number yields a 404.
  const order = await getCustomerOrderByNumber(customer.id, orderNumber);
  if (!order) notFound();

  const address = order.deliveryAddress;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/account"
          className="text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline"
        >
          ← Back to your orders
        </Link>
      </div>

      <header className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Order number
            </p>
            <p className="mt-1 font-mono text-xl font-bold text-slate-900">{order.orderNumber}</p>
            <p className="mt-1 text-sm text-slate-600">Placed on {formatDateTime(order.createdAt)}</p>
          </div>
          <Badge tone={order.statusTone}>{order.statusLabel}</Badge>
        </div>
      </header>

      <section aria-labelledby="tracking">
        <h2 id="tracking" className="mb-3 text-sm font-bold text-slate-900">
          Delivery tracking
        </h2>
        <OrderStatusTracker status={order.status} />
      </section>

      <section aria-labelledby="items" className="rounded-xl border border-slate-200 bg-white">
        <h2 id="items" className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-900">
          Items ({order.itemCount})
        </h2>
        <ul className="divide-y divide-slate-100">
          {order.items.map((item) => (
            <li key={item.productId} className="flex items-center gap-3 px-4 py-4">
              <div className="h-16 w-16 shrink-0">
                <ProductImage src={item.image} alt={item.productName} sizes="64px" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">
                  {item.productName}
                  {item.isService ? (
                    <span className="ml-1 text-xs font-medium text-emerald-700">Service</span>
                  ) : null}
                </p>
                <p className="text-xs text-slate-500">
                  SKU {item.sku} · Qty {item.quantity} · {formatMoney(item.unitPriceInPaise)} each
                </p>
              </div>
              <Price
                amountInPaise={item.lineTotalInPaise}
                className="text-sm font-semibold text-slate-900"
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <TruckIcon className="h-4 w-4 text-slate-500" />
            Delivery address
          </h2>
          <address className="mt-2 text-sm not-italic leading-6 text-slate-700">
            {order.customerName}
            <br />
            {address.line1}
            {address.line2 ? (
              <>
                <br />
                {address.line2}
              </>
            ) : null}
            <br />
            {address.city}, {address.state} {address.postalCode}
            <br />
            {address.country}
            <br />
            {order.customerPhone}
          </address>
        </div>

        <dl className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-slate-600">Subtotal</dt>
            <dd className="font-semibold text-slate-900">
              <Price amountInPaise={order.subtotalInPaise} />
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-600">Discount</dt>
            <dd className="text-slate-700">-{formatMoney(order.discountInPaise)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-600">Tax</dt>
            <dd className="text-slate-700">
              <Price amountInPaise={order.taxInPaise} />
            </dd>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-base">
            <dt className="font-semibold text-slate-900">Total</dt>
            <dd className="font-bold text-slate-900">
              <Price amountInPaise={order.totalInPaise} />
            </dd>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 pt-3">
            <dt className="text-slate-600">Payment</dt>
            <dd className="text-slate-700">
              {order.paymentMethodLabel} · {order.paymentStatusLabel}
            </dd>
          </div>
        </dl>
      </section>

      {order.notes ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold text-slate-900">Your notes</h2>
          <p className="mt-1 text-sm text-slate-700">{order.notes}</p>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Link href="/products" className={buttonClasses("primary", "md")}>
          Continue shopping
        </Link>
        <Link href="/account" className={buttonClasses("secondary", "md")}>
          All orders
        </Link>
      </div>
    </div>
  );
}
