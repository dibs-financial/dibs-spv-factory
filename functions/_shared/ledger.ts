import type { Base44Client } from "npm:@base44/sdk@0.8.31";
import { isOneOf, LEDGER_EVENT_TYPES, LEDGER_GENESIS_HASH, type LedgerEventType } from "../../schemas/constants.ts";
import { computeLedgerHash } from "./hash.ts";
import { HttpError } from "./errors.ts";
import { type Rec, toMillis } from "./records.ts";

export interface LedgerEntry {
  spv_id: string;
  series_id?: string;
  event_type: LedgerEventType;
  event_data: Record<string, unknown>;
  hash: string;
  previous_hash: string;
  actor: string;
  actor_role?: string;
  source_system?: string;
  correlation_id?: string;
  /** Exact ISO timestamp used in the hash preimage. */
  timestamp: string;
  /** Monotonic per-SPV position. Legacy entries written before this field existed have none. */
  sequence?: number;
}

export type LedgerRecord = Rec<LedgerEntry>;

/**
 * Orders entries newest-first. Entries carrying a sequence number always rank
 * above legacy entries without one; ties fall back to the hashed timestamp and
 * then the server created_date.
 */
export function compareNewestFirst(a: LedgerRecord, b: LedgerRecord): number {
  const aSeq = typeof a.sequence === "number" ? a.sequence : -1;
  const bSeq = typeof b.sequence === "number" ? b.sequence : -1;
  if (aSeq !== bSeq) return bSeq - aSeq;
  const byTimestamp = toMillis(b.timestamp) - toMillis(a.timestamp);
  if (byTimestamp !== 0) return byTimestamp;
  return toMillis(b.created_date) - toMillis(a.created_date);
}

export function nextSequence(latest: LedgerRecord | undefined): number {
  return (typeof latest?.sequence === "number" ? latest.sequence : 0) + 1;
}

/** Fetches every ledger entry for an SPV, oldest first, paging through the API. */
export async function fetchLedger(base44: Base44Client, spvId: string): Promise<LedgerRecord[]> {
  const pageSize = 500;
  const all: LedgerRecord[] = [];
  for (let skip = 0;; skip += pageSize) {
    const page = (await base44.entities.SeriesRegistryLog.filter(
      { spv_id: spvId },
      "created_date",
      pageSize,
      skip,
    )) as LedgerRecord[];
    all.push(...page);
    if (page.length < pageSize) break;
  }
  return all.sort((a, b) => compareNewestFirst(b, a));
}

export async function getLatestLedgerEntry(
  base44: Base44Client,
  spvId: string,
): Promise<LedgerRecord | undefined> {
  // The newest entry is almost always among the most recently created rows;
  // a small window keeps this O(1) while still tolerating clock skew.
  const recent = (await base44.entities.SeriesRegistryLog.filter(
    { spv_id: spvId },
    "-created_date",
    25,
  )) as LedgerRecord[];
  return [...recent].sort(compareNewestFirst)[0];
}

export interface AppendLedgerInput {
  spv_id: string;
  event_type: string;
  event_data?: Record<string, unknown>;
  actor?: string;
  actor_role?: string;
  series_id?: string;
  correlation_id?: string;
}

export interface AppendLedgerResult {
  entry: LedgerRecord;
  /** Present when another entry was chained onto the same predecessor concurrently. */
  fork?: { previous_hash: string; sibling_entry_ids: string[] };
}

/**
 * Hash-chained append. Reads the current chain head, computes the hash over
 * the documented preimage and creates the entry. Base44 has no transactions,
 * so a concurrent append can chain onto the same head; the post-write check
 * detects that and reports it as a fork so the caller can escalate. The entry
 * itself is never modified or deleted (APPEND_ONLY).
 */
export async function appendLedgerEntry(
  base44: Base44Client,
  input: AppendLedgerInput,
): Promise<AppendLedgerResult> {
  if (!isOneOf(LEDGER_EVENT_TYPES, input.event_type)) {
    throw new HttpError(
      400,
      "INVALID_EVENT_TYPE",
      `event_type must be one of: ${LEDGER_EVENT_TYPES.join(", ")}`,
    );
  }

  const latest = await getLatestLedgerEntry(base44, input.spv_id);
  const previousHash = latest?.hash || LEDGER_GENESIS_HASH;
  const sequence = nextSequence(latest);
  const timestamp = new Date().toISOString();
  const eventData = input.event_data ?? {};
  const hash = await computeLedgerHash({
    previousHash,
    spvId: input.spv_id,
    eventType: input.event_type,
    timestamp,
    eventData,
  });

  const entry = (await base44.entities.SeriesRegistryLog.create({
    spv_id: input.spv_id,
    series_id: input.series_id,
    event_type: input.event_type,
    event_data: eventData,
    hash,
    previous_hash: previousHash,
    actor: input.actor ?? "system",
    actor_role: input.actor_role,
    source_system: "elara",
    correlation_id: input.correlation_id,
    timestamp,
    sequence,
  })) as LedgerRecord;

  const siblings = (await base44.entities.SeriesRegistryLog.filter({
    spv_id: input.spv_id,
    previous_hash: previousHash,
  })) as LedgerRecord[];
  if (siblings.length > 1) {
    return {
      entry,
      fork: { previous_hash: previousHash, sibling_entry_ids: siblings.map((s) => s.id).sort() },
    };
  }
  return { entry };
}

export interface EscalationState {
  active: boolean;
  escalation?: LedgerRecord;
  resolution?: LedgerRecord;
}

/**
 * An SPV is blocked when its most recent ESCALATION is newer than its most
 * recent ESCALATION_RESOLVED. Because the ledger is append-only, resolution is
 * itself an event rather than an edit.
 */
export function escalationState(entries: LedgerRecord[]): EscalationState {
  const sorted = [...entries].sort(compareNewestFirst);
  const escalation = sorted.find((e) => e.event_type === "ESCALATION");
  const resolution = sorted.find((e) => e.event_type === "ESCALATION_RESOLVED");
  if (!escalation) return { active: false, resolution };
  if (!resolution) return { active: true, escalation };
  const active = compareNewestFirst(escalation, resolution) < 0;
  return { active, escalation, resolution };
}
