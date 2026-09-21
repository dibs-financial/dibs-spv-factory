import { LEDGER_GENESIS_HASH, LEDGER_HASH_PREIMAGE } from "../schemas/constants.ts";
import { ledgerPreimage, legacyLedgerPreimage, sha256Hex } from "./_shared/hash.ts";
import { ok, serveFunction } from "./_shared/http.ts";
import { fetchLedger } from "./_shared/ledger.ts";
import { requireString } from "./_shared/validate.ts";

/**
 * Independent chain verification for one SPV's SeriesRegistryLog.
 *
 * Walks the ledger oldest-first, recomputes every hash from stored fields and
 * checks that each previous_hash equals the prior entry's hash. Entries written
 * before canonical-JSON hashing are accepted when they match the legacy
 * preimage and are reported as such. Read-only.
 */
serveFunction(async ({ base44, body }) => {
  const spv_id = requireString(body, "spv_id");
  const entries = await fetchLedger(base44, spv_id);

  const problems: Array<{ entry_id: string; sequence?: number; reason: string }> = [];
  let legacyEntries = 0;
  let expectedPrevious = LEDGER_GENESIS_HASH;

  for (const entry of entries) {
    if (entry.previous_hash !== expectedPrevious) {
      problems.push({
        entry_id: entry.id,
        sequence: entry.sequence,
        reason: `previous_hash ${entry.previous_hash} does not match prior entry hash ${expectedPrevious}`,
      });
    }
    const input = {
      previousHash: entry.previous_hash,
      spvId: entry.spv_id,
      eventType: entry.event_type,
      timestamp: entry.timestamp,
      eventData: entry.event_data,
    };
    const canonical = await sha256Hex(ledgerPreimage(input));
    if (canonical !== entry.hash) {
      const legacy = await sha256Hex(legacyLedgerPreimage(input));
      if (legacy === entry.hash) {
        legacyEntries += 1;
      } else {
        problems.push({
          entry_id: entry.id,
          sequence: entry.sequence,
          reason: "stored hash does not match recomputed hash",
        });
      }
    }
    expectedPrevious = entry.hash;
  }

  return ok({
    spv_id,
    valid: problems.length === 0,
    entries_checked: entries.length,
    legacy_preimage_entries: legacyEntries,
    head_hash: entries.at(-1)?.hash ?? LEDGER_GENESIS_HASH,
    hash_preimage: LEDGER_HASH_PREIMAGE,
    problems,
  });
});
