import type { CapitalCallRow, FormDFilingRow } from "../../../schemas/types.ts";
import { raiseAlert } from "../_shared/alerts.ts";
import { appendLedgerEntry, latestKycOutcomes, type LedgerRow } from "../_shared/ledger.ts";
import { selectAll, unwrap } from "../_shared/records.ts";
import { DEAL_MODEL_SKIPS, serveRunner } from "../_shared/runner.ts";

/**
 * Investor Onboarding Monitor — hourly (pg_cron `0 * * * *`).
 *
 *   - capital calls ISSUED / PENDING past due_date → wire_status OVERDUE,
 *     STATE_CHANGE ledger event, WARNING WIRE_FAILURE alert
 *   - KYC_FAIL ledger events with no later KYC_PASS for the same investor → WARNING
 *     KYC_EXCEPTION alert (human review; the pipeline will not advance)
 *   - funds received on a filing with no irrevocable commitment recorded →
 *     WARNING ESCALATION. Bank receipt is never inferred to be a first sale;
 *     a human must call triggerFirstSaleClock with the real commitment.
 * OFAC and KYC-session checks need deal-model rows / connectors and are
 * reported under `skipped`.
 */
serveRunner("dibs-investor-onboarding-monitor", async ({ db, now }) => {
  const summary = {
    calls_marked_overdue: 0,
    kyc_exceptions: 0,
    unrecorded_first_sales: 0,
    alerts_created: 0,
    skipped: [] as string[],
  };
  const raise = async (input: Parameters<typeof raiseAlert>[1]) => {
    const r = await raiseAlert(db, input, { dedupe: true });
    if (r.created) summary.alerts_created += 1;
  };

  // Overdue wires
  const dueCalls = unwrap(
    await db.from("capital_calls").select("*").in("wire_status", ["ISSUED", "PENDING"]).lt(
      "due_date",
      now.toISOString(),
    ),
  ) as CapitalCallRow[];
  for (const call of dueCalls) {
    unwrap(
      await db.from("capital_calls").update({ wire_status: "OVERDUE" }).eq("id", call.id).in("wire_status", [
        "ISSUED",
        "PENDING",
      ]),
    );
    await appendLedgerEntry(db, {
      spv_id: call.spv_id,
      event_type: "STATE_CHANGE",
      event_data: {
        entity: "capital_calls",
        call_id: call.id,
        from: call.wire_status,
        to: "OVERDUE",
        due_date: call.due_date,
      },
      actor: "dibs-investor-onboarding-monitor",
    });
    summary.calls_marked_overdue += 1;
    await raise({
      spv_id: call.spv_id,
      alert_type: "WIRE_FAILURE",
      severity: "WARNING",
      covenant_type: "CAPITAL_CALL",
      evidence: {
        call_id: call.id,
        investor_id: call.investor_id,
        call_amount: call.call_amount,
        due_date: call.due_date,
      },
      recommended_action: "Contact the investor; record wire_confirmation_ref and received_date when funds arrive.",
    });
  }

  // KYC failures without a later pass
  const kycEvents = await selectAll<LedgerRow>((from, to) =>
    db.from("series_registry_log").select("*").in("event_type", ["KYC_PASS", "KYC_FAIL"]).order("id").range(from, to)
  );
  for (const latest of latestKycOutcomes(kycEvents)) {
    if (latest.event_type !== "KYC_FAIL") continue;
    summary.kyc_exceptions += 1;
    await raise({
      spv_id: latest.spv_id,
      alert_type: "KYC_EXCEPTION",
      severity: "WARNING",
      covenant_type: "KYC_AML",
      evidence: { ledger_entry_id: latest.id, failed_at: latest.event_timestamp, detail: latest.event_data },
      recommended_action: "Human review of the KYC failure; append KYC_PASS or wind down the subscription.",
      escalated_to: "compliance_reviewer",
    });
  }

  // Funds received but no irrevocable commitment recorded
  const filings = unwrap(
    await db.from("form_d_filings").select("*").not("funds_received_at", "is", null).is(
      "irrevocable_commitment_at",
      null,
    ),
  ) as FormDFilingRow[];
  for (const filing of filings) {
    summary.unrecorded_first_sales += 1;
    await raise({
      spv_id: filing.spv_id,
      alert_type: "ESCALATION",
      severity: "WARNING",
      covenant_type: "FORM_D",
      evidence: { form_d_filing_id: filing.id, funds_received_at: filing.funds_received_at },
      recommended_action:
        "Funds received but no irrevocable commitment recorded. Bank receipt is not a first sale; confirm the commitment date and call triggerFirstSaleClock with committed_at.",
      escalated_to: "compliance_reviewer",
    });
  }

  summary.skipped = [DEAL_MODEL_SKIPS.OFAC_FLAG, DEAL_MODEL_SKIPS.KYC_SESSIONS];
  return summary;
});
