import { assertEquals } from "jsr:@std/assert@1";
import { compareNewestFirst, escalationState, latestKycOutcomes, type LedgerRow, nextSequence } from "./ledger.ts";

function entry(over: Partial<LedgerRow>): LedgerRow {
  return {
    id: over.id ?? crypto.randomUUID(),
    created_at: "2026-01-01T00:00:00.000Z",
    spv_id: "spv_1",
    series_id: null,
    event_type: "STATE_CHANGE",
    event_data: {},
    hash: "h",
    previous_hash: "GENESIS",
    event_timestamp: "2026-01-01T00:00:00.000Z",
    sequence: 1,
    actor: "system",
    actor_role: null,
    source_system: "factory",
    correlation_id: null,
    ...over,
  };
}

Deno.test("compareNewestFirst orders by sequence, then created_at", () => {
  const s1 = entry({ id: "s1", sequence: 1, created_at: "2026-05-01T00:00:00.000Z" });
  const s2 = entry({ id: "s2", sequence: 2, created_at: "2026-01-01T00:00:00.000Z" });
  const s2b = entry({ id: "s2b", sequence: 2, created_at: "2026-02-01T00:00:00.000Z" });
  const sorted = [s1, s2, s2b].sort(compareNewestFirst).map((e) => e.id);
  assertEquals(sorted, ["s2b", "s2", "s1"]);
});

Deno.test("nextSequence starts at 1 and increments", () => {
  assertEquals(nextSequence(null), 1);
  assertEquals(nextSequence(undefined), 1);
  assertEquals(nextSequence(entry({ sequence: 7 })), 8);
});

Deno.test("escalationState: no escalation → not active", () => {
  assertEquals(escalationState([]).active, false);
  assertEquals(escalationState([entry({ event_type: "KYC_PASS" })]).active, false);
});

Deno.test("escalationState: escalation without resolution blocks", () => {
  const state = escalationState([entry({ id: "e", event_type: "ESCALATION", sequence: 3 })]);
  assertEquals(state.active, true);
  assertEquals(state.escalation?.id, "e");
});

Deno.test("escalationState: later resolution clears, later escalation re-blocks", () => {
  const esc1 = entry({ event_type: "ESCALATION", sequence: 1 });
  const res1 = entry({ event_type: "ESCALATION_RESOLVED", sequence: 2 });
  assertEquals(escalationState([esc1, res1]).active, false);
  const esc2 = entry({ event_type: "ESCALATION", sequence: 3 });
  assertEquals(escalationState([res1, esc2, esc1]).active, true);
});

Deno.test("latestKycOutcomes keeps the latest result per investor, not per SPV", () => {
  const ev = (spv_id: string, sequence: number, event_type: string, investor_id?: string) => ({
    spv_id,
    sequence,
    event_type,
    event_data: investor_id ? { investor_id } : {},
  });
  const out = latestKycOutcomes([
    ev("a", 1, "KYC_FAIL", "inv_1"),
    ev("a", 2, "KYC_PASS", "inv_2"),
    ev("a", 3, "KYC_FAIL", "inv_2"),
    ev("a", 4, "KYC_PASS", "inv_2"),
    ev("b", 1, "KYC_PASS", "inv_1"),
    ev("b", 2, "KYC_FAIL"),
  ]);
  const fails = out.filter((e) => e.event_type === "KYC_FAIL").map((e) => `${e.spv_id}:${e.sequence}`).sort();
  assertEquals(fails, ["a:1", "b:2"]);
  assertEquals(out.length, 4);
});
