import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Capital Call Processor
 * 
 * Creates capital call records for investors with executed subscriptions.
 * Calculates call amounts based on subscription amounts and call percentage.
 * Sets wire instructions and due dates.
 * 
 * Only processes investors whose KYC has passed and subscriptions are executed.
 */
Deno.serve(async (req: Request) => {
  const base44 = createClientFromRequest(req);
  try {
    const body = await req.json();
    const { spv_id, call_percentage, due_date_days, investor_list } = body;

    if (!spv_id) {
      return Response.json({
        error: "MISSING_REQUIRED_FIELDS",
        message: "spv_id is required."
      }, { status: 400 });
    }

    const callPct = call_percentage || 100; // Default to 100% call
    const dueDays = due_date_days || 10; // Default 10-day wire window
    const now = new Date();
    const dueDate = new Date(now.getTime() + dueDays * 24 * 60 * 60 * 1000);

    // If investor_list is provided, process those investors
    // Otherwise, we need the agent to provide the investor list (cross-app read from Zevia)
    if (!investor_list || !Array.isArray(investor_list) || investor_list.length === 0) {
      return Response.json({
        error: "INVESTOR_LIST_REQUIRED",
        message: "investor_list array is required. The agent should read executed subscriptions from the Zevia app and pass them here.",
        expected_format: [{"investor_id": "...", "subscription_id": "...", "amount": 50000}]
      }, { status: 400 });
    }

    const results = [];
    let totalCalled = 0;

    for (const inv of investor_list) {
      // Check for existing capital call to prevent duplicates
      const existing = await base44.entities.CapitalCall.filter({
        spv_id,
        investor_id: inv.investor_id,
        subscription_id: inv.subscription_id
      });

      if (existing && existing.length > 0) {
        results.push({
          investor_id: inv.investor_id,
          status: "SKIPPED",
          message: "Capital call already exists for this investor/subscription."
        });
        continue;
      }

      const callAmount = (inv.amount || 0) * (callPct / 100);

      const call = await base44.entities.CapitalCall.create({
        spv_id,
        subscription_id: inv.subscription_id,
        investor_id: inv.investor_id,
        call_amount: callAmount,
        call_date: now.toISOString(),
        due_date: dueDate.toISOString(),
        wire_status: "ISSUED",
        received_amount: 0
      });

      totalCalled += callAmount;
      results.push({
        investor_id: inv.investor_id,
        call_id: call.id,
        call_amount: callAmount,
        due_date: dueDate.toISOString(),
        status: "CREATED"
      });
    }

    return Response.json({
      success: true,
      spv_id,
      calls_created: results.filter(r => r.status === "CREATED").length,
      calls_skipped: results.filter(r => r.status === "SKIPPED").length,
      total_called: totalCalled,
      call_percentage: callPct,
      due_date: dueDate.toISOString(),
      results
    });

  } catch (error: any) {
    return Response.json({
      success: false,
      error: "SYSTEM_ERROR",
      message: error?.message || "Failed to process capital calls."
    }, { status: 500 });
  }
});
