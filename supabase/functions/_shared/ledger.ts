import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { isOneOf, LEDGER_EVENT_TYPES, LEDGER_GENESIS_HASH } from "../../../schemas/constants.ts";
import type { LedgerRow } from "../../../schemas/types.ts";
import { HttpError } from "./errors.ts";
import { computeLedgerHash } from "./hash.ts";
import { isUniqueViolation, toMillis, unwrap } from "./records.ts";

export type { LedgerRow };

const TABLE = "series_registry_log";
const MAX_APPEND_ATTEMPTS = 5;

/** Newest first by sequence; created_at only breaks ties in malformed data. */
export function compareNewestFirst(a: LedgerRow, b: LedgerRow): number {
  if (a.sequence !== b.sequence) return b.sequence - a.sequence;
  return toMillis(b.created_at) - toMillis(a.created_at);
}

export function nextSequence(latest: LedgerRow | null | undefined): number {
  return (latest?.sequence ?? 0) + 1;
}

/** Every ledger entry for an SPV, oldest first, paging through PostgREST's row limit. */
export async function fetchLedger(db: SupabaseClient, spvId: string): Promise<LedgerRow[]> {
  const pageSize = 1000;
  const all: LedgerRow[] = [];
  for (let from = 0;; from += pageSize) {
    const page = unwrap(
      await db.from(TABLE).select("*").eq("spv_id", spvId).order("sequence", { ascending: true }).range(
        from,
        from + pageSize - 1,
      ),
    ) as LedgerRow[];
    all.push(...page);
    if (page.length < pageSize) break;
  }
  return all;
}

export async function getLatestLedgerEntry(db: SupabaseClient, spvId: string): Promise<LedgerRow | null> {
  return unwrap(
    await db.from(TABLE).select("*").eq("spv_id", spvId).order("sequence", { ascending: false }).limit(1)
      .maybeSingle(),
  ) as LedgerRow | null;
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
  entry: LedgerRow;
  /** Number of insert attempts; >1 means a concurrent append was serialised behind us. */
  attempts: number;
}

/**
 * Hash-chained append. Reads the chain head, computes the hash over the
 * documented preimage and inserts. The unique (spv_id, sequence) and
 * (spv_id, previous_hash) constraints make a fork impossible: if another
 * writer got there first the insert fails with unique_violation and we
 * re-read the head and retry. The table trigger forbids UPDATE/DELETE, so
 * entries are immutable once written.
 */
export async function appendLedgerEntry(db: SupabaseClient, input: AppendLedgerInput): Promise<AppendLedgerResult> {
  if (!isOneOf(LEDGER_EVENT_TYPES, input.event_type)) {
    throw new HttpError(
      400,
      "INVALID_EVENT_TYPE",
      `event_type must be one of: ${LEDGER_EVENT_TYPES.join(", ")}`,
    );
  }
  const eventData = input.event_data ?? {};

  for (let attempt = 1; attempt <= MAX_APPEND_ATTEMPTS; attempt++) {
    const latest = await getLatestLedgerEntry(db, input.spv_id);
    const previousHash = latest?.hash ?? LEDGER_GENESIS_HASH;
    const sequence = nextSequence(latest);
    const timestamp = new Date().toISOString();
    const hash = await computeLedgerHash({
      previousHash,
      spvId: input.spv_id,
      eventType: input.event_type,
      timestamp,
      eventData,
    });

    const { data, error } = await db.from(TABLE).insert({
      spv_id: input.spv_id,
      series_id: input.series_id ?? null,
      event_type: input.event_type,
      event_data: eventData,
      hash,
      previous_hash: previousHash,
      event_timestamp: timestamp,
      sequence,
      actor: input.actor ?? "system",
      actor_role: input.actor_role ?? null,
      correlation_id: input.correlation_id ?? null,
    }).select("*").single();

    if (!error) return { entry: data as LedgerRow, attempts: attempt };
    if (!isUniqueViolation(error)) throw error;
  }

  throw new HttpError(
    409,
    "LEDGER_CONTENTION",
    `Could not append to the ledger for SPV ${input.spv_id} after ${MAX_APPEND_ATTEMPTS} attempts; concurrent writers are ahead. Retry.`,
  );
}

export interface EscalationState {
  active: boolean;
  escalation?: LedgerRow;
  resolution?: LedgerRow;
}

/**
 * An SPV is blocked when its most recent ESCALATION is newer than its most
 * recent ESCALATION_RESOLVED. Because the ledger is append-only, resolution is
 * itself an event rather than an edit.
 */
export function escalationState(entries: LedgerRow[]): EscalationState {
  const sorted = [...entries].sort(compareNewestFirst);
  const escalation = sorted.find((e) => e.event_type === "ESCALATION");
  const resolution = sorted.find((e) => e.event_type === "ESCALATION_RESOLVED");
  if (!escalation) return { active: false, resolution };
  if (!resolution) return { active: true, escalation };
  const active = compareNewestFirst(escalation, resolution) < 0;
  return { active, escalation, resolution };
}
