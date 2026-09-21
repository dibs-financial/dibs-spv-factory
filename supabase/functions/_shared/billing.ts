import { DEFAULT_FEE_SCHEDULES, PRICING_TIERS } from "../../../schemas/pricing.ts";
import type { BillingChargeType, FeeSchedule, PricingTier } from "../../../schemas/types.ts";
import type { LedgerRow } from "../../../schemas/types.ts";
import { isPlainObject, toMillis } from "./records.ts";
import { roundToCents } from "./money.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ResolvedFeeSchedule {
  schedule: FeeSchedule;
  source: "deal" | "default";
}

/**
 * Resolves the fee schedule for an SPV from deal_configurations.fee_schedule.
 * A missing or partial schedule falls back to the tier default field by field
 * (tier itself defaults to SPONSOR). Only finite, non-negative numbers are
 * accepted from the stored JSON; anything else takes the default.
 */
export function resolveFeeSchedule(raw: unknown): ResolvedFeeSchedule {
  const stored = isPlainObject(raw) ? raw : {};
  const tier: PricingTier = (PRICING_TIERS as readonly string[]).includes(String(stored.tier))
    ? stored.tier as PricingTier
    : "SPONSOR";
  const base = DEFAULT_FEE_SCHEDULES[tier];
  const num = (key: keyof FeeSchedule): number => {
    const v = stored[key];
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : base[key] as number;
  };
  const hasOverrides = Object.keys(stored).length > 0;
  return {
    source: hasOverrides ? "deal" : "default",
    schedule: {
      tier,
      formation_fee: num("formation_fee"),
      rush_track: stored.rush_track === true,
      rush_formation_fee: num("rush_formation_fee"),
      admin_fee_annual: num("admin_fee_annual"),
      onboarding_fee_per_investor: num("onboarding_fee_per_investor"),
      form_d_fee: num("form_d_fee"),
      blue_sky_fee_per_state: num("blue_sky_fee_per_state"),
      late_filing_remediation_fee: num("late_filing_remediation_fee"),
      registered_series_conversion_fee: num("registered_series_conversion_fee"),
      audit_package_fee: num("audit_package_fee"),
      ein_manual_filing_fee: num("ein_manual_filing_fee"),
      currency: "USD",
    },
  };
}

export interface Charge {
  charge_type: BillingChargeType;
  unit_amount: number;
  quantity: number;
  amount: number;
  description: string;
  source_ref: string;
  source_event_id: string | null;
  occurred_at: string;
  period_start?: string;
  period_end?: string;
}

function charge(
  type: BillingChargeType,
  unit: number,
  description: string,
  sourceRef: string,
  occurredAt: string,
  extra: Partial<Charge> = {},
): Charge {
  const quantity = extra.quantity ?? 1;
  return {
    charge_type: type,
    unit_amount: roundToCents(unit),
    quantity,
    amount: roundToCents(unit * quantity),
    description,
    source_ref: sourceRef,
    source_event_id: extra.source_event_id ?? null,
    occurred_at: occurredAt,
    ...(extra.period_start ? { period_start: extra.period_start, period_end: extra.period_end } : {}),
  };
}

/**
 * The charge a ledger event produces, or null when the event is not
 * chargeable. Idempotency key is ledger:<entry id>.
 */
