import { z } from "zod";

import {
  ORDER_CHANNEL,
  ORDER_SEARCH_MAX_LENGTH,
  ORDER_STATUS_VALUES,
  REFUND_REASON_MAX_LENGTH,
  REFUND_REASON_MIN_LENGTH,
} from "@/lib/constants/order";

/**
 * Server-side contracts for the Orders management module (Phase 5).
 *
 * Filters, pagination, status requests and refund requests are all validated
 * with Zod before they reach a service. Arbitrary user objects are never
 * passed to MongoDB - every query field here is explicitly allow-listed.
 */

/** Orders table query. All URL values arrive as strings. */
export const staffOrderListQuerySchema = z.object({
  page: z.string().regex(/^\d{1,4}$/, "Page must be a positive number.").optional(),
  // Loose format check - absurd values are clamped, not rejected, in the route
  // (Math.min(pageSize, ORDERS_MAX_PAGE_SIZE)).
  pageSize: z.string().regex(/^\d{1,5}$/, "Page size must be a positive number.").optional(),
  channel: z
    .enum([
      "ALL",
      ORDER_CHANNEL.IN_STORE,
      ORDER_CHANNEL.ONLINE,
    ], "Choose a valid channel filter.")
    .optional(),
  status: z.enum(ORDER_STATUS_VALUES, "Choose a valid order status.").optional(),
  search: z
    .string()
    .trim()
    .max(ORDER_SEARCH_MAX_LENGTH, "Order search is too long.")
    .optional(),
});
export type StaffOrderListQuery = z.output<typeof staffOrderListQuerySchema>;

/** Order status mutation targeted at an ONLINE order. */
export const staffOrderStatusSchema = z.object({
  newStatus: z.enum(ORDER_STATUS_VALUES, "Choose a valid order status."),
});
export type StaffOrderStatusInput = z.output<typeof staffOrderStatusSchema>;

/** A full-order refund request. A short reason is required. */
export const refundRequestSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(REFUND_REASON_MIN_LENGTH, "Please add a short reason for the refund.")
    .max(REFUND_REASON_MAX_LENGTH, "That refund reason is too long."),
  action: z.enum(["issue", "request", "approve", "reject"]).optional().default("issue"),
}).strict();
export type RefundRequestInput = z.output<typeof refundRequestSchema>;
