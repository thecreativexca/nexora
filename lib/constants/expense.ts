export const EXPENSE_CATEGORY = {
  RENT: "RENT",
  ELECTRICITY: "ELECTRICITY",
  INTERNET: "INTERNET",
  SALARIES: "SALARIES",
  MAINTENANCE: "MAINTENANCE",
  TRANSPORT: "TRANSPORT",
  MARKETING: "MARKETING",
  OFFICE_SUPPLIES: "OFFICE_SUPPLIES",
  MISCELLANEOUS: "MISCELLANEOUS",
} as const;

export type ExpenseCategory =
  (typeof EXPENSE_CATEGORY)[keyof typeof EXPENSE_CATEGORY];

export const EXPENSE_CATEGORY_VALUES = Object.values(
  EXPENSE_CATEGORY,
) as ExpenseCategory[];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  RENT: "Rent",
  ELECTRICITY: "Electricity",
  INTERNET: "Internet & Phone",
  SALARIES: "Salaries & Wages",
  MAINTENANCE: "Maintenance & Repairs",
  TRANSPORT: "Transport & Logistics",
  MARKETING: "Marketing & Advertising",
  OFFICE_SUPPLIES: "Office Supplies",
  MISCELLANEOUS: "Miscellaneous",
};

export const EXPENSE_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  PAID: "PAID",
} as const;

export type ExpenseStatus =
  (typeof EXPENSE_STATUS)[keyof typeof EXPENSE_STATUS];

export const EXPENSE_STATUS_VALUES = Object.values(
  EXPENSE_STATUS,
) as ExpenseStatus[];
