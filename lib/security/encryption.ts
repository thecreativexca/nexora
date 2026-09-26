import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Authenticated AES-256-GCM encryption for MFA secrets at rest.
 *
 * The key is derived from `MFA_ENCRYPTION_KEY` (any length is accepted) via
 * SHA-256. The stored payload is `iv (12) | authTag (16) | ciphertext`,
 * base64-encoded. GCM provides confidentiality + integrity, so tampered values
 * fail closed on decrypt.
 *
 * This module never leaks the key and never touches the browser.
 */

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const value = process.env.MFA_ENCRYPTION_KEY;
  if (!value || value.trim().length === 0) {
    throw new Error(
      "MFA_ENCRYPTION_KEY is not set. Generate a strong key (see .env.example) or MFA secrets cannot be stored.",
    );
  }
  return createHash("sha256").update(value, "utf8").digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/**
 * Decrypts a payload produced by `encryptSecret`. Throws on any corrupted or
 * tampered input - callers should treat that as "no usable secret".
 */
export function decryptSecret(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  if (raw.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error("Encrypted secret payload is malformed.");
  }
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const data = raw.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}