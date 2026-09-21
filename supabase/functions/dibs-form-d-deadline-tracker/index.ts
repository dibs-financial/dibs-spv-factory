import type { FormDFilingRow } from "../../../schemas/types.ts";
import { raiseAlert } from "../_shared/alerts.ts";
import { FORM_D_WARNING_DAY, formDPhase } from "../_shared/formD.ts";
import { appendLedgerEntry } from "../_shared/ledger.ts";
import { unwrap } from "../_shared/records.ts";
import { serveRunner } from "../_shared/runner.ts";

/**
 * Form D Deadline Tracker — daily 08:00 UTC (pg_cron `0 8 * * *`).
 *
 * Walks every PENDING form_d_filings row and, by position in the operational
 * 15-calendar-day window:
 *   day 10+            → WARNING  FORM_D_OVERDUE alert (approaching)
 *   past the deadline  → status PENDING → OVERDUE, STATE_CHANGE ledger event,
 *                        CRITICAL FORM_D_OVERDUE alert
 * Rows already OVERDUE get their CRITICAL alert re-raised only after the
 * previous one is acknowledged. This is the operational clock, not counsel's
 * Rule 503 calendar; it never files anything.
 */
serveRunner("dibs-form-d-deadline-tracker", async ({ db, now }) => {
  const filings = unwrap(
    await db.from("form_d_filings").select("*").in("status", ["PENDING", "OVERDUE"]),
  ) as FormDFilingRow[];

  const summary = { checked: filings.length, warned: 0, marked_overdue: 0, critical: 0, alerts_created: 0 };

  for (const filing of filings) {
    const phase = formDPhase(filing, now);
    if (!phase) continue;

    if (phase.phase === "OVERDUE") {
      if (filing.status === "PENDING") {
        unwrap(
          await db.from("form_d_filings").update({ status: "OVERDUE" }).eq("id", filing.id).eq("status", "PENDING"),
        );
        await appendLedgerEntry(db, {
          spv_id: filing.spv_id,
          event_type: "STATE_CHANGE",
          event_data: {
            entity: "form_d_filings",
            from: "PENDING",
            to: "OVERDUE",
            filing_deadline: filing.filing_deadline,
          },
          actor: "dibs-form-d-deadline-tracker",
        });
        summary.marked_overdue += 1;
      }
      const r = await raiseAlert(db, {
        spv_id: filing.spv_id,
        alert_type: "FORM_D_OVERDUE",
        severity: "CRITICAL",
        covenant_type: "FORM_D",
        evidence: { first_sale_date: filing.first_sale_date, filing_deadline: filing.filing_deadline, ...phase },
        recommended_action:
          "File Form D on EDGAR immediately and record filed_date; confirm late-filing consequences with counsel.",
        escalated_to: "counsel",
      }, { dedupe: true });
      summary.critical += 1;
      if (r.created) summary.alerts_created += 1;
    } else if (phase.phase === "WARNING") {
      const r = await raiseAlert(db, {
        spv_id: filing.spv_id,
        alert_type: "FORM_D_OVERDUE",
        severity: "WARNING",
        covenant_type: "FORM_D",
        evidence: { first_sale_date: filing.first_sale_date, filing_deadline: filing.filing_deadline, ...phase },
        recommended_action:
          `Form D deadline in ${phase.daysRemaining} day(s); day ${FORM_D_WARNING_DAY}+ of the window.`,
      }, { dedupe: true });
      summary.warned += 1;
      if (r.created) summary.alerts_created += 1;
    }
  }

  return summary;
});