export function chargeForLedgerEvent(
  event: Pick<LedgerRow, "id" | "spv_id" | "event_type" | "event_data" | "event_timestamp">,
  s: FeeSchedule,
): Charge | null {
  const ref = `ledger:${event.id}`;
  const at = event.event_timestamp;
  switch (event.event_type) {
    case "SERIES_CREATED":
      return s.rush_track
        ? charge("RUSH_FORMATION", s.rush_formation_fee, "Series formation, 72-hour track", ref, at, {
          source_event_id: event.id,
        })
        : charge("FORMATION", s.formation_fee, "Series formation", ref, at, { source_event_id: event.id });
    case "KYC_PASS": {
      const investor = typeof event.event_data.investor_id === "string" ? event.event_data.investor_id : "investor";
      return charge("ONBOARDING", s.onboarding_fee_per_investor, `Investor onboarding: ${investor}`, ref, at, {
        source_event_id: event.id,
      });
    }
    case "FORM_D_FILED":
      return charge("FORM_D", s.form_d_fee, "Form D preparation and filing tracking (SEC fees at cost)", ref, at, {
        source_event_id: event.id,
      });
    case "BLUE_SKY_FILED": {
      const state = typeof event.event_data.jurisdiction === "string" ? event.event_data.jurisdiction : "state";
      return charge("BLUE_SKY", s.blue_sky_fee_per_state, `Blue-sky notice: ${state} (state fees at cost)`, ref, at, {
        source_event_id: event.id,
      });
    }
    default:
      return null;
  }
}

/**
 * Administration is billed per series per year from the formation event:
 * year 0 at formation, year n on each anniversary that has arrived, and
 * nothing after a WIND_DOWN. Idempotency key is admin:<spv>:<n>.
 */
export function administrationCharges(
  spvId: string,
  formationAt: string,
  now: Date,
  s: FeeSchedule,
  windDownAt?: string | null,
): Charge[] {
  const start = new Date(formationAt);
  if (!Number.isFinite(start.getTime()) || s.admin_fee_annual <= 0) return [];
  const stop = windDownAt ? toMillis(windDownAt) : Number.POSITIVE_INFINITY;
  const out: Charge[] = [];
  for (let n = 0;; n++) {
    const periodStart = addYears(start, n);
    if (periodStart.getTime() > now.getTime() || periodStart.getTime() >= stop) break;
    const periodEnd = new Date(addYears(start, n + 1).getTime() - DAY_MS);
    out.push(charge(
      "ADMINISTRATION",
      s.admin_fee_annual,
      `Series administration, year ${n + 1}`,
      `admin:${spvId}:${n}`,
      periodStart.toISOString(),
      { period_start: isoDate(periodStart), period_end: isoDate(periodEnd) },
    ));
  }
  return out;
}

/**
 * A Form D filed after the filing went OVERDUE carries the remediation fee.
 * `overdueSequences` are the sequence numbers of STATE_CHANGE events that
 * moved form_d_filings to OVERDUE for this SPV. Key: late:<filed event id>.
 */
export function lateFilingCharge(
  filedEvent: Pick<LedgerRow, "id" | "sequence" | "event_timestamp">,
  overdueSequences: number[],
  s: FeeSchedule,
): Charge | null {
  const wasOverdue = overdueSequences.some((seq) => seq < filedEvent.sequence);
  if (!wasOverdue || s.late_filing_remediation_fee <= 0) return null;
  return charge(
    "LATE_FILING_REMEDIATION",
    s.late_filing_remediation_fee,
    "Late Form D remediation",
    `late:${filedEvent.id}`,
    filedEvent.event_timestamp,
    { source_event_id: filedEvent.id },
  );
}

/** An EIN obtained off the online channel carries the manual SS-4 fee. Key: ein_manual:<request id>. */
export function einManualFilingCharge(
  request: {
    id: string;
    status: string;
    submission_channel: string | null;
    submission_at: string | null;
    updated_at: string;
  },
  s: FeeSchedule,
): Charge | null {
  if (request.status !== "ISSUED" || !request.submission_channel || request.submission_channel === "ONLINE") {
    return null;
  }
  if (s.ein_manual_filing_fee <= 0) return null;
  return charge(
    "EIN_MANUAL_FILING",
    s.ein_manual_filing_fee,
    `Manual SS-4 filing (${request.submission_channel})`,
    `ein_manual:${request.id}`,
    request.submission_at ?? request.updated_at,
  );
}

function addYears(d: Date, years: number): Date {
  const out = new Date(d.getTime());
  out.setUTCFullYear(out.getUTCFullYear() + years);
  return out;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
