import { LEDGER_HASH_PREIMAGE } from "../schemas/constants.ts";
import { fail, ok, serveFunction } from "./_shared/http.ts";
import { appendLedgerEntry } from "./_shared/ledger.ts";
import { optionalObject, optionalString, requireString } from "./_shared/validate.ts";

/**
 * Hash-Chained Series Registry Append
 *
 * Creates a tamper-evident append-only entry in SeriesRegistryLog. Each entry's
 * hash is SHA-256 over the preimage documented in schemas/constants.ts
 * (LEDGER_HASH_PREIMAGE), using canonical (key-sorted) JSON for event_data so
 * auditors can recompute it from stored records.
 *
 * The ledger is detective evidence of series operations. It is not a
 * substitute for the separate books, records and accounts required under
 * 6 Del. C. § 18-215(b).
 *
 * Concurrency: Base44 has no transactions. If two appends chain onto the same
 * head, both entries persist and this function returns 409 LEDGER_FORK with
 * the sibling ids and raises a CRITICAL AlertLog entry. The fork must be
 * resolved by appending, never by editing.
 */
serveFunction(async ({ base44, body, caller }) => {
  const spv_id = requireString(body, "spv_id");
  const event_type = requireString(body, "event_type");
  const event_data = optionalObject(body, "event_data");
  const actor = optionalString(body, "actor") ?? (caller.is_service ? "system" : caller.email);

  const result = await appendLedgerEntry(base44, {
    spv_id,
    event_type,
    event_data,
    actor,
    actor_role: optionalString(body, "actor_role"),
    series_id: optionalString(body, "series_id"),
    correlation_id: optionalString(body, "correlation_id"),
  });

  const { entry } = result;
  const base = {
    entry_id: entry.id,
    hash: entry.hash,
    previous_hash: entry.previous_hash,
    sequence: entry.sequence,
    timestamp: entry.timestamp,
    hash_preimage: LEDGER_HASH_PREIMAGE,
  };

  if (result.fork) {
    try {
      await base44.entities.AlertLog.create({
        spv_id,
        alert_type: "LEDGER_FORK",
        severity: "CRITICAL",
        evidence: result.fork,
        recommended_action:
          "Concurrent ledger appends chained onto the same head. Reconcile by appending; do not edit or delete entries.",
        channels_sent: [],
        acknowledged: false,
      });
    } catch (alertError) {
      console.error("LEDGER_FORK alert could not be written", alertError);
    }
    return fail(
      409,
      "LEDGER_FORK",
      "Entry was written, but another entry chained onto the same predecessor concurrently.",
      {
        ...base,
        fork: result.fork,
      },
    );
  }

  return ok({
    ...base,
    message: `SeriesRegistryLog entry created: ${event_type} for SPV ${spv_id}`,
  });
});
