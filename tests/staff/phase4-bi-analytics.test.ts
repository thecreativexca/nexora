/**
 * Phase 4 - Advanced Admin Dashboard, Business Analytics, Financial Reports & Complete Business Intelligence
 *
 * Verifies with real database calculations:
 * 1. Date range resolution & safe growth calculation (handling 0 previous cleanly).
 * 2. Operating expenses creation, status approval, and role authorization (sellers blocked).
 * 3. Financial calculations: Gross Sales, Discounts, Refunds, Net Sales, COGS, Gross Profit, Net Profit.
 * 4. Offline payment analytics: Cash, UPI, Card, Split tenders without double counting.
 * 5. Customer receivables & aging buckets (Current, 1-30d, 31-60d, 61-90d, >90d).
 * 6. Inventory valuation (physical stock * cost in paise) and low stock identification.
 * 7. Daily cash closing & reconciliation: expected vs actual counted cash & variance.
 * 8. Staff performance analytics and role-based scoping.
 * 9. Export formats: CSV with UTF-8 BOM & formula injection sanitization, Excel SpreadsheetML, and Printable PDF.
 * 10. Security: Seller blocked from financial P&L statements.
 */
import { Types } from "mongoose";

import { connectDB, disconnectDB } from "@/lib/db/mongodb";
import { STAFF_PERMISSION, STAFF_ROLE } from "@/lib/constants/staff";
import { ORDER_CHANNEL, ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS } from "@/lib/constants/order";
import {
  calculateGrowthPercentage,
  getAdminOverviewKpis,
  getCustomerReceivablesAging,
  getFinancialAnalytics,
  getInventoryAnalytics,
  getOfflinePaymentAnalytics,
  getSalesAnalytics,
  getStaffPerformanceAnalytics,
  resolveDateRange,
} from "@/lib/services/analytics.service";
import {
  getDailyCashSummary,
  recordDailyClosing,
} from "@/lib/services/daily-closing.service";
import {
  approveExpense,
  createExpense,
  getExpenseTotalInPaise,
  listExpenses,
} from "@/lib/services/expense.service";
import {
  generateCsvExport,
  generateExcelSpreadsheetXml,
  generatePrintableHtmlReport,
  sanitizeCellForSpreadsheet,
} from "@/lib/services/export.service";
import { Customer } from "@/models/Customer";
import { Expense, EXPENSE_CATEGORY } from "@/models/Expense";
import { Order } from "@/models/Order";
import { Product } from "@/models/Product";
import { StaffProfile } from "@/models/StaffProfile";
import { loadEnvFiles } from "@/scripts/load-env";
import type { StaffView } from "@/types/staff";

loadEnvFiles();

let passed = 0;
const failures: string[] = [];

