import {
  requireStaffApi,
} from "@/lib/auth/staff-session";
import { toErrorResponse, toSuccessResponse } from "@/lib/utils/http";

/** Returns the currently signed-in staff member (or 401). */
export async function GET() {
  try {
    const staff = await requireStaffApi();
    return toSuccessResponse({ staff });
  } catch (error) {
    return toErrorResponse(error, "GET /api/staff/me failed");
  }
}