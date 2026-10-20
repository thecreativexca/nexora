import { NextResponse } from "next/server";

import { requireStaffApi } from "@/lib/auth/staff-session";
import { STAFF_PERMISSION } from "@/lib/constants/staff";
import { generatePdfReport, type ExportColumn } from "@/lib/services/export.service";
import { getStaffOrderDetail } from "@/lib/services/staff-orders.service";
import { ForbiddenError, NotFoundError } from "@/lib/utils/errors";
import { toErrorResponse } from "@/lib/utils/http";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  try {
    const staff = await requireStaffApi();
    const canAccess =
      staff.effectivePermissions.includes(STAFF_PERMISSION.ACCESS_ORDERS) ||
      staff.effectivePermissions.includes(STAFF_PERMISSION.ORDERS_VIEW_OWN);
    if (!canAccess) throw new ForbiddenError();

    const { orderNumber } = await params;
    const order = await getStaffOrderDetail(orderNumber, staff);
    if (!order) throw new NotFoundError("No sale matches that receipt number.");

    const columns: ExportColumn[] = [
      { header: "Item", key: "productName" },
      { header: "SKU", key: "sku" },
      { header: "Qty", key: "quantity", format: "number" },
      { header: "Unit price", key: "unitPriceInPaise", format: "currency" },
      { header: "Line total", key: "lineTotalInPaise", format: "currency" },
    ];
    const pdf = generatePdfReport({
      businessName: process.env.BUSINESS_NAME?.trim() || "Nexora",
      reportTitle: `Receipt / Invoice ${order.orderNumber}`,
      periodLabel: `${new Date(order.placedAt).toLocaleString("en-IN")} | ${order.paymentMethodLabel} | ${order.paymentStatusLabel}`,
      generatedBy: order.placedByName || staff.name,
      columns,
      data: order.items as unknown as Record<string, unknown>[],
      totalsRow: {
        productName: `Subtotal INR ${(order.subtotalInPaise / 100).toFixed(2)} | Tax INR ${(order.taxInPaise / 100).toFixed(2)} | Discount INR ${(order.discountInPaise / 100).toFixed(2)}`,
        sku: "TOTAL",
        quantity: order.itemCount,
        unitPriceInPaise: order.amountPaidInPaise ?? 0,
        lineTotalInPaise: order.totalInPaise,
      },
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="nexora-receipt-${order.orderNumber}.pdf"`,
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/orders/[orderNumber]/receipt failed");
  }
}
