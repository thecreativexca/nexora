import { getCurrentCustomer } from "@/lib/auth/customer-session";
import { listCustomerOrders } from "@/lib/services/order.service";
import { UnauthenticatedError } from "@/lib/utils/errors";
import { toErrorResponse, toSuccessResponse } from "@/lib/utils/http";

/** Order history for the authenticated customer only (scoped by customerId). */
export async function GET() {
  try {
    const customer = await getCurrentCustomer();
    if (!customer) throw new UnauthenticatedError();

    const orders = await listCustomerOrders(customer.id);
    return toSuccessResponse({ orders });
  } catch (error) {
    return toErrorResponse(error, "GET /api/account/orders failed");
  }
}
