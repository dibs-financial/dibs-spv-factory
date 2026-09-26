import type { DealConfigurationRow, EINRequestRow, LedgerRow } from "../../../schemas/types.ts";
import {
  administrationCharges,
  type Charge,
  chargeForLedgerEvent,
  dedupeBillableEvents,
  einManualFilingCharge,
  lateFilingCharge,
  registeredConversionCharge,
  resolveFeeSchedule,
} from "../_shared/billing.ts";
import { existingRefs, insertCharge, loadSchedules } from "../_shared/billingStore.ts";
import { selectAll } from "../_shared/records.ts";
import { serveRunner } from "../_shared/runner.ts";

/**
 * Billing runner — daily 01:30 UTC (pg_cron "30 1 * * *").
 *
 * Turns what the factory has already recorded into billing_events rows:
 *   - ledger SERIES_CREATED / KYC_PASS / FORM_D_FILED / BLUE_SKY_FILED
 *   - series administration, year 0 at formation and each anniversary,
 *     stopping at WIND_DOWN
 *   - late Form D remediation when a filing follows an OVERDUE state change
 *   - manual SS-4 filings (EIN issued off the ONLINE channel)
 *   - registered-series conversion, once per SPV whose deal_configurations
 *     series_type is REGISTERED
 * Fee schedule per SPV comes from deal_configurations.fee_schedule, falling
 * back to the tier default. Every charge carries a unique source_ref, so the
 * runner is idempotent: existing rows are skipped and a concurrent insert of
 * the same ref is treated as already billed. PENDING rows are the invoice
 * feed (view billing_invoice_feed); this runner never marks anything
 * invoiced or paid, and never touches the ledger.
 *
 * The whole billable history is read on every run, paging through PostgREST's
 * row limit: a formation event must stay visible for as long as its series
 * earns anniversary fees, and a late run must still catch every event since
 * the last one. A repeat SERIES_CREATED for an SPV, or a repeat KYC_PASS for
 * an investor, is not billed again (dedupeBillableEvents).
 *
 * Audit packages are billed by verifySeriesLedger when one is requested, not
 * here.
 */
const BILLABLE_EVENTS = ["SERIES_CREATED", "KYC_PASS", "FORM_D_FILED", "BLUE_SKY_FILED"] as const;

serveRunner("dibs-billing", async ({ db, now }) => {
  const summary = {
    spvs: 0,
    created: 0,
    skipped_existing: 0,
    by_type: {} as Record<string, number>,
    total_created_amount: 0,
    default_tier_spvs: [] as string[],
  };

  const events = await selectAll<LedgerRow>((from, to) =>
    db.from("series_registry_log").select("*").in("event_type", [
      ...BILLABLE_EVENTS,
      "WIND_DOWN",
      "STATE_CHANGE",
    ]).order("created_at", { ascending: true }).order("id", { ascending: true }).range(from, to)
  );
  const bySpv = new Map<string, LedgerRow[]>();
  const seenIds = new Set<string>();
  for (const e of events) {
    if (seenIds.has(e.id)) continue;
    seenIds.add(e.id);
    const list = bySpv.get(e.spv_id) ?? [];
    list.push(e);
    bySpv.set(e.spv_id, list);
  }

  const einRequests = await selectAll<EINRequestRow>((from, to) =>
    db.from("ein_requests").select("*").eq("status", "ISSUED").neq("submission_channel", "ONLINE").not(
      "submission_channel",
      "is",
      null,
    ).order("id", { ascending: true }).range(from, to)
  );
  for (const r of einRequests) if (!bySpv.has(r.spv_id)) bySpv.set(r.spv_id, []);

  const registered = await selectAll<Pick<DealConfigurationRow, "spv_id" | "series_type" | "updated_at">>((
    from,
    to,
  ) =>
    db.from("deal_configurations").select("spv_id,series_type,updated_at").eq("series_type", "REGISTERED").order(
      "spv_id",
    ).range(from, to)
  );
  const registeredBySpv = new Map(registered.map((r) => [r.spv_id, r]));
  for (const r of registered) if (!bySpv.has(r.spv_id)) bySpv.set(r.spv_id, []);

  const schedules = await loadSchedules(db, [...bySpv.keys()]);

  for (const [spvId, spvEvents] of bySpv) {
    summary.spvs += 1;
    const resolved = schedules.get(spvId) ?? resolveFeeSchedule(null);
    if (resolved.source === "default") summary.default_tier_spvs.push(spvId);
    const s = resolved.schedule;
    const dealId = schedules.get(spvId)?.dealId ?? null;

    const charges: Charge[] = [];
    for (const e of dedupeBillableEvents(spvEvents)) {
      const c = chargeForLedgerEvent(e, s);
      if (c) charges.push(c);
    }

    const formation = spvEvents.filter((e) =>
      e.event_type === "SERIES_CREATED"
    ).sort((a, b) => a.sequence - b.sequence)[0];
    if (formation) {
      const windDown = spvEvents.filter((e) => e.event_type === "WIND_DOWN").sort((a, b) =>
        a.sequence - b.sequence
      )[0]?.event_timestamp ?? null;
      charges.push(...administrationCharges(spvId, formation.event_timestamp, now, s, windDown));
    }

    const overdueSeqs = spvEvents
      .filter((e) =>
        e.event_type === "STATE_CHANGE" && e.event_data.entity === "form_d_filings" && e.event_data.to === "OVERDUE"
      )
      .map((e) => e.sequence);
    for (const filed of spvEvents.filter((e) => e.event_type === "FORM_D_FILED")) {
      const c = lateFilingCharge(filed, overdueSeqs, s);
      if (c) charges.push(c);
    }

    for (const r of einRequests.filter((r) => r.spv_id === spvId)) {
      const c = einManualFilingCharge(r, s);
      if (c) charges.push(c);
    }

    const config = registeredBySpv.get(spvId);
    if (config) {
      const c = registeredConversionCharge(config, s);
      if (c) charges.push(c);
    }

    const existing = await existingRefs(db, charges.map((c) => c.source_ref));
    for (const c of charges) {
      if (existing.has(c.source_ref)) {
        summary.skipped_existing += 1;
        continue;
      }
      const inserted = await insertCharge(db, spvId, dealId, resolved.schedule.tier, resolved.source, c);
      if (!inserted) {
        summary.skipped_existing += 1;
        continue;
      }
      summary.created += 1;
      summary.by_type[c.charge_type] = (summary.by_type[c.charge_type] ?? 0) + 1;
      summary.total_created_amount = Math.round((summary.total_created_amount + c.amount) * 100) / 100;
    }
  }

  return summary;
});
