import "server-only";

import { randomBytes } from "node:crypto";

import { connectDB } from "@/lib/db/mongodb";
import { InvalidRequestError } from "@/lib/utils/errors";
import { Product } from "@/models/Product";

export type BarcodeFormat = "CODE128" | "EAN13" | "UPCA";

function hasValidGtinCheckDigit(value: string): boolean {
  const digits = [...value].map(Number);
  const check = digits.pop();
  if (check === undefined || digits.some(Number.isNaN)) return false;
  const sum = digits
    .reverse()
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export function normalizeAndValidateBarcode(value: string, format: BarcodeFormat): string {
  const barcode = value.trim().toUpperCase();
  if (!barcode) return "";

  if (format === "EAN13" && (!/^\d{13}$/.test(barcode) || !hasValidGtinCheckDigit(barcode))) {
    throw new InvalidRequestError("EAN-13 barcodes must contain 13 digits with a valid check digit.");
  }
  if (format === "UPCA" && (!/^\d{12}$/.test(barcode) || !hasValidGtinCheckDigit(barcode))) {
    throw new InvalidRequestError("UPC-A barcodes must contain 12 digits with a valid check digit.");
  }
  if (format === "CODE128" && !/^[\x20-\x7E]{3,60}$/.test(barcode)) {
    throw new InvalidRequestError("Code 128 values must contain 3–60 printable characters.");
  }
  return barcode;
}

/** Generate an unassigned internal Code 128 value. The unique DB index remains the final race-safe guard. */
export async function generateInternalBarcode(): Promise<string> {
  await connectDB();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = `NX-${Date.now().toString(36).toUpperCase()}-${randomBytes(4).toString("hex").toUpperCase()}`;
    if (!(await Product.exists({ barcode: candidate }))) return candidate;
  }
  throw new InvalidRequestError("Could not generate a unique barcode. Please try again.");
}

export function barcodeFormatToBwip(format: BarcodeFormat): "code128" | "ean13" | "upca" {
  if (format === "EAN13") return "ean13";
  if (format === "UPCA") return "upca";
  return "code128";
}

/**
 * Ensures all products in the database have a unique barcode.
 * If force is false, only products missing a barcode are updated.
 * If force is true, all products get a newly generated unique barcode.
 */
export async function ensureBarcodesForAllProducts(force = false): Promise<{
  total: number;
  updated: number;
  alreadyHadBarcode: number;
}> {
  await connectDB();
  const filter = force
    ? {}
    : {
        $or: [
          { barcode: { $exists: false } },
          { barcode: null },
          { barcode: "" },
        ],
      };

  const productsToUpdate = await Product.find(filter).select("_id sku barcode").exec();
  let updated = 0;

  for (const product of productsToUpdate) {
    let candidate = "";
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const timePart = Date.now().toString(36).toUpperCase();
      const randPart = randomBytes(4).toString("hex").toUpperCase();
      candidate = `NX-${timePart}-${randPart}`;
      const exists = await Product.exists({ barcode: candidate, _id: { $ne: product._id } });
      if (!exists) break;
    }

    if (candidate) {
      await Product.updateOne(
        { _id: product._id },
        {
          $set: {
            barcode: candidate,
            barcodeFormat: "CODE128",
          },
        },
      );
      updated += 1;
    }
  }

  const total = await Product.countDocuments();
  return {
    total,
    updated,
    alreadyHadBarcode: total - updated,
  };
}
