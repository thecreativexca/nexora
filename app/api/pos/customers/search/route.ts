import type { NextRequest } from "next/server";

import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { connectDB } from "@/lib/db/mongodb";
import { buildContainsRegExp, normalizeSearchTerm } from "@/lib/utils/search";
import { toErrorResponse, toSuccessResponse } from "@/lib/utils/http";
import { Customer } from "@/models/Customer";

export interface PosCustomerSearchOption {
  id: string;
  name: string;
  phone: string;
  email: string;
  outstandingDueInPaise: number;
  totalPurchasesInPaise: number;
}

/**
 * Fast customer search endpoint for POS register.
 * Allows cashiers/sellers to search existing customer accounts by phone, name, or email.
 */
export async function GET(request: NextRequest) {
  try {
    await requirePermissionApi(STAFF_PERMISSION.ACCESS_REGISTER);
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/customers/search auth");
  }

  const { searchParams } = request.nextUrl;
  const q = normalizeSearchTerm(searchParams.get("q"));

  if (!q) {
    return toSuccessResponse([]);
  }

  try {
    await connectDB();
    const pattern = buildContainsRegExp(q);
    const customers = await Customer.find({
      isActive: true,
      $or: [{ phone: pattern }, { name: pattern }, { email: pattern }],
    })
      .select("name phone email outstandingDueInPaise totalPurchasesInPaise")
      .limit(10)
      .lean();

    const results: PosCustomerSearchOption[] = customers.map((c) => ({
      id: String(c._id),
      name: c.name,
      phone: c.phone || "",
      email: c.email || "",
      outstandingDueInPaise: c.outstandingDueInPaise ?? 0,
      totalPurchasesInPaise: c.totalPurchasesInPaise ?? 0,
    }));

    return toSuccessResponse(results);
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/customers/search failed");
  }
}
