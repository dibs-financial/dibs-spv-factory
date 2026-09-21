import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { AlertSeverity, AlertType } from "../../../schemas/constants.ts";
import type { AlertRow } from "../../../schemas/types.ts";
import { unwrap } from "./records.ts";

export interface AlertInput {
  spv_id: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  covenant_type?: string;
  evidence?: Record<string, unknown>;
  deal_id?: string;
  recommended_action?: string;
  escalated_to?: string;
  channels_sent?: string[];
}

export interface RaiseAlertResult {
  created: boolean;
  alert_id: string;
}

/**
 * The one write path into alert_log, used by logAlert and by the schedule
 * runners. With `dedupe`, an existing unacknowledged alert of the same
 * type and severity for the SPV is returned instead of inserting a duplicate,
 * so an hourly monitor does not re-raise the same condition every run; once
 * an operator acknowledges it, the next run can raise it again.
 */
export async function raiseAlert(
  db: SupabaseClient,
  input: AlertInput,
  options: { dedupe?: boolean } = {},
): Promise<RaiseAlertResult> {
  if (options.dedupe) {
    const existing = unwrap(
      await db.from("alert_log").select("id").match({
        spv_id: input.spv_id,
        alert_type: input.alert_type,
        severity: input.severity,
        acknowledged: false,
      }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ) as Pick<AlertRow, "id"> | null;
    if (existing) return { created: false, alert_id: existing.id };
  }

  const row = unwrap(
    await db.from("alert_log").insert({
      spv_id: input.spv_id,
      alert_type: input.alert_type,
      severity: input.severity,
      covenant_type: input.covenant_type ?? null,
      evidence: input.evidence ?? {},
      deal_id: input.deal_id ?? null,
      recommended_action: input.recommended_action ?? null,
      escalated_to: input.escalated_to ?? null,
      channels_sent: input.channels_sent ?? [],
      acknowledged: false,
    }).select("id").single(),
  ) as Pick<AlertRow, "id">;
  return { created: true, alert_id: row.id };
}
