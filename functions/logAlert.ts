import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Alert Logger — Write-only function for the covenant monitoring layer.
 * Creates AlertLog entries. This is the ONLY write operation the monitoring
 * agent is permitted to perform. Never writes to SPV, covenant, approval,
 * or disbursement fields.
 */
Deno.serve(async (req: Request) => {
  const base44 = createClientFromRequest(req);
  try {
    const body = await req.json();
    const {
      spv_id,
      alert_type,
      severity,
      covenant_type,
      evidence,
      deal_id,
      recommended_action,
      escalated_to,
      channels_sent
    } = body;

    if (!spv_id || !alert_type || !severity) {
      return Response.json({
        error: "MISSING_REQUIRED_FIELDS",
        message: "spv_id, alert_type, and severity are required."
      }, { status: 400 });
    }

    const validSeverities = ["INFO", "WARNING", "CRITICAL"];
    if (!validSeverities.includes(severity)) {
      return Response.json({
        error: "INVALID_SEVERITY",
        message: `severity must be one of: ${validSeverities.join(", ")}`
      }, { status: 400 });
    }

    const validAlertTypes = [
      "LTV_BREACH", "MILESTONE_OVERDUE", "KYC_EXCEPTION", "OFAC_FLAG",
      "FORM_D_OVERDUE", "BLUE_SKY_OVERDUE", "EIN_FAILURE", "WIRE_FAILURE",
      "COMPLIANCE_CHECK_PASS", "ESCALATION"
    ];
    if (!validAlertTypes.includes(alert_type)) {
      return Response.json({
        error: "INVALID_ALERT_TYPE",
        message: `alert_type must be one of: ${validAlertTypes.join(", ")}`
      }, { status: 400 });
    }

    const entry = await base44.entities.AlertLog.create({
      spv_id,
      alert_type,
      severity,
      covenant_type: covenant_type || null,
      evidence: evidence || {},
      deal_id: deal_id || spv_id,
      recommended_action: recommended_action || null,
      escalated_to: escalated_to || null,
      channels_sent: channels_sent || [],
      acknowledged: false
    });

    return Response.json({
      success: true,
      alert_id: entry.id,
      severity,
      alert_type,
      spv_id,
      message: `Alert logged: ${alert_type} (${severity}) for SPV ${spv_id}`
    });
  } catch (error: any) {
    return Response.json({
      success: false,
      error: "SYSTEM_ERROR",
      message: error?.message || "Failed to log alert."
    }, { status: 500 });
  }
});
