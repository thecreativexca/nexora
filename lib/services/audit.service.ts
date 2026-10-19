import "server-only";

import { Types } from "mongoose";

import { connectDB } from "@/lib/db/mongodb";
import { logger } from "@/lib/utils/logger";
import { AuditLog } from "@/models/AuditLog";
import type { AuditAction } from "@/lib/constants/audit";

interface RecordAuditInput {
  /** Who performed the action; null for system/bootstrap events. */
  actorStaffId: string | null;
  actorRole?: string | null;
  action: AuditAction;
  targetStaffId?: string | null;
  resource?: string | null;
  resourceId?: string | null;
  storeId?: string | null;
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
      actorRole: input.actorRole ?? null,
      action: input.action,
      targetStaffId:
        input.targetStaffId && Types.ObjectId.isValid(input.targetStaffId)
          ? new Types.ObjectId(input.targetStaffId)
          : null,
      resource: input.resource ?? null,
      resourceId: input.resourceId ?? null,
      storeId: input.storeId ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    logger.error("Audit log write failed", error);
  }
}

interface StructuredAuditInput {
  action: AuditAction;
  actor: { staffId: string | null; role?: string | null; name?: string | null };
  target?: { type?: string | null; id?: string | null; label?: string | null };
  metadata?: Record<string, unknown>;
}

/**
 * Adapter for services that use the richer actor/target audit shape. The
 * persisted audit schema remains the single source of truth.
 */
export async function recordAuditLog(input: StructuredAuditInput): Promise<void> {
  await recordAudit({
    actorStaffId: input.actor.staffId,
    actorRole: input.actor.role ?? null,
    action: input.action,
    resource: input.target?.type ?? null,
    resourceId: input.target?.id ?? null,
    metadata: {
      ...(input.target?.label ? { targetLabel: input.target.label } : {}),
      ...(input.actor.name ? { actorName: input.actor.name } : {}),
      ...(input.metadata ?? {}),
    },
  });
}

export interface ListAuditLogsInput {
  page?: number;
  pageSize?: number;
  action?: string;
  actorStaffId?: string;
  resource?: string;
}

export async function listAuditLogs(input: ListAuditLogsInput = {}) {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 50));

  await connectDB();

  const filter: Record<string, unknown> = {};
  if (input.action) filter.action = input.action;
  if (input.actorStaffId && Types.ObjectId.isValid(input.actorStaffId)) {
    filter.actorStaffId = new Types.ObjectId(input.actorStaffId);
  }
  if (input.resource) filter.resource = input.resource;

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .populate("actorStaffId", "name email role")
      .populate("targetStaffId", "name email role")
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  return {
    logs,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
