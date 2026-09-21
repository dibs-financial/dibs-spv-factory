import { assertEquals } from "jsr:@std/assert@1";
import { decideTransition, type PipelineFacts } from "./pipeline.ts";
import { formDPhase } from "./formD.ts";

const base: PipelineFacts = {
  seriesCreated: false,
  einRequest: null,
  bankStatus: null,
  executedDocTypes: [],
  kyc: "NONE",
  capitalCalls: { total: 0, received: 0 },
  formDStatus: null,
  blueSkyOpen: 0,
};

Deno.test("INTAKE waits for a SERIES_CREATED ledger event", () => {
  assertEquals(decideTransition("INTAKE", base).action, "wait");
  assertEquals(decideTransition("INTAKE", { ...base, seriesCreated: true }), {
    action: "advance",
    to: "SERIES_CREATED",
    reason: "SERIES_CREATED ledger event present",
  });
});

Deno.test("EIN: issued advances, failed holds, throttled waits, manual hold clears on issue", () => {
  assertEquals(
    decideTransition("EIN_PENDING", { ...base, einRequest: { status: "ISSUED", ein: "12-3456789" } }).action,
    "advance",
  );
  assertEquals(
    decideTransition("EIN_PENDING", { ...base, einRequest: { status: "ISSUED", ein: null } }).action,
    "wait",
  );
  const held = decideTransition("EIN_PENDING", { ...base, einRequest: { status: "FAILED", ein: null } });
  assertEquals(held, { action: "hold", to: "EIN_PENDING_MANUAL", reason: "EIN request FAILED; file paper SS-4" });
  assertEquals(
    decideTransition("EIN_PENDING", { ...base, einRequest: { status: "THROTTLED", ein: null } }).action,
    "wait",
  );
  assertEquals(
    decideTransition("EIN_PENDING_MANUAL", { ...base, einRequest: { status: "MANUAL_REQUIRED", ein: null } }).action,
    "wait",
  );
  assertEquals(
    decideTransition("EIN_PENDING_MANUAL", { ...base, einRequest: { status: "ISSUED", ein: "12-3456789" } }).action,
    "advance",
  );
});

Deno.test("documents require every required type executed", () => {
  assertEquals(decideTransition("DOCS_PENDING", { ...base, executedDocTypes: ["SERIES_SCHEDULE"] }).action, "wait");
  assertEquals(
    decideTransition("DOCS_PENDING", { ...base, executedDocTypes: ["SERIES_SCHEDULE", "SUBSCRIPTION_AGREEMENT"] })
      .action,
    "advance",
  );
});

Deno.test("KYC: pass advances, fail waits for humans", () => {
  assertEquals(decideTransition("KYC_BATCH_PENDING", { ...base, kyc: "PASS" }).action, "advance");
  assertEquals(decideTransition("KYC_BATCH_PENDING", { ...base, kyc: "FAIL" }).action, "wait");
});

Deno.test("capital calls must all be received, and at least one must exist", () => {
  assertEquals(decideTransition("CAPITAL_CALL_PENDING", base).action, "wait");
  assertEquals(
    decideTransition("CAPITAL_CALL_PENDING", { ...base, capitalCalls: { total: 3, received: 2 } }).action,
    "wait",
  );
  assertEquals(
    decideTransition("CAPITAL_CALL_PENDING", { ...base, capitalCalls: { total: 3, received: 3 } }).action,
    "advance",
  );
});

Deno.test("regulatory: Form D filed or not required, and no open blue-sky filings", () => {
  assertEquals(decideTransition("REGULATORY_PENDING", { ...base, formDStatus: "PENDING" }).action, "wait");
  assertEquals(
    decideTransition("REGULATORY_PENDING", { ...base, formDStatus: "FILED", blueSkyOpen: 1 }).action,
    "wait",
  );
  assertEquals(decideTransition("REGULATORY_PENDING", { ...base, formDStatus: "NOT_REQUIRED" }).action, "advance");
  assertEquals(decideTransition("INVESTOR_READY", base).action, "done");
});

Deno.test("pass-through stages advance unconditionally", () => {
  for (
    const [from, to] of [
      ["EIN_RECEIVED", "BANK_PENDING"],
      ["BANK_READY", "DOCS_PENDING"],
      ["DOCS_EXECUTED", "KYC_BATCH_PENDING"],
      ["KYC_COMPLETE", "CAPITAL_CALL_PENDING"],
      ["CAPITAL_RECEIVED", "REGULATORY_PENDING"],
    ] as const
  ) {
    const d = decideTransition(from, base);
    assertEquals(d.action, "advance");
    if (d.action === "advance") assertEquals(d.to, to);
  }
});

Deno.test("formDPhase: OK, WARNING from day 10, OVERDUE after the deadline", () => {
  const filing = { first_sale_date: "2026-03-01T00:00:00.000Z", filing_deadline: "2026-03-16T00:00:00.000Z" };
  assertEquals(formDPhase(filing, new Date("2026-03-05T00:00:00.000Z"))?.phase, "OK");
  assertEquals(formDPhase(filing, new Date("2026-03-11T12:00:00.000Z")), {
    daysElapsed: 10,
    daysRemaining: 5,
    phase: "WARNING",
  });
  assertEquals(formDPhase(filing, new Date("2026-03-17T00:00:00.000Z"))?.phase, "OVERDUE");
  assertEquals(formDPhase({ first_sale_date: null, filing_deadline: null }, new Date()), null);
});
