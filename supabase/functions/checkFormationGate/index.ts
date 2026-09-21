import { FORMATION_STAGES } from "../../../schemas/constants.ts";
import { fail, ok, serveFunction } from "../_shared/http.ts";
import { escalationState, type LedgerRow } from "../_shared/ledger.ts";
import { getActiveMasterEntity, masterHasLiabilityNotice } from "../_shared/master.ts";
import { unwrap } from "../_shared/records.ts";
import { requireEnum, requireString } from "../_shared/validate.ts";

/**
 * Formation Pipeline Gate — Pre-flight Check
 *
 * Runs before each formation stage transition. Checks:
 * 1. Master entity statutory gate (§ 18-215(b) liability notice; exactly one ACTIVE master).
 * 2. Whether the SPV has an unresolved ESCALATION in the series ledger. An
 *    escalation is cleared by appending an ESCALATION_RESOLVED event, never by
 *    editing the ledger.
 *
 * Idempotency against the SPV's current stage is enforced by the pipeline
 * runner that calls this gate; the deal-model tables are not part of this
 * repository.
 *
 * Returns a go/no-go decision with evidence.
 */
serveFunction(async ({ db, body }) => {
  const spv_id = requireString(body, "spv_id");
  const target_stage = requireEnum(body, "target_stage", FORMATION_STAGES);

  const master = await getActiveMasterEntity(db);
  if (!masterHasLiabilityNotice(master)) {
    return fail(
      422,
      "STATUTORY_BLOCK",
      "Master Certificate of Formation missing § 18-215(b) liability notice. HARD BLOCK.",
      {
        gate_passed: false,
        spv_id,
        target_stage,
      },
    );
  }

  const escalationEvents = unwrap(
    await db.from("series_registry_log").select("*").eq("spv_id", spv_id).in("event_type", [
      "ESCALATION",
      "ESCALATION_RESOLVED",
    ]),
  ) as LedgerRow[];
  const state = escalationState(escalationEvents);

  if (state.active && state.escalation) {
    return fail(
      422,
      "ESCALATION_BLOCK",
      "SPV has an unresolved escalation. Append an ESCALATION_RESOLVED ledger event before proceeding.",
      {
        gate_passed: false,
        spv_id,
        target_stage,
        escalation_entry_id: state.escalation.id,
        escalated_at: state.escalation.event_timestamp,
        escalation: state.escalation.event_data,
      },
    );
  }

  return ok({
    gate_passed: true,
    spv_id,
    target_stage,
    master_entity: master.legal_name,
    last_escalation_resolved_at: state.resolution?.event_timestamp ?? null,
    message: `Gate passed for SPV ${spv_id} → ${target_stage}. Statutory check clear, no unresolved escalations.`,
  });
});
