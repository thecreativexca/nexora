import { AddStaffForm } from "@/components/pos/AddStaffForm";
import { TeamMemberActions } from "@/components/pos/TeamMemberActions";
import {
  STAFF_ROLE,
  STAFF_ROLE_LABELS,
  isAdminRole,
  staffCanChangeRole,
  staffCanManageActive,
} from "@/lib/constants/staff";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils/format";
import type { StaffView } from "@/types/staff";

/** Team Access screen: staff directory + direct account creation. */
export function TeamView({ actor, team }: { actor: StaffView; team: StaffView[] }) {
  const canAddManager = isAdminRole(actor.role);

  return (
    <div className="space-y-10">
      <section aria-labelledby="team-heading">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 id="team-heading" className="text-2xl font-bold text-slate-900">
              Team access
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Add people to help run the shop, change roles and revoke access.
            </p>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Team member</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Joined</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {team.map((member) => {
                const isSelf = member.id === actor.id;
                const canChangeRole = staffCanChangeRole(
                  actor.role,
                  actor.id,
                  member.role,
                  member.id,
                  member.role === STAFF_ROLE.MANAGER ? STAFF_ROLE.SELLER : STAFF_ROLE.MANAGER,
                );
                const canToggleActive = staffCanManageActive(
                  actor.role,
                  actor.id,
                  member.role,
                  member.id,
                );
                const canManagePermissions =
                  isAdminRole(actor.role) && !isSelf && !isAdminRole(member.role);

                return (
                  <tr key={member.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">
                        {member.name}
                        {isSelf ? <span className="ml-2 text-xs text-slate-400">(you)</span> : null}
                      </p>
                      <p className="text-slate-500">{member.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="info">{STAFF_ROLE_LABELS[member.role]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDate(member.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      {member.isActive ? (
                        <Badge tone="success">Active</Badge>
                      ) : (
                        <Badge tone="neutral">Inactive</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <TeamMemberActions
                        memberId={member.id}
                        memberName={member.name}
                        memberRole={member.role}
                        isActive={member.isActive}
                        canChangeRole={canChangeRole}
                        canToggleActive={canToggleActive}
                        canManagePermissions={canManagePermissions}
                        permissionGrants={member.permissionGrants}
                        permissionDenies={member.permissionDenies}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="add-heading" className="max-w-xl">
        <h2 id="add-heading" className="text-lg font-bold text-slate-900">
          Add a teammate
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Create an account with their email and a password. Share the credentials with
          them — they can sign in to the portal right away.
        </p>
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
          <AddStaffForm canAddManager={canAddManager} />
        </div>
      </section>
    </div>
  );
}
