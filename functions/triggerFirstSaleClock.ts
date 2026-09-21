import { COMMITMENT_TYPES, FORM_D_FILING_WINDOW_DAYS } from "../schemas/constants.ts";
import { type FirstSaleFiling, planFirstSale } from "./_shared/firstSale.ts";
import { ok, serveFunction } from "./_shared/http.ts";
import { appendLedgerEntry } from "./_shared/ledger.ts";
import { type Rec, toMillis } from "./_shared/records.ts";
import { optionalPastTimestamp, optionalString, requireEnum, requireString } from "./_shared/validate.ts";

/**
 * First-Sale Clock Trigger — Form D Deadline Engine
 *
 * Records commitment milestones on the SPV's FormDFiling record. Only an
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
 *                    at the next monitor run.
 *   subscription_id, investor_id  optional, recorded in the ledger event.
 */
type FilingRecord = Rec<FirstSaleFiling & { spv_id: string }>;

serveFunction(async ({ base44, body }) => {
  const spv_id = requireString(body, "spv_id");
  const commitment_type = requireEnum(body, "commitment_type", COMMITMENT_TYPES);
  const committedAt = optionalPastTimestamp(body, "committed_at") ?? new Date();
  const subscription_id = optionalString(body, "subscription_id");
  const investor_id = optionalString(body, "investor_id");

  // One FormDFiling per SPV is the invariant; if duplicates exist, the oldest is canonical.
  const filings = (await base44.entities.FormDFiling.filter({ spv_id })) as FilingRecord[];
  filings.sort((a, b) => toMillis(a.created_date) - toMillis(b.created_date));
  const existing = filings[0] ?? null;

  const plan = planFirstSale(commitment_type, existing, committedAt);

  let filingId: string;
  if (existing) {
    filingId = existing.id;
    if (Object.keys(plan.updates).length > 0) {
      await base44.entities.FormDFiling.update(existing.id, plan.updates);
    }
  } else {
    const created = (await base44.entities.FormDFiling.create({ spv_id, ...plan.updates })) as FilingRecord;
    filingId = created.id;
  }

  let ledger: { entry_id: string; hash: string } | { error: string } | null = null;
  if (plan.clockStarted) {
    try {
      const appended = await appendLedgerEntry(base44, {
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
    duplicate_filing_records: Math.max(0, filings.length - 1),
    ledger,
    message: plan.clockStarted
      ? `Form D clock STARTED. First sale at ${plan.firstSaleDate}. Filing deadline: ${plan.filingDeadline} (${FORM_D_FILING_WINDOW_DAYS} days).`
      : plan.clockAlreadyRunning
      ? `${commitment_type} recorded. Form D clock already running since ${plan.firstSaleDate}.`
      : `${commitment_type} recorded. Form D clock NOT started — only an irrevocable commitment is a first sale.`,
  });
});
