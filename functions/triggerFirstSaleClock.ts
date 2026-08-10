import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * First-Sale Clock Trigger — Form D Deadline Engine
 * 
 * When an investor becomes irrevocably contractually committed, this function:
 * 1. Sets irrevocable_commitment_at on the FormDFiling record
 * 2. Calculates the 15-day filing deadline (irrevocable_commitment_at + 15 days)
 * 3. Sets first_sale_date to the irrevocable commitment date
 * 4. Updates status to PENDING (filing required)
 * 
 * GUARDRAIL: Do not treat a soft circle as a first sale.
 * Do not infer first sale solely from bank receipt.
 */
Deno.serve(async (req: Request) => {
  const base44 = createClientFromRequest(req);
  try {
    const body = await req.json();
    const { spv_id, commitment_type, subscription_id, investor_id } = body;

    if (!spv_id || !commitment_type) {
      return Response.json({
        error: "MISSING_REQUIRED_FIELDS",
        message: "spv_id and commitment_type are required."
      }, { status: 400 });
    }

    // Validate commitment type — only irrevocable commitment triggers the clock
    const validTypes = ["IRREVOCABLE_COMMITMENT", "SOFT_CIRCLE", "SUBSCRIPTION_SIGNED", "FUNDS_RECEIVED", "FUNDS_CLEARED"];
    if (!validTypes.includes(commitment_type)) {
      return Response.json({
        error: "INVALID_COMMITMENT_TYPE",
        message: `commitment_type must be one of: ${validTypes.join(", ")}`
      }, { status: 400 });
    }

    // Soft circles do NOT trigger the Form D clock
    if (commitment_type === "SOFT_CIRCLE") {
      // Still record it, but don't start the clock
      const filings = await base44.entities.FormDFiling.filter({ spv_id });
      if (filings && filings.length > 0) {
        const filing = filings[0];
        await base44.entities.FormDFiling.update(filing.id, {
          soft_circle_at: new Date().toISOString()
        });
        return Response.json({
          success: true,
          clock_started: false,
          message: "Soft circle recorded. Form D clock NOT started — soft circle is not a first sale."
        });
      }
    }

    const now = new Date();
    const nowISO = now.toISOString();
    const deadline = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
    const deadlineISO = deadline.toISOString();

    // Find the FormDFiling record for this SPV
    const filings = await base44.entities.FormDFiling.filter({ spv_id });
    
    let filing;
    let is_first_sale = false;

    if (!filings || filings.length === 0) {
      // Create a new FormDFiling record if none exists
      filing = await base44.entities.FormDFiling.create({
        spv_id,
        status: "PENDING",
        first_sale_date: nowISO,
        irrevocable_commitment_at: nowISO,
        filing_deadline: deadlineISO,
        subscription_signed_at: commitment_type === "SUBSCRIPTION_SIGNED" ? nowISO : undefined,
        funds_received_at: commitment_type === "FUNDS_RECEIVED" ? nowISO : undefined,
        funds_cleared_at: commitment_type === "FUNDS_CLEARED" ? nowISO : undefined
      });
      is_first_sale = true;
    } else {
      filing = filings[0];
      const existing = filing.data || filing;
      
      // Check if first sale was already recorded
      if (existing.irrevocable_commitment_at) {
        // Already has a first sale — just update the relevant timestamp
        const updates: any = {};
        if (commitment_type === "SUBSCRIPTION_SIGNED" && !existing.subscription_signed_at) {
          updates.subscription_sent_at = nowISO;
        }
        if (commitment_type === "FUNDS_RECEIVED" && !existing.funds_received_at) {
          updates.funds_received_at = nowISO;
        }
        if (commitment_type === "FUNDS_CLEARED" && !existing.funds_cleared_at) {
          updates.funds_cleared_at = nowISO;
        }
        
        if (Object.keys(updates).length > 0) {
          await base44.entities.FormDFiling.update(filing.id, updates);
        }

        return Response.json({
          success: true,
          clock_started: false,
          spv_id,
          first_sale_date: existing.irrevocable_commitment_at,
          filing_deadline: existing.filing_deadline,
          message: "First sale already recorded. Updated additional timestamp only."
        });
      }

      // Record the first irrevocable commitment — START THE CLOCK
      const updates: any = {
        status: "PENDING",
        first_sale_date: nowISO,
        irrevocable_commitment_at: nowISO,
        filing_deadline: deadlineISO
      };

      if (commitment_type === "SUBSCRIPTION_SIGNED") {
        updates.subscription_signed_at = nowISO;
      }
      if (commitment_type === "FUNDS_RECEIVED") {
        updates.funds_received_at = nowISO;
      }
      if (commitment_type === "FUNDS_CLEARED") {
        updates.funds_cleared_at = nowISO;
      }

      await base44.entities.FormDFiling.update(filing.id, updates);
      is_first_sale = true;
    }

    return Response.json({
      success: true,
      clock_started: is_first_sale,
      spv_id,
      first_sale_date: nowISO,
      filing_deadline: deadlineISO,
      days_remaining: 15,
      message: is_first_sale 
        ? `Form D clock STARTED. First sale at ${nowISO}. Filing deadline: ${deadlineISO} (15 days).`
        : "Timestamp updated. Form D clock already running."
    });

  } catch (error: any) {
    return Response.json({
      success: false,
      error: "SYSTEM_ERROR",
      message: error?.message || "Failed to trigger first-sale clock."
    }, { status: 500 });
  }
});
