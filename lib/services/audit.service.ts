import "server-only";

import { Types } from "mongoose";

import { connectDB } from "@/lib/db/mongodb";
import { logger } from "@/lib/utils/logger";
import { AuditLog } from "@/models/AuditLog";
import type { AuditAction } from "@/lib/constants/audit";

interface RecordAuditInput {
  /** Who performed the action; null for system/bootstrap events. */
  actorStaffId: string | null;
  action: AuditAction;
  targetStaffId?: string | null;
  /** Safe, non-secret structured metadata only. */
  metadata?: Record<string, unknown>;
}

/**
 * Writes an audit entry. NEVER blocks or fails the operation it accompanies:
 * audit logging is best-effort and must never expose secrets. Only safe values
 * (ids, emails, role names, booleans) belong in `metadata`.
 */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  try {
    await connectDB();
    await AuditLog.create({
      actorStaffId:
        input.actorStaffId && Types.ObjectId.isValid(input.actorStaffId)
          ? new Types.ObjectId(input.actorStaffId)
          : null,
      action: input.action,
      targetStaffId:
        input.targetStaffId && Types.ObjectId.isValid(input.targetStaffId)
          ? new Types.ObjectId(input.targetStaffId)
          : null,
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    logger.error("Audit log write failed", error);
  }
}