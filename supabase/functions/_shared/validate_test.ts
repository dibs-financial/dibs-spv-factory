import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { HttpError } from "./errors.ts";
import { optionalBoolean, optionalPastTimestamp } from "./validate.ts";

const now = new Date("2026-03-20T12:00:00.000Z");

Deno.test("optionalPastTimestamp accepts recent values and rejects the future", () => {
  assertEquals(
    optionalPastTimestamp({ t: "2026-03-19T00:00:00Z" }, "t", { now })?.toISOString(),
    "2026-03-19T00:00:00.000Z",
  );
  assertEquals(optionalPastTimestamp({}, "t", { now }), undefined);
  assertThrows(() => optionalPastTimestamp({ t: "2026-03-21T00:00:00Z" }, "t", { now }), HttpError, "future");
  assertThrows(() => optionalPastTimestamp({ t: "not a date" }, "t", { now }), HttpError, "ISO-8601");
});

Deno.test("optionalPastTimestamp enforces maxAgeDays unless acknowledged", () => {
  const body = { t: "2026-02-01T00:00:00Z" };
  const err = assertThrows(
    () => optionalPastTimestamp(body, "t", { now, maxAgeDays: 15, overrideKey: "acknowledge_late" }),
    HttpError,
  );
  assertEquals(err.code, "TIMESTAMP_TOO_OLD");
  const accepted = optionalPastTimestamp({ ...body, acknowledge_late: true }, "t", {
    now,
    maxAgeDays: 15,
    overrideKey: "acknowledge_late",
  });
  assertEquals(accepted?.toISOString(), "2026-02-01T00:00:00.000Z");
  assertEquals(
    optionalPastTimestamp({ t: "2026-03-10T00:00:00Z" }, "t", { now, maxAgeDays: 15 })?.toISOString(),
    "2026-03-10T00:00:00.000Z",
  );
});

Deno.test("optionalBoolean accepts booleans and absence, rejects anything else", () => {
  assertEquals(optionalBoolean({ a: true }, "a"), true);
  assertEquals(optionalBoolean({ a: false }, "a"), false);
  assertEquals(optionalBoolean({}, "a"), undefined);
  assertEquals(optionalBoolean({ a: null }, "a"), undefined);
  assertThrows(() => optionalBoolean({ a: "true" }, "a"), HttpError);
  assertThrows(() => optionalBoolean({ a: 1 }, "a"), HttpError);
});
