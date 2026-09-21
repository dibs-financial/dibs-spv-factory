import { ALERT_SEVERITIES, ALERT_TYPES } from "../schemas/constants.ts";
import { ok, serveFunction } from "./_shared/http.ts";
import { optionalObject, optionalString, optionalStringArray, requireEnum, requireString } from "./_shared/validate.ts";

/**
 * Alert Logger — Write-only function for the covenant monitoring layer.
 * Creates AlertLog entries. This is the ONLY write operation the monitoring
 * agent is permitted to perform. Never writes to SPV, covenant, approval,
 * or disbursement fields.
 */
serveFunction(async ({ base44, body }) => {
  const spv_id = requireString(body, "spv_id");
  const alert_type = requireEnum(body, "alert_type", ALERT_TYPES);
  const severity = requireEnum(body, "severity", ALERT_SEVERITIES);

  const entry = await base44.entities.AlertLog.create({
    spv_id,
    alert_type,
    severity,
    covenant_type: optionalString(body, "covenant_type"),
    evidence: optionalObject(body, "evidence") ?? {},
    deal_id: optionalString(body, "deal_id"),
    recommended_action: optionalString(body, "recommended_action"),
    escalated_to: optionalString(body, "escalated_to"),
    channels_sent: optionalStringArray(body, "channels_sent") ?? [],
    acknowledged: false,
  });

  return ok({
    alert_id: entry.id,
    severity,
    alert_type,
    spv_id,
    message: `Alert logged: ${alert_type} (${severity}) for SPV ${spv_id}`,
  });
});
