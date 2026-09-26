import { LEDGER_GENESIS_HASH, LEDGER_HASH_PREIMAGE } from "../../../schemas/constants.ts";
import { auditPackageCharge } from "../_shared/billing.ts";
import { insertCharge, loadSchedule } from "../_shared/billingStore.ts";
import { ledgerPreimage, legacyLedgerPreimage, sha256Hex } from "../_shared/hash.ts";
import { ok, serveFunction } from "../_shared/http.ts";
import { fetchLedger } from "../_shared/ledger.ts";
import { optionalBoolean, requireString } from "../_shared/validate.ts";

/**
 * Independent chain verification for one SPV's series_registry_log.
 *
 * Walks the ledger by sequence, recomputes every hash from stored columns and
 * checks that each previous_hash equals the prior entry's hash and that
 * sequences are contiguous. Rows imported from the earlier Base44 build (plain
 * JSON.stringify preimage) are accepted when they match the legacy preimage
 * and are counted separately.
 *
 * Read-only unless `audit_package: true` is sent: then the call is a client's
 * request for an audit evidence package, and a verified chain is billed once
 * per ledger head (billing_events AUDIT_PACKAGE, key audit:<spv>:<head
 * sequence>). An invalid chain is never billed. The ledger is never written.
 */
serveFunction(async ({ db, body }) => {
  const spv_id = requireString(body, "spv_id");
  const auditPackage = optionalBoolean(body, "audit_package") ?? false;
  const entries = await fetchLedger(db, spv_id);

  const problems: Array<{ entry_id: string; sequence: number; reason: string }> = [];
  let legacyEntries = 0;
  let expectedPrevious = LEDGER_GENESIS_HASH;
  let expectedSequence = 1;

  for (const entry of entries) {
    if (entry.sequence !== expectedSequence) {
      problems.push({
        entry_id: entry.id,
        sequence: entry.sequence,
        reason: `sequence ${entry.sequence} found where ${expectedSequence} was expected`,
      });
      expectedSequence = entry.sequence;
    }
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
      timestamp: entry.event_timestamp,
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
    expectedSequence += 1;
  }

  const valid = problems.length === 0;
  const head = entries.at(-1);
  let billing: Record<string, unknown> | undefined;
  if (auditPackage) {
    const { schedule, source, dealId } = await loadSchedule(db, spv_id);
    const c = auditPackageCharge({
      spv_id,
      valid,
      head_entry_id: head?.id ?? null,
      head_sequence: head?.sequence ?? 0,
      requested_at: new Date().toISOString(),
    }, schedule);
    if (!c) {
      billing = {
        charged: false,
        reason: !valid ? "chain did not verify" : !head ? "ledger is empty" : "audit package included in tier",
      };
    } else {
      const inserted = await insertCharge(db, { spv_id, deal_id: dealId }, schedule.tier, source, c);
      billing = !inserted
        ? { charged: false, reason: "package for this ledger head already billed", source_ref: c.source_ref }
        : { charged: true, source_ref: c.source_ref, amount: c.amount, currency: "USD" };
    }
  }

  return ok({
    spv_id,
    valid,
    entries_checked: entries.length,
    legacy_preimage_entries: legacyEntries,
    head_hash: entries.at(-1)?.hash ?? LEDGER_GENESIS_HASH,
    head_sequence: entries.at(-1)?.sequence ?? 0,
    hash_preimage: LEDGER_HASH_PREIMAGE,
    problems,
    ...(billing ? { audit_package: billing } : {}),
  });
});
