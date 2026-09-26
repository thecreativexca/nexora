import "server-only";

/**
 * Business-timezone helpers for the reports module (Phase 5).
 *
 * "Today" and "last 7 days" boundaries are always computed in the business
 * timezone - never the server clock's zone and never a browser-provided zone.
 * The zone is configured once with `BUSINESS_TIMEZONE` (default Asia/Kolkata)
 * so the storefront, POS and reports all interpret a "day" identically.
 *
 * All functions return plain UTC `Date` instants; date-key strings ("YYYY-MM-DD")
 * are rendered in the business timezone for stable day bucketing.
 */

const BUSINESS_TIMEZONE_DEFAULT = "Asia/Kolkata";

export function getBusinessTimezone(): string {
  const configured = process.env.BUSINESS_TIMEZONE?.trim();
  return configured || BUSINESS_TIMEZONE_DEFAULT;
}

/** Wall-clock representation of a Date in the business timezone. */
function partsInTimeZone(
  timeZone: string,
  when: Date,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map = new Map<string, string>();
  for (const part of formatter.formatToParts(when)) {
    if (part.type !== "literal") map.set(part.type, part.value);
  }
  const asNumber = (key: string) => Number(map.get(key) ?? "0");
  return {
    year: asNumber("year"),
    month: asNumber("month"),
    day: asNumber("day"),
    hour: asNumber("hour") % 24,
    minute: asNumber("minute"),
    second: asNumber("second"),
  };
}

/** Offset (ms) applied to a UTC instant to produce its wall time in `timeZone`. */
function timeZoneOffsetMs(timeZone: string, utcInstant: Date): number {
  const wall = partsInTimeZone(timeZone, utcInstant);
  const wallAsUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return wallAsUtc - utcInstant.getTime();
}

/** Converts a wall-clock time in the business timezone to a UTC Date. */
function zonedWallToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  // Guess once, then correct with the actual offset at that UTC instant. For
  // zones without DST (Asia/Kolkata) one pass is exact; the refinement pass
  // keeps zones with DST transitions correct across boundaries.
  const firstGuess = new Date(wallAsUtc - timeZoneOffsetMs(timeZone, new Date(wallAsUtc)));
  const refined = new Date(wallAsUtc - timeZoneOffsetMs(timeZone, new Date(firstGuess.getTime())));
  return refined;
}

export interface BusinessDay {
  /** "YYYY-MM-DD" rendered in the business timezone - the aggregation bucket key. */
  dateKey: string;
  /** Human-friendly label for charts, e.g. "Wed, 17 Sep". */
  label: string;
  /** UTC instant of midnight in the business timezone. */
  startUtc: Date;
  /** UTC instant of the following midnight. */
  endUtc: Date;
}

function dayLabel(timeZone: string, dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const atNoon = zonedWallToUtc(timeZone, year, month, day, 12, 0, 0);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(atNoon);
}

/**
 * The `count` business days ending at the business-day that contains `now`
 * (1 = only today, 7 = today plus the previous six days). Ordered oldest first.
 */
export function getBusinessDays(count: number, now: Date = new Date()): BusinessDay[] {
  const timeZone = getBusinessTimezone();
  const todayParts = partsInTimeZone(timeZone, now);
  const days: BusinessDay[] = [];

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    // Midnight of the target business-day date, tracked as a naive UTC date so
    // the wall calendar arithmetic (and -1 day per step) stays in the business
    // timezone.
    const midnight = new Date(
      Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day, 0, 0, 0) -
        offset * 24 * 60 * 60 * 1000,
    );
    const year = midnight.getUTCFullYear();
    const month = midnight.getUTCMonth() + 1;
    const day = midnight.getUTCDate();
    const start = zonedWallToUtc(timeZone, year, month, day);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const dateKey = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(
      day,
    ).padStart(2, "0")}`;
    days.push({ dateKey, label: dayLabel(timeZone, dateKey), startUtc: start, endUtc: end });
  }

  return days;
}

/** The business day that contains `now` (start + end instants). */
export function getTodayRange(now: Date = new Date()): { startUtc: Date; endUtc: Date } {
  const [today] = getBusinessDays(1, now);
  return { startUtc: today.startUtc, endUtc: today.endUtc };
}