import { ok, serveFunction } from "../_shared/http.ts";
import { getActiveMasterEntity, masterHasLiabilityNotice } from "../_shared/master.ts";

/**
 * Statutory Kill-Switch: Checks that the master Delaware Series LLC
 * Certificate of Formation contains the § 18-215(b) liability limitation notice.
 *
 * 200 with has_notice=true  — gate passed.
 * 200 with has_notice=false — HARD BLOCK: notice missing; all formation stops.
 * 422                       — no master, no ACTIVE master, or more than one ACTIVE master.
 */
serveFunction(async ({ db }) => {
  const master = await getActiveMasterEntity(db);
  const hasNotice = masterHasLiabilityNotice(master);

  return ok({
    has_notice: hasNotice,
    master_entity_id: master.id,
    legal_name: master.legal_name,
    status: master.status,
    message: hasNotice
      ? "Statutory gate passed — master Certificate of Formation contains § 18-215(b) liability notice."
      : "HARD BLOCK — master Certificate of Formation is missing the § 18-215(b) liability limitation notice. All SPV formation is blocked until this is resolved by counsel.",
  });
}, { parseBody: false });
