import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ErrorState } from "@/components/common/ErrorState";
import { ProductImage } from "@/components/common/ProductImage";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Price } from "@/components/ui/Price";
import { CheckIcon, TruckIcon } from "@/components/ui/icons";
import { getCurrentCustomer } from "@/lib/auth/customer-session";
import { ORDER_CHANNEL_LABELS } from "@/lib/constants/order";
import { getOrderByNumber } from "@/lib/services/order.service";
import { formatDateTime } from "@/lib/utils/format";
import { formatMoney } from "@/lib/utils/money";

export const metadata: Metadata = {
  title: "Order confirmation",
  robots: { index: false, follow: false },
};

export default async function OrderConfirmationPage({
  params,
}: PageProps<"/order/[orderNumber]">) {
  const { orderNumber } = await params;

  let order = null;
  let databaseUnavailable = false;

  try {
    order = await getOrderByNumber(orderNumber);
  } catch {
    databaseUnavailable = true;
  }

  if (databaseUnavailable) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <ErrorState
          title="We could not load this order"
          description="The order database is temporarily unavailable. Please refresh the page in a moment - your order is safe."
        />
      </div>
    );
  }

  if (!order) notFound();

  const customer = await getCurrentCustomer();
  const isOwner = Boolean(customer && order.customerId === customer.id);

  const address = order.deliveryAddress;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
            <CheckIcon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-emerald-900 sm:text-2xl">
              Payment successful · Order placed
            </h1>
            <p className="mt-1 text-sm text-emerald-800">
              Thank you, {order.customerName}. We have received your order and will call{" "}
              {order.customerPhone} before delivery.
            </p>
          </div>
        </div>

        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
              Order number
            </dt>
            <dd className="mt-1 font-mono text-lg font-bold text-emerald-900">
              {order.orderNumber}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
              Placed on
            </dt>
            <dd className="mt-1 text-sm font-medium text-emerald-900">
              {formatDateTime(order.createdAt)}
            </dd>
          </div>
        </dl>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Order status
          </h2>
          <p className="mt-2">
            <Badge tone={order.statusTone}>{order.statusLabel}</Badge>
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment</h2>
          <p className="mt-2 text-sm font-medium text-slate-900">{order.paymentMethodLabel}</p>
          <p className="text-xs text-slate-500">{order.paymentStatusLabel}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Channel</h2>
          <p className="mt-2 text-sm font-medium text-slate-900">
            {ORDER_CHANNEL_LABELS[order.channel]}
          </p>
        </div>
      </section>

      <section
        aria-labelledby="order-items"
        className="mt-6 rounded-xl border border-slate-200 bg-white"
      >
        <h2
          id="order-items"
          className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-900"
        >
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

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
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
            {order.customerEmail}
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
            <dt className="font-semibold text-slate-900">Total paid</dt>
            <dd className="font-bold text-slate-900">
              <Price amountInPaise={order.totalInPaise} />
            </dd>
          </div>
        </dl>
      </section>

      {order.notes ? (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold text-slate-900">Your notes</h2>
          <p className="mt-1 text-sm text-slate-700">{order.notes}</p>
        </section>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        {isOwner ? (
          <Link href={`/account/orders/${order.orderNumber}`} className={buttonClasses("primary", "md")}>
            Track this order
          </Link>
        ) : (
          <Link href="/products" className={buttonClasses("primary", "md")}>
            Continue shopping
          </Link>
        )}
        <Link href={isOwner ? "/account" : "/"} className={buttonClasses("secondary", "md")}>
          {isOwner ? "Go to your account" : "Back to home"}
        </Link>
      </div>

      <p className="mt-6 text-xs text-slate-500">
        Keep your order number ({order.orderNumber}) handy - our team can look this order up at any
        time.
        {isOwner ? null : (
          <>
            {" "}
            <Link href="/account/login" className="font-medium underline">
              Sign in
            </Link>{" "}
            before ordering next time to track your orders.
          </>
        )}
      </p>
    </div>
  );
}
