import bwipjs from "bwip-js/node";
import { NextRequest } from "next/server";

import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { barcodeFormatToBwip, type BarcodeFormat } from "@/lib/services/barcode.service";
import { toErrorResponse, toSuccessResponse, readJsonBody } from "@/lib/utils/http";

interface BatchBarcodeRequest {
  items: Array<{
    code: string;
    format?: BarcodeFormat;
  }>;
}

/**
 * Generates vector SVG barcodes in batch for live preview and printing.
 */
export async function POST(request: NextRequest) {
  try {
    await requirePermissionApi(STAFF_PERMISSION.ACCESS_INVENTORY);

    const bodyResult = await readJsonBody<BatchBarcodeRequest>(request);
    if ("error" in bodyResult) return bodyResult.error;

    const items = bodyResult.body.items || [];
    const barcodes: Record<string, string> = {};

    for (const item of items) {
      const code = String(item.code || "").trim();
      if (!code || barcodes[code]) continue;

      const format = item.format || "CODE128";
      try {
        const svg = bwipjs.toSVG({
          bcid: barcodeFormatToBwip(format),
          text: code,
          scale: 3,
          height: 10,
          includetext: false, // Text is rendered by clean HTML/PDF typography
          backgroundcolor: "FFFFFF",
        });
        barcodes[code] = svg;
      } catch (err) {
        console.error(`Failed to generate barcode SVG for ${code}:`, err);
      }
    }

    return toSuccessResponse({ barcodes });
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/barcodes/batch failed");
  }
}
