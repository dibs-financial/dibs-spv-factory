import type { BlueSkyFilingRow, EINRequestRow, FormDFilingRow, MasterEntityRow } from "../../../schemas/types.ts";
import { raiseAlert } from "../_shared/alerts.ts";
import { formDPhase } from "../_shared/formD.ts";
import { unwrap } from "../_shared/records.ts";
import { DEAL_MODEL_SKIPS, serveRunner } from "../_shared/runner.ts";

/**
 * DIBS Covenant Monitor — hourly (pg_cron `0 * * * *`).
 *
 * Read-only on every table except alert_log. Never approves, waives or
 * modifies covenant status. Checks that can run from factory tables:
 *   - statutory gate: no ACTIVE master, several, or notice missing → CRITICAL ESCALATION
 *   - Form D deadlines passed since the daily tracker → CRITICAL FORM_D_OVERDUE
 *   - blue-sky filings marked OVERDUE → WARNING BLUE_SKY_OVERDUE
 *   - EIN requests FAILED / THROTTLED / MANUAL_REQUIRED → WARNING EIN_FAILURE
 * LTV, milestones and OFAC need deal-model rows that are not in this
 * repository; they are reported under `skipped` so the gap is visible in
 * every run summary. When nothing is found, one INFO COMPLIANCE_CHECK_PASS
 * per run is written for the audit trail.
 */
serveRunner("dibs-covenant-monitor", async ({ db, now }) => {
  const summary = { findings: 0, alerts_created: 0, skipped: [] as string[] };
  const raise = async (input: Parameters<typeof raiseAlert>[1]) => {
    summary.findings += 1;
    const r = await raiseAlert(db, input, { dedupe: true });
    if (r.created) summary.alerts_created += 1;
  };

  // Statutory gate
  const masters = unwrap(await db.from("master_entities").select("*").eq("status", "ACTIVE")) as MasterEntityRow[];
  if (masters.length !== 1 || !masters[0].has_liability_notice) {
    await raise({
      spv_id: "MASTER",
      alert_type: "ESCALATION",
      severity: "CRITICAL",
      covenant_type: "STATUTORY_18_215_B",
      evidence: { active_masters: masters.length, has_liability_notice: masters[0]?.has_liability_notice ?? null },
      recommended_action: masters.length === 0
        ? "Configure the ACTIVE master entity; all formation is blocked."
        : masters.length > 1
        ? "More than one ACTIVE master entity; deactivate all but one."
        : "Master Certificate of Formation lacks the § 18-215(b) notice; counsel must resolve before any formation.",
      escalated_to: "counsel",
    });
  }

  // Form D deadlines passed between daily tracker runs
  const pending = unwrap(await db.from("form_d_filings").select("*").eq("status", "PENDING")) as FormDFilingRow[];
  for (const filing of pending) {
    const phase = formDPhase(filing, now);
    if (phase?.phase === "OVERDUE") {
      await raise({
        spv_id: filing.spv_id,
        alert_type: "FORM_D_OVERDUE",
        severity: "CRITICAL",
        covenant_type: "FORM_D",
        evidence: { filing_deadline: filing.filing_deadline, ...phase },
        recommended_action: "Form D deadline passed; file on EDGAR and record filed_date.",
        escalated_to: "counsel",
      });
    }
  }

  // Blue-sky notices
  const blueSky = unwrap(await db.from("blue_sky_filings").select("*").eq("status", "OVERDUE")) as BlueSkyFilingRow[];
  for (const row of blueSky) {
    await raise({
      spv_id: row.spv_id,
      alert_type: "BLUE_SKY_OVERDUE",
      severity: "WARNING",
      covenant_type: "BLUE_SKY",
      evidence: { jurisdiction: row.jurisdiction, filing_id: row.id },
      recommended_action: `File the ${row.jurisdiction} notice and record filed_date.`,
    });
  }

  // EIN failures
  const einIssues = unwrap(
    await db.from("ein_requests").select("*").in("status", ["FAILED", "THROTTLED", "MANUAL_REQUIRED"]),
  ) as EINRequestRow[];
  for (const row of einIssues) {
    await raise({
      spv_id: row.spv_id,
      alert_type: "EIN_FAILURE",
      severity: "WARNING",
      covenant_type: "EIN",
      evidence: { ein_request_id: row.id, status: row.status, responsible_party: row.responsible_party },
      recommended_action: row.status === "THROTTLED"
        ? "IRS throttle; retry on the next Eastern calendar day."
        : "File paper SS-4 and update the request to ISSUED with the EIN.",
    });
  }

  summary.skipped = [DEAL_MODEL_SKIPS.LTV_BREACH, DEAL_MODEL_SKIPS.MILESTONE_OVERDUE, DEAL_MODEL_SKIPS.OFAC_FLAG];

  if (summary.findings === 0) {
    await raiseAlert(db, {
      spv_id: "ALL",
      alert_type: "COMPLIANCE_CHECK_PASS",
      severity: "INFO",
      evidence: { checked_at: now.toISOString(), pending_form_d: pending.length, skipped: summary.skipped },
    });
  }

  return summary;
});
