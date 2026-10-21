import bwipjs from "bwip-js/node";
import { NextRequest, NextResponse } from "next/server";

import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import {
  barcodeFormatToBwip,
  normalizeAndValidateBarcode,
  type BarcodeFormat,
} from "@/lib/services/barcode.service";
import { BadRequestError } from "@/lib/utils/errors";
import { toErrorResponse } from "@/lib/utils/http";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]!);
}

export async function GET(request: NextRequest) {
  try {
    await requirePermissionApi(STAFF_PERMISSION.ACCESS_INVENTORY);
    const format = (request.nextUrl.searchParams.get("format") || "CODE128") as BarcodeFormat;
    if (!["CODE128", "EAN13", "UPCA"].includes(format)) throw new BadRequestError("Unsupported barcode format.");
    const code = normalizeAndValidateBarcode(request.nextUrl.searchParams.get("code") || "", format);
    if (!code) throw new BadRequestError("A barcode value is required.");
    const svg = bwipjs.toSVG({
      bcid: barcodeFormatToBwip(format),
      text: code,
      scale: 3,
      height: 12,
      includetext: true,
      textxalign: "center",
      backgroundcolor: "FFFFFF",
    });

    if (request.nextUrl.searchParams.get("print") === "1") {
      return new NextResponse(`<!doctype html><html><head><title>Barcode ${escapeHtml(code)}</title><style>@page{size:58mm 35mm;margin:3mm}body{margin:0;display:grid;place-items:center;min-height:29mm}svg{max-width:52mm;height:auto}</style></head><body>${svg}<script>window.addEventListener('load',()=>window.print())</script></body></html>`, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
      });
    }

    const download = request.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "private, no-store",
        ...(download ? { "Content-Disposition": `attachment; filename="nexora-barcode-${code.replace(/[^A-Z0-9_-]/gi, "-")}.svg"` } : {}),
      },
    });
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/inventory/barcode/label failed");
  }
}
