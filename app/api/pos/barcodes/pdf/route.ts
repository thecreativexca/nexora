import { existsSync } from "node:fs";
import path from "node:path";
import bwipjs from "bwip-js/node";
import { NextRequest, NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";

import { requirePermissionApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { barcodeFormatToBwip, type BarcodeFormat } from "@/lib/services/barcode.service";
import { formatMoney } from "@/lib/utils/money";
import { toErrorResponse, readJsonBody } from "@/lib/utils/http";

const MM_TO_PT = 2.83464567;

interface BarcodePdfItem {
  name: string;
  sku: string;
  barcode: string;
  barcodeFormat?: BarcodeFormat;
  priceInPaise: number;
  brand?: string;
  deviceModel?: string;
  caseColor?: string;
  quantity: number;
}

interface BarcodePdfRequest {
  items: BarcodePdfItem[];
  size: "25x15" | "40x25" | "50x30" | "custom" | "a4";
  customWidth?: number;
  customHeight?: number;
  layoutMode?: "a4" | "thermal";
}

function getDimensions(
  size: string,
  customWidth = 40,
  customHeight = 25,
): { widthPt: number; heightPt: number; isSmall: boolean } {
  let wMm = 40;
  let hMm = 25;

  if (size === "25x15") {
    wMm = 25;
    hMm = 15;
  } else if (size === "40x25") {
    wMm = 40;
    hMm = 25;
  } else if (size === "50x30") {
    wMm = 50;
    hMm = 30;
  } else if (size === "custom") {
    wMm = Math.max(20, Math.min(200, Number(customWidth) || 40));
    hMm = Math.max(10, Math.min(200, Number(customHeight) || 25));
  }

  return {
    widthPt: wMm * MM_TO_PT,
    heightPt: hMm * MM_TO_PT,
    isSmall: wMm <= 30 || hMm <= 18,
  };
}

function setupFonts(doc: typeof PDFDocument.prototype) {
  const regularFont = path.join(
    process.cwd(),
    "node_modules",
    "@fontsource",
    "noto-sans",
    "files",
    "noto-sans-latin-400-normal.woff",
  );
  const boldFont = path.join(
    process.cwd(),
    "node_modules",
    "@fontsource",
    "noto-sans",
    "files",
    "noto-sans-latin-700-normal.woff",
  );

  let hasCustomFonts = false;
  if (existsSync(regularFont) && existsSync(boldFont)) {
    try {
      doc.registerFont("NexoraRegular", regularFont);
      doc.registerFont("NexoraBold", boldFont);
      hasCustomFonts = true;
    } catch {
      hasCustomFonts = false;
    }
  }

  return {
    regular: hasCustomFonts ? "NexoraRegular" : "Helvetica",
    bold: hasCustomFonts ? "NexoraBold" : "Helvetica-Bold",
  };
}

function renderLabelContent(
  doc: typeof PDFDocument.prototype,
  item: BarcodePdfItem,
  svg: string,
  x: number,
  y: number,
  w: number,
  h: number,
  isSmall: boolean,
  fonts: { regular: string; bold: string },
) {
  doc.save();

  const pad = isSmall ? 2 : 4;
  const contentW = w - pad * 2;
  const contentX = x + pad;

  let currentY = y + pad;

  // Header: Brand & Price
  const headerFontSize = isSmall ? 5 : 6.5;
  doc.font(fonts.bold).fontSize(headerFontSize).fillColor("#0f172a");

  const priceText = formatMoney(item.priceInPaise).replace(/₹/g, "Rs. ");
  doc.text("NEXORA", contentX, currentY, { width: contentW / 2 });
  doc.text(priceText, contentX + contentW / 2, currentY, {
    width: contentW / 2,
    align: "right",
  });

  currentY += isSmall ? 6 : 8;

  // Product Name
  const nameFontSize = isSmall ? 4.5 : 6;
  doc.font(fonts.regular).fontSize(nameFontSize).fillColor("#1e293b");
  const nameText = item.name.length > 36 ? `${item.name.slice(0, 34)}…` : item.name;
  doc.text(nameText, contentX, currentY, {
    width: contentW,
    align: "center",
    ellipsis: true,
  });

  currentY += isSmall ? 5 : 7;

  // Barcode SVG
  const barcodeH = isSmall ? Math.max(10, h - currentY - 10) : Math.max(16, h - currentY - 14);
  const barcodeW = contentW * 0.94;
  const barcodeX = contentX + (contentW - barcodeW) / 2;

  try {
    SVGtoPDF(doc, svg, barcodeX, currentY, {
      width: barcodeW,
      height: barcodeH,
      preserveAspectRatio: "none",
    });
  } catch (err) {
    console.error("SVGtoPDF error:", err);
  }

  currentY += barcodeH + 1;

  // Barcode text & SKU below
  const footerFontSize = isSmall ? 4.5 : 5.5;
  doc.font(fonts.bold).fontSize(footerFontSize).fillColor("#334155");
  doc.text(item.barcode, contentX, currentY, {
    width: contentW,
    align: "center",
  });

  currentY += isSmall ? 4 : 5.5;

  if (!isSmall && currentY < y + h - 3) {
    const details = [item.sku, item.brand, item.deviceModel, item.caseColor]
      .filter(Boolean)
      .join(" · ");
    doc.font(fonts.regular).fontSize(4.5).fillColor("#64748b");
    doc.text(details, contentX, currentY, {
      width: contentW,
      align: "center",
      ellipsis: true,
    });
  }

  doc.restore();
}

export async function POST(request: NextRequest) {
  try {
    await requirePermissionApi(STAFF_PERMISSION.ACCESS_INVENTORY);

    const bodyResult = await readJsonBody<BarcodePdfRequest>(request);
    if ("error" in bodyResult) return bodyResult.error;

    const { items, size, customWidth, customHeight } = bodyResult.body;
    if (!items || items.length === 0) {
      return toErrorResponse(new Error("No items provided for barcode printing"), "PDF export");
    }

    // Filter items with valid barcodes and count > 0
    const validItems = items.filter((item) => item.barcode && item.quantity > 0);
    if (validItems.length === 0) {
      return toErrorResponse(new Error("No valid barcode items selected"), "PDF export");
    }

    // Pre-generate barcode SVGs
    const svgMap = new Map<string, string>();
    for (const item of validItems) {
      if (!svgMap.has(item.barcode)) {
        try {
          const svg = bwipjs.toSVG({
            bcid: barcodeFormatToBwip(item.barcodeFormat || "CODE128"),
            text: item.barcode,
            scale: 3,
            height: 10,
            includetext: false,
            backgroundcolor: "FFFFFF",
          });
          svgMap.set(item.barcode, svg);
        } catch {
          svgMap.set(item.barcode, "");
        }
      }
    }

    // Create PDF Document
    const isA4 = size === "a4" || bodyResult.body.layoutMode === "a4";
    const { widthPt, heightPt, isSmall } = getDimensions(size, customWidth, customHeight);

    const doc = new PDFDocument({
      size: isA4 ? "A4" : [widthPt, heightPt],
      margin: 0,
      autoFirstPage: false,
      bufferPages: true,
      info: {
        Title: "Nexora Barcode Labels",
        Author: "Nexora POS",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));

    const completed = new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });

    const fonts = setupFonts(doc);

    if (!isA4) {
      // Thermal roll layout: 1 page = 1 physical label
      for (const item of validItems) {
        const svg = svgMap.get(item.barcode) || "";
        for (let copy = 0; copy < item.quantity; copy++) {
          doc.addPage({ size: [widthPt, heightPt], margin: 0 });
          renderLabelContent(doc, item, svg, 0, 0, widthPt, heightPt, isSmall, fonts);
        }
      }
    } else {
      // A4 Sheet Grid Layout (Tiled according to chosen label dimensions)
      const a4Width = 595.28;
      const a4Height = 841.89;
      const gap = 6; // ~2mm gap between labels
      const cellW = widthPt;
      const cellH = heightPt;

      const cols = Math.max(1, Math.floor((a4Width - 24) / (cellW + gap)));
      const rowsPerPage = Math.max(1, Math.floor((a4Height - 28) / (cellH + gap)));

      const totalGridW = cols * cellW + (cols - 1) * gap;
      const marginX = Math.max(12, (a4Width - totalGridW) / 2);
      const marginY = 16;

      let currentCol = 0;
      let currentRow = 0;

      doc.addPage({ size: "A4", margin: 0 });

      for (const item of validItems) {
        const svg = svgMap.get(item.barcode) || "";
        for (let copy = 0; copy < item.quantity; copy++) {
          if (currentRow >= rowsPerPage) {
            doc.addPage({ size: "A4", margin: 0 });
            currentRow = 0;
            currentCol = 0;
          }

          const cellX = marginX + currentCol * (cellW + gap);
          const cellY = marginY + currentRow * (cellH + gap);

          // Draw subtle dashed border for cutting guidance on A4 sheet
          doc.save();
          doc.roundedRect(cellX, cellY, cellW, cellH, 3).dash(2, { space: 2 }).stroke("#cbd5e1");
          doc.restore();

          renderLabelContent(doc, item, svg, cellX, cellY, cellW, cellH, false, fonts);

          currentCol++;
          if (currentCol >= cols) {
            currentCol = 0;
            currentRow++;
          }
        }
      }
    }

    doc.end();
    const pdfBuffer = await completed;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="nexora-barcodes-${size}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error, "POST /api/pos/barcodes/pdf failed");
  }
}
