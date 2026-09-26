import { randomInt } from "node:crypto";

import {
  ORDER_NUMBER_PREFIX,
  ORDER_NUMBER_RANDOM_LENGTH,
} from "@/lib/constants/order";

/** Unambiguous alphabet: no 0/O/1/I so staff can read numbers over the phone. */
const ORDER_NUMBER_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/**
 * Human readable, collision-resistant order number:
 * NX-20260921-K7M2QF
 *
 * The storefront never shows a raw MongoDB ObjectId. Uniqueness is guaranteed
 * by a unique index on Order.orderNumber plus a retry loop in the order
 * service for the (extremely unlikely) random collision.
 */
export function generateOrderNumber(now: Date = new Date()): string {
  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");

  let randomPart = "";
  for (let index = 0; index < ORDER_NUMBER_RANDOM_LENGTH; index += 1) {
    randomPart += ORDER_NUMBER_ALPHABET[randomInt(ORDER_NUMBER_ALPHABET.length)];
  }

  return `${ORDER_NUMBER_PREFIX}-${datePart}-${randomPart}`;
}

/** Public order-number format check, used before hitting the database. */
export function isWellFormedOrderNumber(value: string): boolean {
  return new RegExp(
    `^${ORDER_NUMBER_PREFIX}-\\d{8}-[${ORDER_NUMBER_ALPHABET}]{${ORDER_NUMBER_RANDOM_LENGTH}}$`,
  ).test(value);
}
