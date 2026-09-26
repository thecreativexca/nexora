import "server-only";

import { createHash, randomBytes } from "node:crypto";

import mongoose, { Types } from "mongoose";

import { hashPassword } from "@/lib/auth/password";
import { AUDIT_ACTION } from "@/lib/constants/audit";
import {
  INVITATION_TTL_MS,
  STAFF_INVITATION_STATUS,
  staffCanInviteRole,
  type StaffInvitationStatus,
  type StaffRole,
} from "@/lib/constants/staff";
import { connectDB } from "@/lib/db/mongodb";
import { recordAudit } from "@/lib/services/audit.service";
import { toDatabaseError } from "@/lib/services/service-errors";
import {
  EmailTakenError,
  ForbiddenError,
  InvitationEmailMismatchError,
  InvitationExpiredError,
  InvitationNotFoundError,
  InvitationUsedError,
  StaffManagementFailedError,
  isAppError,
  isDuplicateKeyError,
  isTransactionUnsupportedError,
  TransactionsUnsupportedError,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { normalizeEmail } from "@/lib/validations/common";
import { StaffInvitation } from "@/models/StaffInvitation";
import { StaffProfile } from "@/models/StaffProfile";
import { toStaffView, type LeanStaff } from "@/lib/services/staff.service";
import type { StaffView } from "@/types/staff";

/**
 * Invitation lifecycle.
 *
 * - The one-time code is shown to the invitee and stored ONLY as a SHA-256 hash.
 * - Code + email are checked together, and acceptance is atomic with account
 *   creation (single transaction) so an invitation can never be used twice.
 * - Only `INVITEABLE_STAFF_ROLES` (MANAGER / CASHIER) can be invited.
 */

export interface LeanInvitation {
  _id: Types.ObjectId;
  email: string;
  role: StaffRole;
  codeHash: string;
  invitedBy: Types.ObjectId;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface InvitationView {
  id: string;
  email: string;
  role: StaffRole;
  invitedBy: string | null;
  invitedByName: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  status: StaffInvitationStatus;
}

function hashInviteCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateInviteCode(): string {
  return randomBytes(12).toString("base64url");
}

function toInvitationStatus(expiresAt: Date, usedAt: Date | null): StaffInvitationStatus {
  if (usedAt) return STAFF_INVITATION_STATUS.USED;
  if (expiresAt.getTime() <= Date.now()) return STAFF_INVITATION_STATUS.EXPIRED;
  return STAFF_INVITATION_STATUS.PENDING;
}

export function toInvitationView(invitation: LeanInvitation): InvitationView {
  return {
    id: String(invitation._id),
    email: invitation.email,
    role: invitation.role,
    invitedBy: String(invitation.invitedBy),
    invitedByName: "Invited by a team member",
    createdAt: new Date(invitation.createdAt).toISOString(),
    expiresAt: new Date(invitation.expiresAt).toISOString(),
    usedAt: invitation.usedAt ? new Date(invitation.usedAt).toISOString() : null,
    status: toInvitationStatus(invitation.expiresAt, invitation.usedAt),
  };
}

async function ensureDatabase(): Promise<void> {
  try {
    await connectDB();
  } catch (error) {
    throw toDatabaseError(error);
  }
}

/**
 * Issues a new invitation. Returns the one-time code to display to the user -
 * the only moment the plaintext code exists in the system.
 */
export async function createInvitation(
  actor: StaffView,
  input: { email: string; role: StaffRole },
): Promise<{ code: string; invitation: InvitationView }> {
  await ensureDatabase();

  if (!staffCanInviteRole(actor.role, input.role)) {
    throw new ForbiddenError("You are not allowed to invite someone to that role.");
  }

  const email = normalizeEmail(input.email);

  try {
    const existingStaff = await StaffProfile.findOne({ email })
      .select("_id")
      .lean<{ _id: Types.ObjectId } | null>();
    if (existingStaff) throw new EmailTakenError("A staff member with this email already exists.");

    const pendingDuplicate = await StaffInvitation.findOne({
      email,
      usedAt: null,
      expiresAt: { $gt: new Date() },
    })
      .select("_id")
      .lean<{ _id: Types.ObjectId } | null>();
    if (pendingDuplicate) {
      throw new EmailTakenError("An invitation for this email is already pending.");
    }

    const code = generateInviteCode();
    const invitation = await StaffInvitation.create({
      email,
      role: input.role,
      codeHash: hashInviteCode(code),
      invitedBy: new Types.ObjectId(actor.id),
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      usedAt: null,
    });

    recordAudit({
      actorStaffId: actor.id,
      action: AUDIT_ACTION.STAFF_INVITATION_CREATED,
      targetStaffId: null,
      metadata: { invitedEmail: email, role: input.role },
    });

    return {
      code,
      invitation: toInvitationView(invitation.toObject() as unknown as LeanInvitation),
    };
  } catch (error) {
    if (isAppError(error)) throw error;
    if (isDuplicateKeyError(error)) {
      throw new EmailTakenError("An invitation for this email is already pending.");
    }
    logger.error("Creating staff invitation failed", error);
    throw new StaffManagementFailedError("We could not create the invitation. Please try again.", error);
  }
}

/**
 * Validates that a code belongs to the given email and is still usable.
 * Also confirms the target account still exists / is not already a staff member.
 */
export async function checkInvitation(input: {
  code: string;
  email: string;
}): Promise<{ email: string; role: StaffRole; expiresAt: string }> {
  await ensureDatabase();

  const codeHash = hashInviteCode(input.code.trim());
  const email = normalizeEmail(input.email);

  let invitation: LeanInvitation | null;
  try {
    invitation = await StaffInvitation.findOne({ codeHash }).lean<LeanInvitation | null>();
  } catch (error) {
    throw toDatabaseError(error);
  }

  if (!invitation) {
    recordAudit({
      actorStaffId: null,
      action: AUDIT_ACTION.STAFF_INVITATION_INVALID,
      metadata: { reason: "not_found" },
    });
    throw new InvitationNotFoundError();
  }
  if (invitation.usedAt) throw new InvitationUsedError();
  if (invitation.expiresAt.getTime() <= Date.now()) throw new InvitationExpiredError();
  if (invitation.email !== email) {
    throw new InvitationEmailMismatchError();
  }

  const existingStaff = await StaffProfile.findOne({ email })
    .select("_id")
    .lean<{ _id: Types.ObjectId } | null>();
  if (existingStaff) throw new EmailTakenError("A staff member with this email already exists.");

  return {
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt.toISOString(),
  };
}

export interface AcceptedInvitation {
  staff: StaffView;
  role: StaffRole;
}

/**
 * Turns the invitation into a live staff account. Account creation and
 * invitation consumption happen inside one transaction, so the code can never
 * be replayed. The password is bcrypt-hashed before it reaches the database.
 */
export async function acceptInvitation(input: {
  code: string;
  email: string;
  name: string;
  password: string;
}): Promise<AcceptedInvitation> {
  await ensureDatabase();

  const codeHash = hashInviteCode(input.code.trim());
  const email = normalizeEmail(input.email);

  let invitation: LeanInvitation | null;
  try {
    invitation = await StaffInvitation.findOne({ codeHash }).lean<LeanInvitation | null>();
  } catch (error) {
    throw toDatabaseError(error);
  }
  if (!invitation) throw new InvitationNotFoundError();
  if (invitation.usedAt) throw new InvitationUsedError();
  if (invitation.expiresAt.getTime() <= Date.now()) throw new InvitationExpiredError();
  if (invitation.email !== email) throw new InvitationEmailMismatchError();

  const passwordHash = await hashPassword(input.password);

  const session = await mongoose.startSession();
  try {
    const created = await session.withTransaction(async () => {
      // Re-read inside the transaction so a race between two accepts cannot
      // both pass the initial usedAt check.
      const invitationInTxn = await StaffInvitation.findOne({ codeHash })
        .session(session)
        .lean<LeanInvitation | null>();
      if (!invitationInTxn) throw new InvitationNotFoundError();
      if (invitationInTxn.usedAt) throw new InvitationUsedError();
      if (
        invitationInTxn.expiresAt.getTime() <= Date.now() ||
        invitationInTxn.email !== email
      ) {
        throw new InvitationExpiredError();
      }

      const [staff] = await StaffProfile.create(
        [
          {
            email: invitationInTxn.email,
            passwordHash,
            name: input.name.trim(),
            role: invitationInTxn.role,
            isActive: true,
            mfaEnabled: false,
            mfaSecretEncrypted: null,
            invitedBy: invitationInTxn.invitedBy,
            passwordChangedAt: new Date(),
          },
        ],
        { session },
      );

      await StaffInvitation.updateOne(
        { _id: invitationInTxn._id },
        { $set: { usedAt: new Date() } },
        { session },
      );

      return staff;
    });

    recordAudit({
      actorStaffId: String(created._id),
      action: AUDIT_ACTION.STAFF_ACCOUNT_CREATED,
      targetStaffId: String(created._id),
      metadata: { invitedRole: invitation.role, source: "invitation" },
    });
    recordAudit({
      actorStaffId: String(created._id),
      action: AUDIT_ACTION.STAFF_INVITATION_USED,
      targetStaffId: String(created._id),
    });

    logger.info("Staff account accepted an invitation", { staffId: String(created._id) });

    const view = toStaffView(created.toObject() as unknown as LeanStaff);
    return { staff: view, role: invitation.role };
  } catch (error) {
    if (isTransactionUnsupportedError(error)) {
      throw new TransactionsUnsupportedError(undefined, error);
    }
    if (isAppError(error)) throw error;
    if (isDuplicateKeyError(error)) throw new EmailTakenError();
    logger.error("Accepting invitation failed", error);
    throw new StaffManagementFailedError("We could not create your staff account. Please try again.", error);
  } finally {
    await session.endSession();
  }
}

/** All invitations, newest first, for the Team Access screen. */
export async function listInvitations(): Promise<InvitationView[]> {
  await ensureDatabase();
  try {
    const invitations = await StaffInvitation.find()
      .sort({ createdAt: -1 })
      .populate<{ invitedBy: { _id: Types.ObjectId; name: string } | null }>(
        "invitedBy",
        "name",
      )
      .limit(100)
      .lean<
        (LeanInvitation & { invitedBy: { _id: Types.ObjectId; name: string } | null })[]
      >();

    return invitations.map((invitation) => ({
      ...toInvitationView(invitation),
      invitedByName: invitation.invitedBy?.name ?? "A team member",
    }));
  } catch (error) {
    throw toDatabaseError(error);
  }
}