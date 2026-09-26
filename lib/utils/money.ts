import {
  CURRENCY_CODE,
  CURRENCY_LOCALE,
  MINOR_UNITS_PER_MAJOR_UNIT,
} from "@/lib/constants/currency";

/**
 * Money helpers. All amounts are integer minor units (paise).
 * 49999 -> "₹499.99"
 */
const currencyFormatter = new Intl.NumberFormat(CURRENCY_LOCALE, {
  style: "currency",
  currency: CURRENCY_CODE,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(amountInMinorUnits: number): string {
  if (!Number.isFinite(amountInMinorUnits)) return "-";
  return currencyFormatter.format(
    amountInMinorUnits / MINOR_UNITS_PER_MAJOR_UNIT,
  );
}

/** "₹499.99" without the paise when the amount is a whole rupee value. */
export function formatMoneyCompact(amountInMinorUnits: number): string {
  if (!Number.isFinite(amountInMinorUnits)) return "-";
  const formatter =
    amountInMinorUnits % MINOR_UNITS_PER_MAJOR_UNIT === 0
      ? new Intl.NumberFormat(CURRENCY_LOCALE, {
          style: "currency",
          currency: CURRENCY_CODE,
          maximumFractionDigits: 0,
        })
      : currencyFormatter;
  return formatter.format(amountInMinorUnits / MINOR_UNITS_PER_MAJOR_UNIT);
}

/** Safe sum of integer minor-unit amounts. */
export function sumMoney(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}

export function multiplyMoney(amountInMinorUnits: number, quantity: number): number {
  return amountInMinorUnits * quantity;
}
