/**
 * Currency + money representation for Nexora.
 *
 * Every monetary value in the database is stored as an INTEGER number of minor
 * units ("paise") - never a float. 499.99 is stored as 49999. This keeps all
 * arithmetic exact (no floating point drift) across the storefront, the POS
 * register and future reporting phases.
 */
export const CURRENCY_CODE = "INR";
export const CURRENCY_LOCALE = "en-IN";
export const MINOR_UNITS_PER_MAJOR_UNIT = 100;

/** A value in minor units (paise). Always a safe integer. */
export type MinorUnitAmount = number;

export function isMinorUnitAmount(value: unknown): value is MinorUnitAmount {
  return typeof value === "number" && Number.isSafeInteger(value);
}
