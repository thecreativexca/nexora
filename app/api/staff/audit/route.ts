import type { NextRequest } from "next/server";

import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { listAuditLogs } from "@/lib/services/audit.service";
import { toErrorResponse, toSuccessResponse } from "@/lib/utils/http";

/**
 * Audit log query endpoint.
 *
 * Guarded by AUDIT_READ permission (Admin / authorized staff only).
 * Read-only; cannot modify or delete audit entries.
 */
export async function GET(request: NextRequest) {
  try {
    await requirePermissionApi(STAFF_PERMISSION.AUDIT_READ);

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") ?? "50", 10);
    const action = searchParams.get("action") ?? undefined;
    const actorStaffId = searchParams.get("actorStaffId") ?? undefined;
    const resource = searchParams.get("resource") ?? undefined;

    const result = await listAuditLogs({
      page: isNaN(page) ? 1 : page,
      pageSize: isNaN(pageSize) ? 50 : pageSize,
      action,
      actorStaffId,
      resource,
    });

    return toSuccessResponse(result);
  } catch (error) {
    return toErrorResponse(error, "GET /api/staff/audit failed");
  }
}
