import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { normalizeAndValidateBarcode } from "@/lib/services/barcode.service";
import { generatePdfReport } from "@/lib/services/export.service";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  assert(normalizeAndValidateBarcode("4006381333931", "EAN13") === "4006381333931", "valid EAN-13 rejected");
  assert(normalizeAndValidateBarcode("036000291452", "UPCA") === "036000291452", "valid UPC-A rejected");
  let invalidRejected = false;
  try { normalizeAndValidateBarcode("4006381333932", "EAN13"); } catch { invalidRejected = true; }
  assert(invalidRejected, "invalid EAN-13 check digit accepted");

  const rows = Array.from({ length: 30 }, (_, index) => ({
    date: `2026-10-${String((index % 31) + 1).padStart(2, "0")}`,
    description: `Verified sale entry ${index + 1} with a deliberately long description to verify wrapping without clipping`,
    orders: index + 1,
    amountInPaise: (index + 1) * 12345,
  }));
  const pdf = await generatePdfReport({
    businessName: "Nexora",
    reportTitle: "Sales & Revenue Verification Report",
    periodLabel: "1 Oct 2026 - 21 Oct 2026",
    generatedBy: "Automated QA",
    columns: [
      { header: "Date", key: "date" },
      { header: "Description", key: "description" },
      { header: "Orders", key: "orders", format: "number" },
      { header: "Net Sales", key: "amountInPaise", format: "currency" },
    ],
    data: rows,
    totalsRow: { date: "TOTAL", description: "Verified dataset", orders: rows.reduce((sum, row) => sum + row.orders, 0), amountInPaise: rows.reduce((sum, row) => sum + row.amountInPaise, 0) },
  });
  assert(pdf.subarray(0, 5).toString("ascii") === "%PDF-", "export is not a PDF");
  assert(pdf.length > 15_000, "PDF is unexpectedly small");
  const outputDir = path.join(process.cwd(), "tmp", "pdfs");
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, "nexora-report-verification.pdf"), pdf);
  console.log("report-export-and-barcode: passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
