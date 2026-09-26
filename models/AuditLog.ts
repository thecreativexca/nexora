import mongoose, { Schema, type Model, type Types } from "mongoose";

import { AUDIT_ACTION_VALUES } from "@/lib/constants/audit";
import { STAFF_PROFILE_MODEL } from "@/lib/constants/staff";

/**
 * Security/admin audit trail (Phase 3 foundation).
 *
 * Only safe, non-secret metadata is stored. Never write passwords, MFA
 * secrets, session tokens or full invitation codes to this collection.
 */
export interface AuditLogDocument {
  actorStaffId?: Types.ObjectId | null;
  action: AuditActionValue;
  targetStaffId?: Types.ObjectId | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

type AuditActionValue = (typeof AUDIT_ACTION_VALUES)[number];

const auditLogSchema = new Schema<AuditLogDocument>(
  {
    actorStaffId: {
      type: Schema.Types.ObjectId,
      ref: STAFF_PROFILE_MODEL,
      default: null,
    },
    action: {
      type: String,
      enum: AUDIT_ACTION_VALUES,
      required: true,
    },
    targetStaffId: {
      type: Schema.Types.ObjectId,
      ref: STAFF_PROFILE_MODEL,
      default: null,
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, versionKey: false },
);

auditLogSchema.index({ actorStaffId: 1, createdAt: -1 });
auditLogSchema.index({ targetStaffId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

export const AuditLog: Model<AuditLogDocument> =
  (mongoose.models.AuditLog as Model<AuditLogDocument> | undefined) ??
  mongoose.model<AuditLogDocument>("AuditLog", auditLogSchema);

export default AuditLog;