import Link from "next/link";

import { EmptyState } from "@/components/common/EmptyState";
import { buttonClasses } from "@/components/ui/Button";

/** Shown for an unknown or malformed order number. */
export default function OrderNotFound() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
      <EmptyState
        title="We could not find that order"
        description="Order numbers look like NX-20260921-K7M2QF. Please check the number from your confirmation screen, or contact the store and we will look it up for you."
        action={
          <Link href="/products" className={buttonClasses("primary", "md")}>
            Continue shopping
          </Link>
        }
      />
    </div>
  );
}
