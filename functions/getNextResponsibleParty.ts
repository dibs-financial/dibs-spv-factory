import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Responsible Party Rotation — IRS SS-4 EIN Throttle Manager
 * 
 * IRS rules: Each responsible party can file 1 EIN per day via the online SS-4 system.
 * This function rotates through the pooled signatories, respecting the daily limit.
 * 
 * Returns the next available responsible party and marks them as used for today.
 */
Deno.serve(async (req: Request) => {
  const base44 = createClientFromRequest(req);
  try {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    // Find all responsible parties and pick the first available one
    const parties = await base44.entities.ResponsibleParty.filter({ status: "AVAILABLE" });

    if (!parties || parties.length === 0) {
      // Check if any USED_TODAY parties can be reset (new day)
      const usedToday = await base44.entities.ResponsibleParty.filter({ status: "USED_TODAY" });
      
      if (usedToday && usedToday.length > 0) {
        // Reset parties whose last_used_date is before today
        for (const party of usedToday) {
          const p = party.data || party;
          const lastUsed = p.last_used_date;
          if (lastUsed && lastUsed < today) {
            await base44.entities.ResponsibleParty.update(party.id, {
              status: "AVAILABLE",
              ein_used_today: false
            });
          }
        }
        
        // Try again after reset
        const refreshed = await base44.entities.ResponsibleParty.filter({ status: "AVAILABLE" });
        if (refreshed && refreshed.length > 0) {
          return await assignParty(base44, refreshed[0], today);
        }
      }

      return Response.json({
        success: false,
        error: "NO_AVAILABLE_PARTY",
        message: "All responsible parties have been used today. EIN requests must wait until tomorrow or be filed manually via paper SS-4."
      }, { status: 429 });
    }

    return await assignParty(base44, parties[0], today);
  } catch (error: any) {
    return Response.json({
      success: false,
      error: "SYSTEM_ERROR",
      message: error?.message || "Failed to get responsible party."
    }, { status: 500 });
  }
});

async function assignParty(base44: any, party: any, today: string) {
  const p = party.data || party;
  const partyId = party.id;
  const newCount = (p.ein_count_this_month || 0) + 1;

  await base44.entities.ResponsibleParty.update(partyId, {
    status: "USED_TODAY",
    ein_used_today: true,
    last_used_date: today,
    ein_count_this_month: newCount
  });

  return Response.json({
    success: true,
    responsible_party_id: partyId,
    name: p.name,
    email: p.email,
    ein_count_this_month: newCount,
    message: `Responsible party assigned: ${p.name}. EIN count this month: ${newCount}.`
  });
}
