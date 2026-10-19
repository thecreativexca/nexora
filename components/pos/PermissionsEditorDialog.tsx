"use client";

import { useState } from "react";

import { patchJson } from "@/components/pos/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CloseIcon, AlertIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import {
  STAFF_PERMISSION,
  STAFF_PERMISSION_LABELS,
  STAFF_ROLE_LABELS,
  STAFF_ROLE_PERMISSIONS,
  type StaffPermission,
  type StaffRole,
} from "@/lib/constants/staff";

interface PermissionGroup {
  name: string;
  permissions: StaffPermission[];
}

const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    name: "Dashboard & Access",
    permissions: [
      STAFF_PERMISSION.ACCESS_DASHBOARD,
      STAFF_PERMISSION.ACCESS_STORE_DASHBOARD,
    ],
  },
  {
    name: "POS & Billing",
    permissions: [
      STAFF_PERMISSION.ACCESS_REGISTER,
      STAFF_PERMISSION.POS_APPLY_DISCOUNT,
    ],
  },
  {
    name: "Inventory & Catalogue",
    permissions: [
      STAFF_PERMISSION.ACCESS_INVENTORY,
      STAFF_PERMISSION.INVENTORY_CREATE,
      STAFF_PERMISSION.INVENTORY_UPDATE,
      STAFF_PERMISSION.INVENTORY_ADJUST_STOCK,
      STAFF_PERMISSION.INVENTORY_ARCHIVE,
    ],
  },
  {
    name: "Orders",
    permissions: [
      STAFF_PERMISSION.ACCESS_ORDERS,
      STAFF_PERMISSION.ORDERS_VIEW_OWN,
      STAFF_PERMISSION.MANAGE_ORDER_STATUS,
    ],
  },
  {
    name: "Offline Payments & Refunds",
    permissions: [
      STAFF_PERMISSION.PAYMENTS_READ,
      STAFF_PERMISSION.PAYMENTS_COLLECT,
      STAFF_PERMISSION.PAYMENTS_VERIFY,
      STAFF_PERMISSION.PAYMENTS_REFUND_REQUEST,
      STAFF_PERMISSION.PAYMENTS_REFUND_APPROVE,
      STAFF_PERMISSION.ISSUE_REFUND,
    ],
  },
  {
    name: "Reports & Sales",
    permissions: [
      STAFF_PERMISSION.ACCESS_REPORTS,
      STAFF_PERMISSION.REPORTS_VIEW_OWN,
      STAFF_PERMISSION.REPORTS_EXPORT,
    ],
  },
  {
    name: "Customers & Team",
    permissions: [
      STAFF_PERMISSION.ACCESS_CUSTOMERS,
      STAFF_PERMISSION.CUSTOMERS_UPDATE,
      STAFF_PERMISSION.MANAGE_TEAM,
      STAFF_PERMISSION.MANAGE_STAFF,
      STAFF_PERMISSION.INVITE_SELLER,
    ],
  },
];

export function PermissionsEditorDialog({
  memberId,
  memberName,
  memberRole,
  initialGrants = [],
  initialDenies = [],
  onClose,
  onSaved,
}: {
  memberId: string;
  memberName: string;
  memberRole: StaffRole;
  initialGrants?: StaffPermission[];
  initialDenies?: StaffPermission[];
  onClose: () => void;
  onSaved: (grants: StaffPermission[], denies: StaffPermission[]) => void;
}) {
  const [grants, setGrants] = useState<Set<StaffPermission>>(new Set(initialGrants));
  const [denies, setDenies] = useState<Set<StaffPermission>>(new Set(initialDenies));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roleDefaults = new Set<StaffPermission>(
    STAFF_ROLE_PERMISSIONS[memberRole] ?? [],
  );

  function isEffective(permission: StaffPermission): boolean {
    if (denies.has(permission)) return false;
    if (grants.has(permission)) return true;
    return roleDefaults.has(permission);
  }

  function togglePermission(permission: StaffPermission) {
    const defaultHas = roleDefaults.has(permission);
    const currentlyActive = isEffective(permission);

    if (currentlyActive) {
      // User wants to turn it OFF
      if (defaultHas) {
        // Must add to denies
        setDenies((prev) => new Set(prev).add(permission));
      } else {
        // Just remove from grants
        setGrants((prev) => {
          const next = new Set(prev);
          next.delete(permission);
          return next;
        });
      }
    } else {
      // User wants to turn it ON
      if (defaultHas) {
        // Remove from denies
        setDenies((prev) => {
          const next = new Set(prev);
          next.delete(permission);
          return next;
        });
      } else {
        // Add to grants
        setGrants((prev) => new Set(prev).add(permission));
      }
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    const grantsArray = Array.from(grants);
    const deniesArray = Array.from(denies);

    const result = await patchJson<{ staff: { id: string } }>(
      `/api/staff/team/${memberId}`,
      {
        staffId: memberId,
        permissionGrants: grantsArray,
        permissionDenies: deniesArray,
      },
    );

    if (!result.ok) {
      setError(result.message);
      setSaving(false);
      return;
    }

    onSaved(grantsArray, deniesArray);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Configure Permissions
            </h2>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm text-slate-600">{memberName}</span>
              <Badge tone="info">{STAFF_ROLE_LABELS[memberRole]}</Badge>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-6 space-y-6">
          <p className="text-xs text-slate-500">
            Customize permissions for this account. Overrides are evaluated on top of the {STAFF_ROLE_LABELS[memberRole]} default role permissions.
          </p>

          {error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
            >
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          ) : null}

          <div className="space-y-6 divide-y divide-slate-100">
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.name} className="pt-4 first:pt-0">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  {group.name}
                </h3>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {group.permissions.map((perm) => {
                    const active = isEffective(perm);
                    const isDefault = roleDefaults.has(perm);
                    const isOverriddenGrant = grants.has(perm);
                    const isOverriddenDeny = denies.has(perm);

                    return (
                      <label
                        key={perm}
                        className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                          active
                            ? "border-indigo-200 bg-indigo-50/30"
                            : "border-slate-200 bg-slate-50/50 hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => togglePermission(perm)}
                          disabled={saving}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900 leading-tight">
                            {STAFF_PERMISSION_LABELS[perm] ?? perm}
                          </p>
                          <div className="mt-1 flex items-center gap-1.5">
                            {isOverriddenGrant ? (
                              <span className="text-[10px] font-semibold text-emerald-600 uppercase">
                                Granted override
                              </span>
                            ) : isOverriddenDeny ? (
                              <span className="text-[10px] font-semibold text-rose-600 uppercase">
                                Revoked override
                              </span>
                            ) : isDefault ? (
                              <span className="text-[10px] text-slate-400">
                                Role default
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">
                                Disabled
                              </span>
                            )}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Spinner label="Saving permissions" /> Saving...
              </>
            ) : (
              "Save Permissions"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
