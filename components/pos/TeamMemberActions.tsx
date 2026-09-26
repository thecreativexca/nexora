"use client";

import { useState } from "react";

import { patchJson } from "@/components/pos/api";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { AlertIcon } from "@/components/ui/icons";

interface TeamStaffUpdateResponse {
  staff: {
    id: string;
    role: string;
    isActive: boolean;
  };
}

/**
 * Per-row staff management controls. The server still enforces every rule
 * (Super-Admin targets, self-actions, Manager->Cashier only, role-change gate).
 */
export function TeamMemberActions({
  memberId,
  memberName,
  memberRole,
  isActive,
  canChangeRole,
  canToggleActive,
}: {
  memberId: string;
  memberName: string;
  memberRole: string;
  isActive: boolean;
  canChangeRole: boolean;
  canToggleActive: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState(memberRole);
  const [currentActive, setCurrentActive] = useState(isActive);

  async function run(action: { isActive?: boolean; role?: "MANAGER" | "CASHIER" }) {
    if (busy) return;

    const actionDesc = action.role
      ? `change role to ${action.role}`
      : action.isActive === false
        ? "disable access"
        : action.isActive === true
          ? "enable access"
          : "update";

    if (
      !confirm(
        `Are you sure you want to ${actionDesc} for ${memberName}? This action takes effect immediately.`,
      )
    ) {
      return;
    }

    setError(null);
    setBusy(true);

    const result = await patchJson<TeamStaffUpdateResponse>(
      `/api/staff/team/${memberId}`,
      { staffId: memberId, ...action },
    );

    if (!result.ok) {
      setError(result.message);
      setBusy(false);
      return;
    }

    setCurrentRole(result.data.staff.role);
    setCurrentActive(result.data.staff.isActive);
    setBusy(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canChangeRole && currentActive ? (
        <select
          aria-label={`Change role for ${memberName}`}
          value={currentRole}
          disabled={busy}
          onChange={(event) => void run({ role: event.target.value as "MANAGER" | "CASHIER" })}
          className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
        >
          <option value="MANAGER">Manager</option>
          <option value="CASHIER">Cashier</option>
        </select>
      ) : (
        <span className="text-xs text-slate-400">{currentRole}</span>
      )}

      {canToggleActive ? (
        <Button
          variant={currentActive ? "secondary" : "success"}
          size="sm"
          disabled={busy}
          onClick={() => void run({ isActive: !currentActive })}
        >
          {busy ? <Spinner label="Updating" /> : null}
          {currentActive ? "Deactivate" : "Activate"}
        </Button>
      ) : null}

      {error ? (
        <span className="flex items-center gap-1 text-xs font-medium text-rose-600">
          <AlertIcon className="h-3.5 w-3.5" /> {error}
        </span>
      ) : null}
    </div>
  );
}