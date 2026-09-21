import { LEDGER_EVENT_TYPES, LEDGER_HASH_PREIMAGE } from "../../../schemas/constants.ts";
import { ok, serveFunction } from "../_shared/http.ts";
import { appendLedgerEntry } from "../_shared/ledger.ts";
import { optionalObject, optionalString, requireEnum, requireString } from "../_shared/validate.ts";

/**
 * Hash-Chained Series Registry Append
 *
 * Creates a tamper-evident append-only entry in series_registry_log. Each
 * entry's hash is SHA-256 over the preimage documented in schemas/constants.ts
 * (LEDGER_HASH_PREIMAGE), using canonical (key-sorted) JSON for event_data so
 * auditors can recompute it from stored rows.
 *
 * The ledger is detective evidence of series operations. It is not a
 * substitute for the separate books, records and accounts required under
 * 6 Del. C. § 18-215(b).
 *
 * Concurrency: unique constraints on (spv_id, sequence) and
 * (spv_id, previous_hash) make a fork impossible; a losing writer re-reads the
 * head and retries. A database trigger forbids UPDATE and DELETE.
 */
serveFunction(async ({ db, body, caller }) => {
  const spv_id = requireString(body, "spv_id");
  const event_type = requireEnum(body, "event_type", LEDGER_EVENT_TYPES);
  const event_data = optionalObject(body, "event_data");

  // Human callers cannot label the event: actor and actor_role are taken from
  // the authenticated user. Service tokens (workflows) may name the workflow.
  const actor = caller.is_service ? optionalString(body, "actor") ?? "system" : caller.email ?? caller.id ?? "user";
  const actor_role = caller.is_service ? optionalString(body, "actor_role") : caller.roles.join(",");

  const { entry, attempts } = await appendLedgerEntry(db, {
    spv_id,
    event_type,
    event_data,
    actor,
    actor_role,
    series_id: optionalString(body, "series_id"),
    correlation_id: optionalString(body, "correlation_id"),
  });

  return ok({
    entry_id: entry.id,
    actor,
    hash: entry.hash,
    previous_hash: entry.previous_hash,
    sequence: entry.sequence,
    timestamp: entry.event_timestamp,
    attempts,
    hash_preimage: LEDGER_HASH_PREIMAGE,
    message: `series_registry_log entry created: ${event_type} for SPV ${spv_id}`,
  });
});
