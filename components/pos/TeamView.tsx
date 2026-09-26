import { InviteStaffForm } from "@/components/pos/InviteStaffForm";
import { TeamMemberActions } from "@/components/pos/TeamMemberActions";
import {
  STAFF_INVITATION_STATUS_LABELS,
  STAFF_ROLE,
  STAFF_ROLE_LABELS,
  staffCanChangeRole,
  staffCanManageActive,
} from "@/lib/constants/staff";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils/format";
import type { InvitationView } from "@/lib/services/invitation.service";
import type { StaffView } from "@/types/staff";

function StatusToneFor(status: "PENDING" | "USED" | "EXPIRED") {
  if (status === "PENDING") return "warning" as const;
  if (status === "USED") return "neutral" as const;
  return "danger" as const;
}

/** Team Access screen: staff directory + invitation management. */
export function TeamView({
  actor,
  team,
  invitations,
}: {
  actor: StaffView;
  team: StaffView[];
  invitations: InvitationView[];
}) {
  const canInviteManager = actor.role === STAFF_ROLE.SUPER_ADMIN;

  return (
    <div className="space-y-10">
      <section aria-labelledby="team-heading">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 id="team-heading" className="text-2xl font-bold text-slate-900">
              Team access
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Invite people to help run the shop, change roles and revoke access.
            </p>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Team member</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Security</th>
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
                  member.role === STAFF_ROLE.MANAGER ? STAFF_ROLE.CASHIER : STAFF_ROLE.MANAGER,
                );
                const canToggleActive = staffCanManageActive(
                  actor.role,
                  actor.id,
                  member.role,
                  member.id,
                );

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
                    <td className="px-4 py-3">
                      {member.role !== STAFF_ROLE.CASHIER && !member.mfaEnabled ? (
                        <Badge tone="danger">MFA pending</Badge>
                      ) : member.mfaEnabled ? (
                        <Badge tone="success">MFA on</Badge>
                      ) : (
                        <span className="text-sm text-slate-500">Optional</span>
                      )}
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
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="invite-heading" className="max-w-xl">
        <h2 id="invite-heading" className="text-lg font-bold text-slate-900">
          Invite a teammate
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          They receive a one-time code (valid 7 days) to create their account. Codes are
          shown once and can never be looked up again.
        </p>
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
          <InviteStaffForm canInviteManager={canInviteManager} />
        </div>
      </section>

      <section aria-labelledby="invitations-heading">
        <h2 id="invitations-heading" className="text-lg font-bold text-slate-900">
          Invitations
        </h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Invited by</th>
                <th className="px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3 font-semibold">Expires</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invitations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    No invitations yet. Invite your first teammate above.
                  </td>
                </tr>
              ) : (
                invitations.map((invitation) => (
                  <tr key={invitation.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{invitation.email}</td>
                    <td className="px-4 py-3">{STAFF_ROLE_LABELS[invitation.role]}</td>
                    <td className="px-4 py-3 text-slate-600">{invitation.invitedByName}</td>
<td className="px-4 py-3 text-slate-600">
                        {formatDate(invitation.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDate(invitation.expiresAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={StatusToneFor(invitation.status)}>
                          {STAFF_INVITATION_STATUS_LABELS[invitation.status]}
                        </Badge>
                      </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}