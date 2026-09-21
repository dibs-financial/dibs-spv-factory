import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { HttpError, ok, serveFunction } from "./http.ts";

export interface RunnerContext {
  db: SupabaseClient;
  now: Date;
}

export type RunnerBody = (ctx: RunnerContext) => Promise<Record<string, unknown>>;

/**
 * Wrapper for the scheduled runners (pg_cron → net.http_post). Runners act on
 * every SPV, so they accept only the service-role token; a user JWT gets 403
 * regardless of role. The response is a run summary for the cron log.
 */
export function serveRunner(name: string, run: RunnerBody): void {
  serveFunction(async ({ db, caller }) => {
    if (!caller.is_service) {
      throw new HttpError(403, "SERVICE_TOKEN_REQUIRED", `${name} may only be invoked with the service-role token.`);
    }
    const started = new Date();
    const summary = await run({ db, now: started });
    return ok({
      runner: name,
      started_at: started.toISOString(),
      duration_ms: Date.now() - started.getTime(),
      ...summary,
    });
  }, { parseBody: false });
}

/** Checks a runner cannot perform because the data lives outside this repository. */
export const DEAL_MODEL_SKIPS = {
  LTV_BREACH: "LTV covenant needs Spv / asset valuation rows (deal-model tables not in this repository).",
  MILESTONE_OVERDUE:
    "Milestone deadlines need Spv / DealConfiguration milestone rows (deal-model tables not in this repository).",
  OFAC_FLAG: "OFAC screening needs Investor rows and a sanctions connector (not shipped).",
  KYC_SESSIONS:
    "KYC session status needs KycSession rows / Sumsub connector (not shipped); KYC is tracked from ledger events only.",
} as const;
