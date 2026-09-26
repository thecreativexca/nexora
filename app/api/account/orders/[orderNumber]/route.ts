import { getCurrentCustomer } from "@/lib/auth/customer-session";
import { getCustomerOrderByNumber } from "@/lib/services/order.service";
import { NotFoundError, UnauthenticatedError } from "@/lib/utils/errors";
import { toErrorResponse, toSuccessResponse } from "@/lib/utils/http";

interface RouteContext {
  params: Promise<{ orderNumber: string }>;
}

/**
 * A single order for its owner. The lookup matches orderNumber AND customerId,
 * so a customer cannot read another customer's order by guessing the number.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const customer = await getCurrentCustomer();
    if (!customer) throw new UnauthenticatedError();

    const { orderNumber } = await params;
    const order = await getCustomerOrderByNumber(customer.id, orderNumber);
    if (!order) {
      throw new NotFoundError("We could not find that order on your account.");
    }

    return toSuccessResponse({ order });
  } catch (error) {
    return toErrorResponse(error, "GET /api/account/orders/[orderNumber] failed");
  }
}
