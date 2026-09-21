import { ALERT_SEVERITIES, ALERT_TYPES } from "../../../schemas/constants.ts";
import { raiseAlert } from "../_shared/alerts.ts";
import { HttpError, ok, serveFunction } from "../_shared/http.ts";
import {
  optionalObject,
  optionalString,
  optionalStringArray,
  requireEnum,
  requireString,
} from "../_shared/validate.ts";

/**
 * Alert Logger — Write-only function for the covenant monitoring layer.
 * Creates alert_log rows. This is the ONLY write operation the monitoring
 * agent is permitted to perform. Never writes to SPV, covenant, approval,
 * or disbursement fields.
 */
serveFunction(async ({ db, body, caller }) => {
  const spv_id = requireString(body, "spv_id");
  const alert_type = requireEnum(body, "alert_type", ALERT_TYPES);
  const severity = requireEnum(body, "severity", ALERT_SEVERITIES);

  // Sanctions hits and CRITICAL escalations drive human review; only the
  // monitoring workflow (service token) may raise them.
  if (!caller.is_service && (alert_type === "OFAC_FLAG" || severity === "CRITICAL")) {
    throw new HttpError(
      403,
      "SERVICE_TOKEN_REQUIRED",
      "OFAC_FLAG alerts and CRITICAL severity may only be logged by the monitoring workflow (service token).",
    );
  }

  const entry = await raiseAlert(db, {
    spv_id,
    alert_type,
    severity,
    covenant_type: optionalString(body, "covenant_type"),
    evidence: optionalObject(body, "evidence"),
    deal_id: optionalString(body, "deal_id"),
    recommended_action: optionalString(body, "recommended_action"),
    escalated_to: optionalString(body, "escalated_to"),
    channels_sent: optionalStringArray(body, "channels_sent"),
  });

  return ok({
    alert_id: entry.alert_id,
    severity,
    alert_type,
    spv_id,
    message: `Alert logged: ${alert_type} (${severity}) for SPV ${spv_id}`,
  });
});
