import "server-only";

import bcrypt from "bcryptjs";

import { BCRYPT_ROUNDS } from "@/lib/constants/customer";

/**
 * Password hashing helpers.
 *
 * Plain-text passwords never touch the database, logs or the browser. Only the
 * bcrypt hash is persisted, and comparison is always constant-time inside
 * bcrypt itself.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  if (!passwordHash) return false;
  try {
    return await bcrypt.compare(password, passwordHash);
  } catch {
    // A corrupt hash must fail closed, never throw into the request path.
    return false;
  }
}
