import { FORM_D_FILING_WINDOW_DAYS, LEDGER_HASH_PREIMAGE } from "../../../schemas/constants.ts";
import { factorySettings, ok, serveFunction } from "../_shared/http.ts";

export const FACTORY_VERSION = "2026.09.21";

/** Every callable factory function and the method a client should use. */
export const FACTORY_FUNCTIONS = {
  factoryInfo: "GET",
  checkMasterEntityLiabilityNotice: "GET",
  checkFormationGate: "POST",
  createSeriesLedgerEntry: "POST",
  verifySeriesLedger: "POST",
  logAlert: "POST",
  getNextResponsibleParty: "POST",
  processCapitalCall: "POST",
  triggerFirstSaleClock: "POST",
} as const;

/**
 * Factory configuration and health. Lets a frontend or integration confirm it
 * is pointed at the right installation before making changes.
 *
 * Reports the SPVFACTORY_* secrets (never the API keys), the caller's
 * resolved roles, and the function catalogue. Any authenticated user may call
 * it; the role gate does not apply because nothing here is sensitive.
 */
serveFunction(({ caller }) => {
  const settings = factorySettings();
  return Promise.resolve(ok({
    factory: "DIBS SPV Factory",
    version: FACTORY_VERSION,
    platform: "Lovable Cloud (Supabase)",
    base_url: settings.base_url,
    tenant_id: settings.tenant_id,
    env: settings.env,
    allowed_roles: settings.allowed_roles,
    caller: { is_service: caller.is_service, roles: caller.roles },
    functions: Object.entries(FACTORY_FUNCTIONS).map(([name, method]) => ({
      name,
      method,
      url: settings.base_url ? `${settings.base_url}/${name}` : null,
    })),
    form_d_window_days: FORM_D_FILING_WINDOW_DAYS,
    ledger_hash_preimage: LEDGER_HASH_PREIMAGE,
  }));
}, { parseBody: false, requireRole: false });
