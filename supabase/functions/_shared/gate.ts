import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { HttpError } from "./errors.ts";
import { escalationState, type LedgerRow } from "./ledger.ts";
import { getActiveMasterEntity, masterHasLiabilityNotice } from "./master.ts";
import { unwrap } from "./records.ts";

export type GateResult =
  | {
    passed: true;
    master_entity: string;
    last_escalation_resolved_at: string | null;
  }
  | {
    passed: false;
    code: "STATUTORY_BLOCK" | "ESCALATION_BLOCK" | string;
    message: string;
    extra: Record<string, unknown>;
  };

/**
 * The formation gate as a reusable decision: statutory master-entity check
 * (exactly one ACTIVE master with the § 18-215(b) notice) and no unresolved
 * ESCALATION in the SPV's ledger. Used by checkFormationGate and by the
 * pipeline runner before every stage transition.
 */
export async function evaluateFormationGate(db: SupabaseClient, spvId: string): Promise<GateResult> {
  let masterName: string;
  try {
    const master = await getActiveMasterEntity(db);
    if (!masterHasLiabilityNotice(master)) {
      return {
        passed: false,
        code: "STATUTORY_BLOCK",
        message: "Master Certificate of Formation missing § 18-215(b) liability notice. HARD BLOCK.",
        extra: {},
      };
    }
    masterName = master.legal_name;
  } catch (error) {
    if (error instanceof HttpError) {
      return {
        passed: false,
        code: "STATUTORY_BLOCK",
        message: error.message,
        extra: { cause: error.code, ...error.extra },
      };
    }
    throw error;
  }

  const events = unwrap(
    await db.from("series_registry_log").select("*").eq("spv_id", spvId).in("event_type", [
      "ESCALATION",
      "ESCALATION_RESOLVED",
    ]),
  ) as LedgerRow[];
  const state = escalationState(events);

  if (state.active && state.escalation) {
    return {
      passed: false,
      code: "ESCALATION_BLOCK",
      message: "SPV has an unresolved escalation. Append an ESCALATION_RESOLVED ledger event before proceeding.",
      extra: {
        escalation_entry_id: state.escalation.id,
        escalated_at: state.escalation.event_timestamp,
        escalation: state.escalation.event_data,
      },
    };
  }

  return {
    passed: true,
    master_entity: masterName,
    last_escalation_resolved_at: state.resolution?.event_timestamp ?? null,
  };
}