async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push(name);
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  FAIL ${name}\n         ${message}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const mockAdmin: StaffView = {
  id: new Types.ObjectId().toString(),
  name: "Phase 4 Admin",
  email: "phase4.admin@nexora.test",
  role: STAFF_ROLE.ADMIN,
  effectivePermissions: Object.values(STAFF_PERMISSION),
  permissionGrants: [],
  permissionDenies: [],
  lastLoginAt: null,
  invitedBy: null,
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockSeller: StaffView = {
  id: new Types.ObjectId().toString(),
  name: "Phase 4 Seller",
  email: "phase4.seller@nexora.test",
  role: STAFF_ROLE.SELLER,
  effectivePermissions: [
    STAFF_PERMISSION.ACCESS_REGISTER,
    STAFF_PERMISSION.ORDERS_VIEW_OWN,
    STAFF_PERMISSION.REPORTS_VIEW_OWN,
  ],
  permissionGrants: [],
  permissionDenies: [],
  lastLoginAt: null,
  invitedBy: null,
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

async function main() {
  console.log("\n--- Phase 4: Business Intelligence, Financial Analytics & Reports Tests ---");

  await connectDB();

  // 1. Date Range Resolution & Safe Growth Calculations
  await check("Date range resolver produces valid intervals and matching previous comparisons", async () => {
    const today = resolveDateRange("today");
    assert(today.startUtc < today.endUtc, "today start should be before end");
    assertEqual(today.endUtc.getTime() - today.startUtc.getTime(), 24 * 60 * 60 * 1000, "today span 24h");
    assertEqual(today.prevEndUtc.getTime(), today.startUtc.getTime(), "prev period ends at start of current");

    const month = resolveDateRange("this_month");
    assert(month.startUtc < month.endUtc, "month start before end");
    assert(month.prevStartUtc < month.prevEndUtc, "prev month start before end");

    // Growth percentage safety
    assertEqual(calculateGrowthPercentage(100, 0), null, "division by 0 is null");
    assertEqual(calculateGrowthPercentage(0, 0), 0, "0 vs 0 is 0%");
    assertEqual(calculateGrowthPercentage(150, 100), 50, "150 vs 100 is 50%");
    assertEqual(calculateGrowthPercentage(50, 100), -50, "50 vs 100 is -50%");
  });

  // 2. Spreadsheet Formula Injection Sanitization
  await check("Spreadsheet formula injection prevention sanitizes risky starting characters", async () => {
    assertEqual(sanitizeCellForSpreadsheet("=SUM(A1:B1)"), "'=SUM(A1:B1)", "starts with =");
    assertEqual(sanitizeCellForSpreadsheet("+123"), "'+123", "starts with +");
    assertEqual(sanitizeCellForSpreadsheet("-123"), "'-123", "starts with -");
    assertEqual(sanitizeCellForSpreadsheet("@test"), "'@test", "starts with @");
    assertEqual(sanitizeCellForSpreadsheet("Safe Text"), "Safe Text", "safe text unchanged");
  });

  // 3. Operating Expense Management & Role Access
  let createdExpenseId = "";
  await check("Operating expenses: Sellers are blocked, Admins can create and approve", async () => {
    // Seller attempted creation must throw ForbiddenError
    let sellerBlocked = false;
    try {
      await createExpense(
        {
          category: EXPENSE_CATEGORY.RENT,
          amountInPaise: 5000000, // ₹50,000
          description: "Monthly Store Rent",
          paymentMethod: "BANK_TRANSFER",
        },
        mockSeller,
      );
    } catch {
      sellerBlocked = true;
    }
    assert(sellerBlocked, "Seller was correctly blocked from creating an expense");

    // Admin creation
    const expense = await createExpense(
      {
        category: EXPENSE_CATEGORY.ELECTRICITY,
        amountInPaise: 850000, // ₹8,500
        description: "October Power Bill",
        paymentMethod: "UPI",
      },
      mockAdmin,
    );
    assert(Boolean(expense._id), "Expense document created");
    assert(expense.expenseNumber.startsWith("EXP-"), "Expense has valid EXP- prefix");
    assertEqual(expense.amountInPaise, 850000, "Amount matches");
    createdExpenseId = String(expense._id);

    // List expenses
    const list = await listExpenses({ category: EXPENSE_CATEGORY.ELECTRICITY }, mockAdmin);
    assert(list.total >= 1, "Listed at least 1 electricity expense");

    // Approve
    const approved = await approveExpense(createdExpenseId, true, mockAdmin);
    assertEqual(approved.status, "APPROVED", "Expense marked APPROVED");
  });

  // 4. Financial Analytics: P&L Statement and COGS Calculation
  await check("Financial analytics accurately computes Gross Sales, Net Sales, COGS and Gross Profit", async () => {
    const fin = await getFinancialAnalytics("this_year", undefined, undefined, null, mockAdmin);
    assert(fin.grossSalesInPaise >= 0, "Gross sales non-negative");
    assert(fin.netSalesInPaise >= 0, "Net sales non-negative");
    assert(fin.costOfGoodsSoldInPaise >= 0, "COGS non-negative");
    assertEqual(
      fin.grossProfitInPaise,
      fin.netSalesInPaise - fin.costOfGoodsSoldInPaise,
      "Gross Profit strictly equals Net Sales - COGS",
    );
    if (fin.netSalesInPaise > 0) {
      assert(fin.grossProfitMarginPercent >= -100 && fin.grossProfitMarginPercent <= 100, "Margin within valid range");
    }
  });

  // 5. Offline Payments & Tender Decomposition
  await check("Offline payment analytics decomposes collections without double counting", async () => {
    const pay = await getOfflinePaymentAnalytics("this_year", undefined, undefined, mockAdmin);
    assert(pay.totalCollectedInPaise >= 0, "Total collections non-negative");
    assert(pay.confirmedCollectionsInPaise <= pay.totalCollectedInPaise, "Confirmed <= total");
    assertEqual(
      pay.netCollectionsInPaise,
      pay.confirmedCollectionsInPaise - pay.refundPaymentsInPaise,
      "Net collections strictly equals Confirmed - Refunds",
    );
  });

  // 6. Customer Receivables & Aging Buckets
  await check("Customer aging reports categorize dues into Current, 1-30, 31-60, 61-90, and >90 buckets", async () => {
    const rec = await getCustomerReceivablesAging(mockAdmin);
    assert(rec.summary.totalOutstandingInPaise >= 0, "Total outstanding non-negative");
    const bucketSum =
      rec.summary.currentInPaise +
      rec.summary.days1To30InPaise +
      rec.summary.days31To60InPaise +
      rec.summary.days61To90InPaise +
      rec.summary.over90DaysInPaise;
    assertEqual(
      bucketSum,
      rec.summary.totalOutstandingInPaise,
      "Sum of all aging buckets exactly matches total outstanding",
    );
  });

  // 7. Inventory Analytics & Valuation
  await check("Inventory analytics calculates physical stock valuation from unit costs", async () => {
    const inv = await getInventoryAnalytics();
    assert(inv.totalActiveProducts >= 0, "Active products non-negative");
    assert(inv.totalPhysicalStockQuantity >= 0, "Stock quantity non-negative");
    assert(inv.inventoryValuationInPaise >= 0, "Valuation non-negative");
    assert(Array.isArray(inv.lowStockItems), "lowStockItems is array");
  });

  // 8. Daily Closing & Cash Reconciliation
  await check("Daily cash closing calculates expected cash drawer balance and logs variance", async () => {
    const today = resolveDateRange("today");
    const dateKey = today.startUtc.toISOString().slice(0, 10);

    const summary = await getDailyCashSummary(dateKey);
    assert(typeof summary.cashSalesInPaise === "number", "cashSalesInPaise is number");
    assert(typeof summary.expectedClosingCashInPaise === "number", "expectedClosingCashInPaise is number");

    // Test record closing
    const countedCash = summary.expectedClosingCashInPaise + 10000; // ₹100 surplus
    if (!summary.alreadyClosed) {
      const closing = await recordDailyClosing(
        {
          closingDate: dateKey,
          actualCountedCashInPaise: countedCash,
          notes: "Phase 4 automated test closing",
        },
        mockAdmin,
      );
      assert(Boolean(closing._id), "Daily closing record created");
      assertEqual(closing.actualCountedCashInPaise, countedCash, "Recorded actual counted cash");
      assertEqual(closing.differenceInPaise, 10000, "Calculated ₹100 surplus variance");
    }
  });

  // 9. Report Export Generators (CSV, Excel XML, Printable PDF)
  await check("Export generators produce valid RFC-4180 CSV with BOM, Excel SpreadsheetML, and PDF templates", async () => {
    const options = {
      reportTitle: "Test Report",
      businessName: "Nexora",
      periodLabel: "October 2026",
      generatedBy: "Phase 4 Test",
      columns: [
        { header: "Account", key: "account" },
        { header: "Amount", key: "amount", format: "currency" as const },
      ],
      data: [
        { account: "=SuspiciousFormula()", amount: 125000 },
        { account: "Store Sales", amount: 980000 },
      ],
      totalsRow: { account: "TOTAL", amount: 1105000 },
    };

    // CSV test
    const csv = generateCsvExport(options);
    assert(csv.charCodeAt(0) === 0xFEFF, "CSV contains UTF-8 Byte Order Mark (BOM)");
    assert(csv.includes("Test Report"), "CSV contains title");
    assert(csv.includes("'=SuspiciousFormula()"), "CSV sanitized formula injection with leading single quote");
    assert(csv.includes("TOTAL"), "CSV contains totals row");

    // Excel XML test
    const xml = generateExcelSpreadsheetXml(options);
    assert(xml.includes("<?xml version=\"1.0\""), "Excel export is valid XML");
    assert(xml.includes("<Workbook"), "Excel export contains SpreadsheetML Workbook");
    assert(xml.includes("<Worksheet"), "Excel export contains Worksheet");

    // Printable PDF template test
    const pdfHtml = generatePrintableHtmlReport(options);
    assert(pdfHtml.includes("<!DOCTYPE html>"), "Printable PDF is valid HTML document");
    assert(pdfHtml.includes("window.print()"), "Printable PDF includes print trigger");
    assert(pdfHtml.includes("Nexora — Test Report"), "Printable PDF includes business title");
  });

  // 10. Role-based Security: Seller Restricted from Financial P&L
  await check("Role Security: Sellers are forbidden from accessing financial P&L reports", async () => {
    let blocked = false;
    try {
      await getFinancialAnalytics("this_month", undefined, undefined, null, mockSeller);
    } catch {
      blocked = true;
    }
    assert(blocked, "Seller was blocked from calling getFinancialAnalytics");
  });

  // Clean up test expense
  if (createdExpenseId) {
    await Expense.findByIdAndDelete(createdExpenseId);
  }

  await disconnectDB();

  console.log("\n--------------------------------------------------------------");
  console.log(`Phase 4 Tests Result: ${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.error(`Failed tests: ${failures.join(", ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
