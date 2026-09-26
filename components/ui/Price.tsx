import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";

/** Renders an integer paise amount as currency. */
export function Price({
  amountInPaise,
  className,
}: {
  amountInPaise: number;
  className?: string;
}) {
  return (
    <span className={cn("tabular-nums", className)}>{formatMoney(amountInPaise)}</span>
  );
}
