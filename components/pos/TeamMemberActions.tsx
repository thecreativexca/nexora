"use client";

import { useState } from "react";

import { PermissionsEditorDialog } from "@/components/pos/PermissionsEditorDialog";
import { patchJson } from "@/components/pos/api";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { AlertIcon } from "@/components/ui/icons";
import {
  STAFF_ROLE,
  type StaffPermission,
  type StaffRole,
} from "@/lib/constants/staff";

interface TeamStaffUpdateResponse {
  staff: {
    id: string;
    role: StaffRole;
    isActive: boolean;
  };
}

/**
 * Per-row staff management controls. The server still enforces every rule
 * (Admin targets, self-actions, Manager->Seller only, role-change gate).
 */
export function TeamMemberActions({
  memberId,
  memberName,
  memberRole,
  isActive,
  canChangeRole,
  canToggleActive,
  canManagePermissions = false,
  permissionGrants = [],
  permissionDenies = [],
}: {
  memberId: string;
  memberName: string;
  memberRole: StaffRole;
  isActive: boolean;
  canChangeRole: boolean;
  canToggleActive: boolean;
  canManagePermissions?: boolean;
  permissionGrants?: StaffPermission[];
  permissionDenies?: StaffPermission[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<StaffRole>(memberRole);
  const [currentActive, setCurrentActive] = useState(isActive);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [grants, setGrants] = useState<StaffPermission[]>(permissionGrants);
  const [denies, setDenies] = useState<StaffPermission[]>(permissionDenies);

  async function run(action: { isActive?: boolean; role?: StaffRole }) {
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

  const roleValue =
    currentRole === STAFF_ROLE.CASHIER ? STAFF_ROLE.SELLER : currentRole;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {canChangeRole && currentActive ? (
        <select
          aria-label={`Change role for ${memberName}`}
          value={roleValue}
          disabled={busy}
          onChange={(event) => void run({ role: event.target.value as StaffRole })}
          className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 focus:border-indigo-500 focus:ring-indigo-500"
        >
          <option value={STAFF_ROLE.MANAGER}>Manager</option>
          <option value={STAFF_ROLE.SELLER}>Seller / Biller</option>
        </select>
      ) : (
        <span className="text-xs text-slate-400">{currentRole}</span>
      )}

      {canManagePermissions && currentActive ? (
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => setShowPermissionsModal(true)}
        >
          Permissions
        </Button>
      ) : null}

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

      {showPermissionsModal ? (
        <PermissionsEditorDialog
          memberId={memberId}
          memberName={memberName}
          memberRole={currentRole}
          initialGrants={grants}
          initialDenies={denies}
          onClose={() => setShowPermissionsModal(false)}
          onSaved={(newGrants, newDenies) => {
            setGrants(newGrants);
            setDenies(newDenies);
          }}
        />
      ) : null}
    </div>
  );
}