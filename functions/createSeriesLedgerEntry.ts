import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Hash-Chained Series Registry Append
 * Creates a tamper-evident append-only entry in SeriesRegistryLog.
 * Each entry's hash is SHA-256(previous_hash + spv_id + event_type + timestamp + event_data_json).
 * This ledger IS the legal record substitute for protected series under § 18-215(b).
 */
Deno.serve(async (req: Request) => {
  const base44 = createClientFromRequest(req);
  try {
    const body = await req.json();
    const { spv_id, event_type, event_data, actor } = body;

    if (!spv_id || !event_type) {
      return Response.json({
        error: "MISSING_REQUIRED_FIELDS",
        message: "spv_id and event_type are required."
      }, { status: 400 });
    }

    // Fetch all entries and find the latest by created_date
    const allEntries = await base44.entities.SeriesRegistryLog.filter({ spv_id });
    
    // Sort by created_date descending and get the last entry's hash
    let previousHash = "GENESIS";
    if (allEntries && allEntries.length > 0) {
      const sorted = allEntries.sort((a: any, b: any) => {
        const dateA = new Date(a.created_date || a.data?.created_date || 0).getTime();
        const dateB = new Date(b.created_date || b.data?.created_date || 0).getTime();
        return dateB - dateA;
      });
      const latest = sorted[0];
      previousHash = latest.hash || latest.data?.hash || "GENESIS";
    }

    const timestamp = new Date().toISOString();
    const eventJson = JSON.stringify(event_data || {});

    // Compute SHA-256 hash
    const hashInput = `${previousHash}|${spv_id}|${event_type}|${timestamp}|${eventJson}`;
    const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(hashInput));
    const hash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    // Create the append-only entry
    const entry = await base44.entities.SeriesRegistryLog.create({
      spv_id,
      event_type,
      event_data: event_data || {},
      hash,
      previous_hash: previousHash,
      actor: actor || "system"
    });

    return Response.json({
      success: true,
      entry_id: entry.id,
      hash,
      previous_hash: previousHash,
      timestamp,
      message: `SeriesRegistryLog entry created: ${event_type} for SPV ${spv_id}`
    });
  } catch (error: any) {
    return Response.json({
      success: false,
      error: "SYSTEM_ERROR",
      message: error?.message || "Failed to create series registry entry."
    }, { status: 500 });
  }
});
