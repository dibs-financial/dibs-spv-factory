import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Statutory Kill-Switch: Checks that the master Delaware Series LLC
 * Certificate of Formation contains the § 18-215(b) liability limitation notice.
 * If this returns false, ALL SPV formation must be blocked.
 */
Deno.serve(async (req: Request) => {
  const base44 = createClientFromRequest(req);
  try {
    const masterEntities = await base44.entities.MasterEntity.list();

    if (!masterEntities || masterEntities.length === 0) {
      return Response.json({
        has_notice: false,
        error: "NO_MASTER_ENTITY",
        message: "No master entity record found. The Delaware Series LLC master must be configured before any SPV formation."
      }, { status: 422 });
    }

    const active = masterEntities.find((e: any) => e.data?.status === "ACTIVE" || e.status === "ACTIVE");

    if (!active) {
      return Response.json({
        has_notice: false,
        error: "NO_ACTIVE_MASTER",
        message: "No active master entity found. Formation is blocked until a master entity with ACTIVE status exists."
      }, { status: 422 });
    }

    const data = active.data || active;
    const hasNotice = data.has_liability_notice === true;

    return Response.json({
      has_notice: hasNotice,
      master_entity_id: active.id,
      legal_name: data.legal_name,
      status: data.status,
      message: hasNotice
        ? "Statutory gate passed — master Certificate of Formation contains § 18-215(b) liability notice."
        : "HARD BLOCK — master Certificate of Formation is missing the § 18-215(b) liability limitation notice. All SPV formation is blocked until this is resolved by counsel."
    });
  } catch (error: any) {
    return Response.json({
      has_notice: false,
      error: "SYSTEM_ERROR",
      message: error?.message || "Failed to check master entity."
    }, { status: 500 });
  }
});
