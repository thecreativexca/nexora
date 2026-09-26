import Link from "next/link";

import { EmptyState } from "@/components/common/EmptyState";
import { buttonClasses } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
      <EmptyState
        title="That page does not exist"
        description="The link may be out of date. Browse the catalogue to find what you need."
        action={
          <Link href="/products" className={buttonClasses("primary", "md")}>
            Browse products
          </Link>
        }
      />
    </div>
  );
}
