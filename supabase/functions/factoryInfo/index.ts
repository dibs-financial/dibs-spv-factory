import { FORM_D_FILING_WINDOW_DAYS, LEDGER_HASH_PREIMAGE } from "../../../schemas/constants.ts";
import { RUSH_TRACK_MIN_AVAILABLE_SIGNATORIES } from "../../../schemas/pricing.ts";
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
  "dibs-covenant-monitor": "POST",
  "dibs-form-d-deadline-tracker": "POST",
  "dibs-spv-formation-pipeline": "POST",
  "dibs-investor-onboarding-monitor": "POST",
  "dibs-billing": "POST",
} as const;

/** Scheduled runners: service-role token only; invoked by pg_cron. */
export const FACTORY_RUNNERS = [
  "dibs-covenant-monitor",
  "dibs-form-d-deadline-tracker",
  "dibs-spv-formation-pipeline",
  "dibs-investor-onboarding-monitor",
  "dibs-billing",
] as const;

/**
 * Factory configuration and health. Lets a frontend or integration confirm it
 * is pointed at the right installation before making changes.
 *
 * Reports the SPVFACTORY_* secrets (never the API keys), the caller's
 * resolved roles, and the function catalogue. Any authenticated user may call
 * it; the role gate does not apply because nothing here is sensitive.
 *
 * `rush_track.available` says whether the 72-hour track may be offered right
 * now (public.rush_track_open(): at least RUSH_TRACK_MIN_AVAILABLE_SIGNATORIES
 * EIN signatories available), so a frontend can hide the option instead of
 * having the deal_configurations trigger reject it. Only the yes/no is
 * reported, never the pool size. null when the check itself fails, so a
 * missing migration never takes the health check down.
 */
serveFunction(async ({ caller, db }) => {
  const settings = factorySettings();
  const rush = await db.rpc("rush_track_open");
  return ok({
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
      runner: (FACTORY_RUNNERS as readonly string[]).includes(name),
    })),
    form_d_window_days: FORM_D_FILING_WINDOW_DAYS,
    ledger_hash_preimage: LEDGER_HASH_PREIMAGE,
    rush_track: {
      available: rush.error ? null : rush.data === true,
      min_available_signatories: RUSH_TRACK_MIN_AVAILABLE_SIGNATORIES,
    },
  });
}, { parseBody: false, requireRole: false });
