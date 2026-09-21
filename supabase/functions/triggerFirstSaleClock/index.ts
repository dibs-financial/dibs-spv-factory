import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { COMMITMENT_TYPES, FORM_D_FILING_WINDOW_DAYS } from "../../../schemas/constants.ts";
import type { FormDFilingRow } from "../../../schemas/types.ts";
import { planFirstSale } from "../_shared/firstSale.ts";
import { ok, serveFunction } from "../_shared/http.ts";
import { appendLedgerEntry } from "../_shared/ledger.ts";
import { isUniqueViolation, toMillis, unwrap } from "../_shared/records.ts";
import { optionalPastTimestamp, optionalString, requireEnum, requireString } from "../_shared/validate.ts";

/**
 * First-Sale Clock Trigger — Form D Deadline Engine
 *
 * Records commitment milestones on the SPV's form_d_filings row. Only an
 * IRREVOCABLE_COMMITMENT is a first sale: it sets irrevocable_commitment_at
 * and first_sale_date, computes filing_deadline (+15 calendar days) and moves
 * the filing to PENDING. Every other commitment type is recorded as a
 * timestamp and never starts the clock.
 *
 * GUARDRAILS (README "First-sale tracking"):
 *   Soft circle is not a first sale. Bank receipt is not a first sale.
 *   E-sign SIGNED is not a first sale. The clock is never restarted.
 *
 * Body:
 *   spv_id           required
 *   commitment_type  required, one of COMMITMENT_TYPES
 *   committed_at     optional ISO timestamp of the actual commitment (default
 *                    now). Pass it so the clock starts at the commitment, not
 *                    at the next monitor run. A value more than 15 days old is
 *                    rejected (TIMESTAMP_TOO_OLD) unless acknowledge_late: true
 *                    is sent; the filing is then created already OVERDUE.
 *   subscription_id, investor_id  optional, recorded in the ledger event.
 */
serveFunction(async ({ db, body }) => {
  const spv_id = requireString(body, "spv_id");
  const commitment_type = requireEnum(body, "commitment_type", COMMITMENT_TYPES);
  const committedAt = optionalPastTimestamp(body, "committed_at", {
    maxAgeDays: FORM_D_FILING_WINDOW_DAYS,
    overrideKey: "acknowledge_late",
  }) ?? new Date();
  const subscription_id = optionalString(body, "subscription_id");
  const investor_id = optionalString(body, "investor_id");

  let existing = await findFiling(db, spv_id);
  let plan = planFirstSale(commitment_type, existing, committedAt);
  let filingId: string;

  if (existing) {
    filingId = existing.id;
    if (Object.keys(plan.updates).length > 0) {
      unwrap(await db.from("form_d_filings").update(plan.updates).eq("id", existing.id));
    }
  } else {
    const { data, error } = await db.from("form_d_filings").insert({ spv_id, ...plan.updates }).select("id").single();
    if (error) {
      if (!isUniqueViolation(error)) throw error;
      // Concurrent first write for this SPV: re-plan against the winner's row.
      existing = await findFiling(db, spv_id);
      if (!existing) throw error;
      plan = planFirstSale(commitment_type, existing, committedAt);
      if (Object.keys(plan.updates).length > 0) {
        unwrap(await db.from("form_d_filings").update(plan.updates).eq("id", existing.id));
      }
      filingId = existing.id;
    } else {
      filingId = data.id;
    }
  }

  let ledger: { entry_id: string; hash: string } | { error: string } | null = null;
  if (plan.clockStarted) {
    try {
      const appended = await appendLedgerEntry(db, {
        spv_id,
        event_type: "FIRST_SALE_RECORDED",
        event_data: {
          form_d_filing_id: filingId,
          first_sale_date: plan.firstSaleDate,
          filing_deadline: plan.filingDeadline,
          subscription_id,
          investor_id,
        },
      });
      ledger = { entry_id: appended.entry.id, hash: appended.entry.hash };
    } catch (error) {
      console.error("FIRST_SALE_RECORDED ledger append failed", error);
      ledger = { error: error instanceof Error ? error.message : "Unexpected error." };
    }
  }

  const daysRemaining = plan.filingDeadline
    ? Math.ceil((toMillis(plan.filingDeadline) - Date.now()) / (24 * 60 * 60 * 1000))
    : null;

  return ok({
    success: ledger === null || !("error" in ledger),
    spv_id,
    form_d_filing_id: filingId,
    commitment_type,
    recorded_at: committedAt.toISOString(),
    clock_started: plan.clockStarted,
    clock_running: plan.clockStarted || plan.clockAlreadyRunning,
    first_sale_date: plan.firstSaleDate ?? null,
    filing_deadline: plan.filingDeadline ?? null,
    days_remaining: daysRemaining,
    ledger,
    message: plan.clockStarted
      ? `Form D clock STARTED. First sale at ${plan.firstSaleDate}. Filing deadline: ${plan.filingDeadline} (${FORM_D_FILING_WINDOW_DAYS} days).`
      : plan.clockAlreadyRunning
      ? `${commitment_type} recorded. Form D clock already running since ${plan.firstSaleDate}.`
      : `${commitment_type} recorded. Form D clock NOT started — only an irrevocable commitment is a first sale.`,
  });
});

async function findFiling(db: SupabaseClient, spvId: string): Promise<FormDFilingRow | null> {
  return unwrap(
    await db.from("form_d_filings").select("*").eq("spv_id", spvId).maybeSingle(),
  ) as FormDFilingRow | null;
}
