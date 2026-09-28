"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { patchJson } from "@/components/pos/api";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";

export function CustomerAccountActions({
  customerId,
  customerName,
  isActive,
}: {
  customerId: string;
  customerName: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [active, setActive] = useState(isActive);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleAccess() {
    const next = !active;
    const action = next ? "reactivate" : "disable";
    if (!confirm(`Are you sure you want to ${action} ${customerName}'s account?`)) return;

    setBusy(true);
    setError(null);
    const result = await patchJson<{ customer: { isActive: boolean } }>(
      `/api/staff/customers/${customerId}`,
      { customerId, isActive: next },
    );

    if (!result.ok) {
      setError(result.message);
      setBusy(false);
      return;
    }

    setActive(result.data.customer.isActive);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        size="sm"
        variant={active ? "secondary" : "success"}
        disabled={busy}
        onClick={() => void toggleAccess()}
      >
        {busy ? <Spinner label="Updating customer" /> : null}
        {active ? "Disable" : "Reactivate"}
      </Button>
      {error ? <p className="max-w-52 text-right text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
