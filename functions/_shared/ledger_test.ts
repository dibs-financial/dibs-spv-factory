import { assertEquals } from "jsr:@std/assert@1";
import { compareNewestFirst, escalationState, type LedgerRecord, nextSequence } from "./ledger.ts";

function entry(over: Partial<LedgerRecord>): LedgerRecord {
  return {
    id: over.id ?? crypto.randomUUID(),
    created_date: "2026-01-01T00:00:00.000Z",
    spv_id: "spv_1",
    event_type: "STATE_CHANGE",
    event_data: {},
    hash: "h",
    previous_hash: "GENESIS",
    actor: "system",
    timestamp: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

Deno.test("compareNewestFirst prefers sequence, then timestamp, then created_date", () => {
  const legacy = entry({ id: "legacy", timestamp: "2026-05-01T00:00:00.000Z" });
  const seq1 = entry({ id: "s1", sequence: 1, timestamp: "2026-01-01T00:00:00.000Z" });
  const seq2 = entry({ id: "s2", sequence: 2, timestamp: "2026-01-02T00:00:00.000Z" });
  const sorted = [legacy, seq1, seq2].sort(compareNewestFirst).map((e) => e.id);
  assertEquals(sorted, ["s2", "s1", "legacy"]);
});

Deno.test("nextSequence starts at 1 and increments", () => {
  assertEquals(nextSequence(undefined), 1);
  assertEquals(nextSequence(entry({})), 1);
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
