import { assert, assertEquals } from "jsr:@std/assert@1";
import { planFirstSale } from "./firstSale.ts";

const at = new Date("2026-03-01T12:00:00.000Z");

Deno.test("soft circle on a brand-new SPV never starts the clock", () => {
  const plan = planFirstSale("SOFT_CIRCLE", null, at);
  assertEquals(plan.clockStarted, false);
  assertEquals(plan.updates.soft_circle_at, at.toISOString());
  assertEquals(plan.updates.status, "NOT_REQUIRED");
  assertEquals(plan.updates.irrevocable_commitment_at, undefined);
  assertEquals(plan.updates.filing_deadline, undefined);
});

for (const type of ["SUBSCRIPTION_SIGNED", "FUNDS_RECEIVED", "FUNDS_CLEARED"] as const) {
  Deno.test(`${type} is not a first sale`, () => {
    const plan = planFirstSale(type, null, at);
    assertEquals(plan.clockStarted, false);
    assertEquals(plan.updates.first_sale_date, undefined);
    assert(Object.keys(plan.updates).includes(type.toLowerCase() + "_at"));
  });
}

Deno.test("irrevocable commitment starts the clock at the commitment time", () => {
  const plan = planFirstSale("IRREVOCABLE_COMMITMENT", null, at);
  assertEquals(plan.clockStarted, true);
  assertEquals(plan.updates.first_sale_date, "2026-03-01T12:00:00.000Z");
  assertEquals(plan.updates.irrevocable_commitment_at, "2026-03-01T12:00:00.000Z");
  assertEquals(plan.updates.filing_deadline, "2026-03-16T12:00:00.000Z");
  assertEquals(plan.updates.status, "PENDING");
});

Deno.test("second irrevocable commitment never restarts the clock", () => {
  const existing = {
    irrevocable_commitment_at: "2026-02-01T00:00:00.000Z",
    filing_deadline: "2026-02-16T00:00:00.000Z",
    status: "PENDING" as const,
  };
  const plan = planFirstSale("IRREVOCABLE_COMMITMENT", existing, at);
  assertEquals(plan.clockStarted, false);
  assertEquals(plan.clockAlreadyRunning, true);
  assertEquals(plan.updates, {});
  assertEquals(plan.filingDeadline, "2026-02-16T00:00:00.000Z");
});

Deno.test("a FILED record is never moved back to PENDING", () => {
  const plan = planFirstSale("IRREVOCABLE_COMMITMENT", { status: "FILED" }, at);
  assertEquals(plan.clockStarted, true);
  assertEquals(plan.updates.status, undefined);
});

Deno.test("signed timestamp is written to subscription_signed_at, once", () => {
  const first = planFirstSale("SUBSCRIPTION_SIGNED", { irrevocable_commitment_at: "x" }, at);
  assertEquals(first.updates, { subscription_signed_at: at.toISOString() });
  const again = planFirstSale("SUBSCRIPTION_SIGNED", { subscription_signed_at: "earlier" }, at);
  assertEquals(again.updates, {});
});
