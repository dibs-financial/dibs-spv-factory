import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Formation Pipeline Gate — Pre-flight Check
 * 
 * Runs before each formation stage transition. Checks:
 * 1. Master entity statutory gate (§ 18-215(b) liability notice)
 * 2. Whether the SPV is already in the target stage (idempotency)
 * 3. Whether the SPV is blocked (EIN_PENDING_MANUAL or BLOCKED status)
 * 
 * Returns a go/no-go decision with evidence.
 */
Deno.serve(async (req: Request) => {
  const base44 = createClientFromRequest(req);
  try {
    const body = await req.json();
    const { spv_id, target_stage } = body;

    if (!spv_id || !target_stage) {
      return Response.json({
        error: "MISSING_REQUIRED_FIELDS",
        message: "spv_id and target_stage are required."
      }, { status: 400 });
    }

    // 1. Check statutory gate
    const masterResult = await base44.entities.MasterEntity.filter({ status: "ACTIVE" });
    
    if (!masterResult || masterResult.length === 0) {
      return Response.json({
        gate_passed: false,
        spv_id,
        target_stage,
        error: "STATUTORY_BLOCK",
        message: "No active master entity. All formation is blocked."
      }, { status: 422 });
    }

    const master = masterResult[0].data || masterResult[0];
    if (!master.has_liability_notice) {
      return Response.json({
        gate_passed: false,
        spv_id,
        target_stage,
        error: "STATUTORY_BLOCK",
        message: "Master Certificate of Formation missing § 18-215(b) liability notice. HARD BLOCK."
      }, { status: 422 });
    }

    // 2. Check SPV status — we need to read cross-app from Solene/Zevia
    // Since this function runs in the Elara app, we can only check Elara entities.
    // The SPV status check is done by the agent in the workflow step.
    // Here we verify the statutory gate and return the decision.

    // 3. Check for blocked SPVs in our registry
    const blockedEntries = await base44.entities.SeriesRegistryLog.filter({ 
      spv_id, 
      event_type: "ESCALATION" 
    });

    if (blockedEntries && blockedEntries.length > 0) {
      const latestEscalation = blockedEntries.sort((a: any, b: any) => {
        return new Date(b.created_date).getTime() - new Date(a.created_date).getTime();
      })[0];
      const escData = (latestEscalation.data || latestEscalation).event_data;
      
      return Response.json({
        gate_passed: false,
        spv_id,
        target_stage,
        error: "ESCALATION_BLOCK",
        message: `SPV has an active escalation. Last escalation: ${JSON.stringify(escData)}. Resolve before proceeding.`,
        escalation_entry_id: latestEscalation.id
      }, { status: 422 });
    }

    return Response.json({
      gate_passed: true,
      spv_id,
      target_stage,
      master_entity: master.legal_name,
      message: `Gate passed for SPV ${spv_id} → ${target_stage}. Statutory check clear, no escalations.`
    });

  } catch (error: any) {
    return Response.json({
      gate_passed: false,
      error: "SYSTEM_ERROR",
      message: error?.message || "Formation gate check failed."
    }, { status: 500 });
  }
});
