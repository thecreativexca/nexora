import { Badge } from "@/components/ui/Badge";
import { CheckIcon } from "@/components/ui/icons";
import {
  ORDER_STATUS,
  ORDER_STATUS_DESCRIPTIONS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  ORDER_TRACKING_STEPS,
  getOrderTrackingStepIndex,
  type OrderStatus,
} from "@/lib/constants/order";
import { cn } from "@/lib/utils/cn";

/**
 * Purely presentational delivery tracker. Status comes from the server; nothing
 * here can be manipulated to fake progress.
 */
export function OrderStatusTracker({ status }: { status: OrderStatus }) {
  const isTerminal = status === ORDER_STATUS.CANCELLED || status === ORDER_STATUS.REFUNDED;

  if (isTerminal) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <Badge tone={ORDER_STATUS_TONES[status]}>{ORDER_STATUS_LABELS[status]}</Badge>
        </div>
        <p className="mt-2 text-sm text-slate-700">{ORDER_STATUS_DESCRIPTIONS[status]}</p>
      </div>
    );
  }

  const currentIndex = getOrderTrackingStepIndex(status);

  return (
    <ol className="grid gap-3 sm:grid-cols-4">
      {ORDER_TRACKING_STEPS.map((step, index) => {
        const isComplete = index < currentIndex;
        const isCurrent = index === currentIndex;

        return (
          <li
            key={step}
            aria-current={isCurrent ? "step" : undefined}
            className={cn(
              "rounded-xl border p-3",
              isCurrent
                ? "border-slate-900 bg-slate-900 text-white"
                : isComplete
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-slate-200 bg-white text-slate-500",
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  isCurrent
                    ? "bg-white text-slate-900"
                    : isComplete
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-500",
                )}
              >
                {isComplete ? <CheckIcon className="h-4 w-4" /> : index + 1}
              </span>
              <span className="text-sm font-semibold">{ORDER_STATUS_LABELS[step]}</span>
            </div>
            <p
              className={cn(
                "mt-2 text-xs",
                isCurrent ? "text-slate-200" : isComplete ? "text-emerald-800" : "text-slate-500",
              )}
            >
              {ORDER_STATUS_DESCRIPTIONS[step]}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
