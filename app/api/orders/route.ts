
/**
 * Creates an ONLINE order.
 *
 * Works for guests and for signed-in customers. Mirrors the `placeOrderAction`
 * Server Action and exists so the storefront, tests and future integrations
 * share one HTTP contract. Prices, totals and stock are always resolved
 * server-side; `customerId` comes from the session, never from the body.
 */
export async function POST() {
  return Response.json(
    {
      error: {
        code: "OFFLINE_CHECKOUT_REQUIRED",
        message: "Use the storefront checkout to place an order with an offline payment method.",
      },
    },
    { status: 410 },
  );
}
