import { NextRequest, NextResponse } from "next/server";

import { requireStaffApi } from "@/lib/auth/staff-session";
import { isAdminRole, isSellerRole } from "@/lib/constants/staff";
import {
  getCustomerAnalytics,
  getCustomerReceivablesAging,
  getFinancialAnalytics,
  getInventoryAnalytics,
  getOfflinePaymentAnalytics,
  getPurchaseSupplierAnalytics,
  getSalesAnalytics,
  getStaffPerformanceAnalytics,
  type DateRangePreset,
} from "@/lib/services/analytics.service";
import { listDailyClosings } from "@/lib/services/daily-closing.service";
import { listExpenses } from "@/lib/services/expense.service";
import {
  generateCsvExport,
  generateExcelSpreadsheetXml,
  generatePrintableHtmlReport,
  type ExportColumn,
  type ExportReportOptions,
} from "@/lib/services/export.service";
import { BadRequestError, ForbiddenError } from "@/lib/utils/errors";
import { toErrorResponse } from "@/lib/utils/http";
import { formatMoney } from "@/lib/utils/money";

export async function GET(request: NextRequest) {
  let staff: Awaited<ReturnType<typeof requireStaffApi>>;
  try {
    staff = await requireStaffApi();
    if (isSellerRole(staff.role)) {
      throw new ForbiddenError("Sellers are not authorized to export business reports.");
    }
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/reports/export auth");
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const format = (searchParams.get("format") || "csv").toLowerCase();
    const reportType = (searchParams.get("reportType") || "sales").toLowerCase();
    const preset = (searchParams.get("preset") as DateRangePreset) || "this_month";
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;

    let exportOptions: ExportReportOptions;

    switch (reportType) {
      case "sales": {
        const sales = await getSalesAnalytics(preset, startDate, endDate, staff);
        const columns: ExportColumn[] = [
          { header: "Date", key: "dateKey" },
          { header: "Day", key: "label" },
          { header: "Orders", key: "orderCount", format: "number" },
          { header: "Gross Sales", key: "grossSalesInPaise", format: "currency" },
          { header: "Net Sales", key: "netSalesInPaise", format: "currency" },
        ];

        let totalGross = 0;
        let totalNet = 0;
        let totalOrders = 0;
        for (const t of sales.trends) {
          totalGross += t.grossSalesInPaise;
          totalNet += t.netSalesInPaise;
          totalOrders += t.orderCount;
        }

        exportOptions = {
          businessName: "Nexora",
          reportTitle: "Sales & Performance Report",
          periodLabel: sales.range.label,
          generatedBy: staff.name,
          columns,
          data: sales.trends as unknown as Record<string, unknown>[],
          totalsRow: {
            dateKey: "TOTAL",
            label: "All Days",
            orderCount: totalOrders,
            grossSalesInPaise: totalGross,
            netSalesInPaise: totalNet,
          },
        };
        break;
      }

      case "financial":
      case "profit-loss": {
        if (!isAdminRole(staff.role)) {
          throw new ForbiddenError("Only Administrators can export company-wide profit & loss reports.");
        }
        const fin = await getFinancialAnalytics(preset, startDate, endDate, null, staff);
        const columns: ExportColumn[] = [
          { header: "Metric / Account", key: "metric" },
          { header: "Amount", key: "amountInPaise", format: "currency" },
          { header: "Notes", key: "notes" },
        ];

        const data: Record<string, unknown>[] = [
          { metric: "Gross Sales", amountInPaise: fin.grossSalesInPaise, notes: "Total billing before discounts" },
          { metric: "Less: Discounts", amountInPaise: fin.discountsInPaise, notes: "Promotional & register discounts" },
          { metric: "Less: Sales Returns / Refunds", amountInPaise: fin.salesReturnsInPaise, notes: "Approved customer refunds" },
          { metric: "Net Sales Revenue", amountInPaise: fin.netSalesInPaise, notes: "Gross Sales - Discounts - Returns" },
          { metric: "Less: Cost of Goods Sold (COGS)", amountInPaise: fin.costOfGoodsSoldInPaise, notes: "Acquisition cost of products sold" },
          { metric: "Gross Profit", amountInPaise: fin.grossProfitInPaise, notes: `Margin: ${fin.grossProfitMarginPercent}%` },
          { metric: "Less: Operating Expenses", amountInPaise: fin.operatingExpensesInPaise, notes: fin.isExpenseDataComplete ? "Verified expense records" : "No expense records" },
          { metric: "Net Operating Profit", amountInPaise: fin.netProfitInPaise ?? 0, notes: fin.isExpenseDataComplete ? `Net Margin: ${fin.netProfitMarginPercent}%` : "Operating expenses incomplete" },
          { metric: "Tax Collected (Liability)", amountInPaise: fin.taxCollectedInPaise, notes: "Excluded from revenue/profit" },
          { metric: "Net Cash / Digital Collections", amountInPaise: fin.netCollectionsInPaise, notes: "Total collections minus refunds" },
          { metric: "Outstanding Customer Receivables", amountInPaise: fin.outstandingReceivablesInPaise, notes: "Customer debts to collect" },
          { metric: "Supplier Payables Outstanding", amountInPaise: fin.supplierPayablesInPaise, notes: "PO balances payable" },
        ];

        exportOptions = {
          businessName: "Nexora",
          reportTitle: "Profit & Loss Financial Statement",
          periodLabel: fin.range.label,
          generatedBy: staff.name,
          columns,
          data,
        };
        break;
      }

      case "payments": {
        const payments = await getOfflinePaymentAnalytics(preset, startDate, endDate, staff);
        const columns: ExportColumn[] = [
          { header: "Tender Method", key: "method" },
          { header: "Transactions", key: "transactionCount", format: "number" },
          { header: "Confirmed Collections", key: "confirmedInPaise", format: "currency" },
          { header: "Pending Verification", key: "pendingInPaise", format: "currency" },
        ];

        exportOptions = {
          businessName: "Nexora",
          reportTitle: "Offline Payment & Collections Report",
          periodLabel: payments.range.label,
          generatedBy: staff.name,
          columns,
          data: payments.tenderBreakdown as unknown as Record<string, unknown>[],
          totalsRow: {
            method: "TOTAL",
            transactionCount: payments.tenderBreakdown.reduce((s, t) => s + t.transactionCount, 0),
            confirmedInPaise: payments.confirmedCollectionsInPaise,
            pendingInPaise: payments.pendingVerificationInPaise,
          },
        };
        break;
      }

      case "receivables": {
        const rec = await getCustomerReceivablesAging(staff);
        const columns: ExportColumn[] = [
          { header: "Customer Name", key: "customerName" },
          { header: "Phone", key: "customerPhone" },
          { header: "Email", key: "customerEmail" },
          { header: "Outstanding Balance", key: "outstandingBalanceInPaise", format: "currency" },
          { header: "Days Overdue", key: "daysOverdue", format: "number" },
          { header: "Aging Category", key: "agingCategory" },
        ];

        exportOptions = {
          businessName: "Nexora",
          reportTitle: "Customer Receivables & Aging Report",
          periodLabel: "As of Today",
          generatedBy: staff.name,
          columns,
          data: rec.customers as unknown as Record<string, unknown>[],
          totalsRow: {
            customerName: "TOTAL OUTSTANDING",
            customerPhone: "",
            customerEmail: "",
            outstandingBalanceInPaise: rec.summary.totalOutstandingInPaise,
            daysOverdue: 0,
            agingCategory: "",
          },
        };
        break;
      }

      case "inventory": {
        const inv = await getInventoryAnalytics();
        const columns: ExportColumn[] = [
          { header: "Product Name", key: "name" },
          { header: "SKU", key: "sku" },
          { header: "Current Stock", key: "stock", format: "number" },
          { header: "Reorder Threshold", key: "minStockThreshold", format: "number" },
          { header: "Unit Cost", key: "costInPaise", format: "currency" },
          { header: "Valuation", key: "valuationInPaise", format: "currency" },
        ];

        exportOptions = {
          businessName: "Nexora",
          reportTitle: "Inventory Valuation & Low-Stock Report",
          periodLabel: `Total Valuation: ${formatMoney(inv.inventoryValuationInPaise)}`,
          generatedBy: staff.name,
          columns,
          data: inv.lowStockItems as unknown as Record<string, unknown>[],
        };
        break;
      }

      case "staff": {
        const staffPerf = await getStaffPerformanceAnalytics(preset, startDate, endDate, staff);
        const columns: ExportColumn[] = [
          { header: "Staff Member", key: "name" },
          { header: "Role", key: "role" },
          { header: "Bills Created", key: "billsCreatedCount", format: "number" },
          { header: "Total Sales", key: "totalSalesInPaise", format: "currency" },
          { header: "Collected Payments", key: "collectedPaymentInPaise", format: "currency" },
          { header: "Average Bill", key: "averageBillValueInPaise", format: "currency" },
          { header: "Discounts Given", key: "discountsGivenInPaise", format: "currency" },
          { header: "Cancelled Bills", key: "cancelledBillsCount", format: "number" },
        ];

        exportOptions = {
          businessName: "Nexora",
          reportTitle: "Staff Performance & Accountability Report",
          periodLabel: staffPerf.range.label,
          generatedBy: staff.name,
          columns,
          data: staffPerf.staffList as unknown as Record<string, unknown>[],
        };
        break;
      }

      case "customers": {
        const custData = await getCustomerAnalytics(preset, startDate, endDate);
        const columns: ExportColumn[] = [
          { header: "Customer Name", key: "name" },
          { header: "Phone", key: "phone" },
          { header: "Email", key: "email" },
          { header: "Total Purchases", key: "totalPurchasesInPaise", format: "currency" },
          { header: "Outstanding Dues", key: "outstandingDueInPaise", format: "currency" },
        ];

        exportOptions = {
          businessName: "Nexora",
          reportTitle: "Customer Accounts & Spend Report",
          periodLabel: `Total Customers: ${custData.totalCustomers}`,
          generatedBy: staff.name,
          columns,
          data: custData.topCustomers as unknown as Record<string, unknown>[],
        };
        break;
      }

      case "purchases":
      case "suppliers": {
        const purchases = await getPurchaseSupplierAnalytics();
        const columns: ExportColumn[] = [
          { header: "Supplier Name", key: "supplierName" },
          { header: "PO Count", key: "poCount", format: "number" },
          { header: "Ordered Value", key: "orderedInPaise", format: "currency" },
          { header: "Amount Paid", key: "amountPaidInPaise", format: "currency" },
          { header: "Outstanding Due", key: "dueInPaise", format: "currency" },
        ];

        exportOptions = {
          businessName: "Nexora",
          reportTitle: "Purchase Orders & Supplier Liabilities Report",
          periodLabel: `Total POs: ${purchases.totalPurchaseOrders}`,
          generatedBy: staff.name,
          columns,
          data: purchases.supplierTotals as unknown as Record<string, unknown>[],
        };
        break;
      }

      case "expenses": {
        const expResult = await listExpenses({ pageSize: 500 }, staff);
        const columns: ExportColumn[] = [
          { header: "Expense #", key: "expenseNumber" },
          { header: "Category", key: "category" },
          { header: "Description", key: "description" },
          { header: "Amount", key: "amountInPaise", format: "currency" },
          { header: "Method", key: "paymentMethod" },
          { header: "Status", key: "status" },
          { header: "Recorded By", key: "createdByName" },
        ];

        exportOptions = {
          businessName: "Nexora",
          reportTitle: "Operating Expenses Audit Report",
          periodLabel: "All Recorded Expenses",
          generatedBy: staff.name,
          columns,
          data: expResult.expenses as unknown as Record<string, unknown>[],
        };
        break;
      }

      case "closing": {
        const closings = await listDailyClosings(50);
        const columns: ExportColumn[] = [
          { header: "Closing #", key: "closingNumber" },
          { header: "Date", key: "closingDate" },
          { header: "Opening Cash", key: "openingCashInPaise", format: "currency" },
          { header: "Cash Sales", key: "cashSalesInPaise", format: "currency" },
          { header: "Cash Refunds", key: "cashRefundsInPaise", format: "currency" },
          { header: "Expected Cash", key: "expectedClosingCashInPaise", format: "currency" },
          { header: "Actual Counted", key: "actualCountedCashInPaise", format: "currency" },
          { header: "Variance", key: "differenceInPaise", format: "currency" },
          { header: "Closed By", key: "closedByName" },
        ];

        exportOptions = {
          businessName: "Nexora",
          reportTitle: "Daily Closing & Cash Reconciliation Report",
          periodLabel: "Historical Cash Closings",
          generatedBy: staff.name,
          columns,
          data: closings as unknown as Record<string, unknown>[],
        };
        break;
      }

      default:
        throw new BadRequestError(`Unsupported reportType: ${reportType}`);
    }

    // Format output
    if (format === "excel" || format === "xlsx") {
      const xml = generateExcelSpreadsheetXml(exportOptions);
      return new NextResponse(xml, {
        headers: {
          "Content-Type": "application/vnd.ms-excel; charset=utf-8",
          "Content-Disposition": `attachment; filename="nexora-${reportType}-report.xls"`,
        },
      });
    }

    if (format === "pdf" || format === "html") {
      const html = generatePrintableHtmlReport(exportOptions);
      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    }

    // Default to CSV
    const csv = generateCsvExport(exportOptions);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="nexora-${reportType}-report.csv"`,
      },
    });
  } catch (error) {
    return toErrorResponse(error, "GET /api/pos/reports/export failed");
  }
}
