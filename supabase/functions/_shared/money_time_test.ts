import { assertEquals } from "jsr:@std/assert@1";
import { computeCallAmount, roundToCents } from "./money.ts";
import { addCalendarDays, calendarDateInZone, monthKeyInZone } from "./time.ts";

Deno.test("roundToCents avoids float drift", () => {
  assertEquals(roundToCents(1.005), 1.01);
  assertEquals(roundToCents(0.1 + 0.2), 0.3);
  assertEquals(computeCallAmount(100000, 33.33), 33330);
  assertEquals(computeCallAmount(12345.67, 12.5), 1543.21);
  assertEquals(computeCallAmount(50000, 100), 50000);
});

Deno.test("calendarDateInZone follows the IRS Eastern day, not UTC", () => {
  const lateEveningEastern = new Date("2026-07-02T02:30:00.000Z"); // 22:30 on Jul 1 in New York (EDT)
  assertEquals(calendarDateInZone(lateEveningEastern, "America/New_York"), "2026-07-01");
  assertEquals(calendarDateInZone(lateEveningEastern, "UTC"), "2026-07-02");
  assertEquals(monthKeyInZone(new Date("2026-08-01T03:00:00.000Z"), "America/New_York"), "2026-07");
});

Deno.test("addCalendarDays adds whole days", () => {
  assertEquals(addCalendarDays(new Date("2026-03-01T12:00:00.000Z"), 15).toISOString(), "2026-03-16T12:00:00.000Z");
});
