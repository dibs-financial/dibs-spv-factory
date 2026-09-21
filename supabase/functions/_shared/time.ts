const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar date (YYYY-MM-DD) of `date` as observed in `timeZone`. */
export function calendarDateInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Calendar month (YYYY-MM) of `date` as observed in `timeZone`. */
export function monthKeyInZone(date: Date, timeZone: string): string {
  return calendarDateInZone(date, timeZone).slice(0, 7);
}

/** Adds whole 24-hour days. The operational Form D clock is a UTC day count. */
export function addCalendarDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}
