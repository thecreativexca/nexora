import { NextRequest } from "next/server";

import { requireStaffApi } from "@/lib/auth/staff-session";
import { isSellerRole } from "@/lib/constants/staff";
import {
  createExpense,
  listExpenses,
  type CreateExpenseInput,
} from "@/lib/services/expense.service";
import { BadRequestError, ForbiddenError } from "@/lib/utils/errors";
import { toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import type { ExpenseCategory, ExpenseStatus } from "@/models/Expense";

export async function GET(request: NextRequest) {
  let staff: Awaited<ReturnType<typeof requireStaffApi>>;
  try {
    staff = await requireStaffApi();
    if (isSellerRole(staff.role)) {
      throw new ForbiddenError("Sellers do not have access to expense records.");
    }
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/expenses auth");
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get("category") as ExpenseCategory | undefined;
    const status = searchParams.get("status") as ExpenseStatus | undefined;
    const storeId = searchParams.get("storeId") || undefined;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);

    const result = await listExpenses({ category, status, storeId, page, pageSize }, staff);
    return toSuccessResponse(result);
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/expenses failed");
  }
}

export async function POST(request: NextRequest) {
  let staff: Awaited<ReturnType<typeof requireStaffApi>>;
  try {
    staff = await requireStaffApi();
    if (isSellerRole(staff.role)) {
      throw new ForbiddenError("Sellers cannot record expenses.");
    }
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/expenses auth");
  }

  try {
    const body = (await request.json()) as CreateExpenseInput;
    if (!body || typeof body !== "object") {
      throw new BadRequestError("Missing request body.");
    }

    const expense = await createExpense(body, staff);
    return toSuccessResponse({ expense }, 201);
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/expenses failed");
  }
}
