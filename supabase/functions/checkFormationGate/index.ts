import { FORMATION_STAGES } from "../../../schemas/constants.ts";
import { evaluateFormationGate } from "../_shared/gate.ts";
import { fail, ok, serveFunction } from "../_shared/http.ts";
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
 * The same decision drives the dibs-spv-formation-pipeline runner (see
 * _shared/gate.ts). Returns a go/no-go decision with evidence.
 */
serveFunction(async ({ db, body }) => {
  const spv_id = requireString(body, "spv_id");
  const target_stage = requireEnum(body, "target_stage", FORMATION_STAGES);

  const gate = await evaluateFormationGate(db, spv_id);
  if (!gate.passed) {
    return fail(422, gate.code, gate.message, { gate_passed: false, spv_id, target_stage, ...gate.extra });
  }

  return ok({
    gate_passed: true,
    spv_id,
    target_stage,
    master_entity: gate.master_entity,
    last_escalation_resolved_at: gate.last_escalation_resolved_at,
    message: `Gate passed for SPV ${spv_id} → ${target_stage}. Statutory check clear, no unresolved escalations.`,
  });
});
