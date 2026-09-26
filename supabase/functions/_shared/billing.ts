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
 * Drops ledger events that would bill the same thing twice, keeping the
 * earliest by sequence: a second SERIES_CREATED for an SPV, and a repeat
 * KYC_PASS for an investor already onboarded (re-verification is not a new
 * onboarding). KYC_PASS without an investor_id cannot be matched and is kept.
 * The kept event is always the earliest, so its ledger:<id> key is stable
 * across runs. Other event types pass through untouched.
 */
export function dedupeBillableEvents<
  E extends Pick<LedgerRow, "id" | "spv_id" | "event_type" | "event_data" | "sequence">,
>(events: E[]): E[] {
  const seen = new Set<string>();
  const out: E[] = [];
  for (const e of [...events].sort((a, b) => a.sequence - b.sequence)) {
    let key: string | null = null;
    if (e.event_type === "SERIES_CREATED") key = `formation:${e.spv_id}`;
    if (e.event_type === "KYC_PASS" && typeof e.event_data.investor_id === "string") {
      key = `onboarding:${e.spv_id}:${e.event_data.investor_id}`;
    }
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(e);
  }
  return out;
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

/**
 * A series whose deal_configurations.series_type is REGISTERED carries the
 * conversion fee once (Delaware fees pass through at cost, billed apart).
 * The charge is dated from the row's updated_at when the runner first sees it.
 * Key: registered:<spv>, so it can never be billed twice for one SPV.
 */
export function registeredConversionCharge(
  config: { spv_id: string; series_type: string; updated_at: string },
  s: FeeSchedule,
): Charge | null {
  if (config.series_type !== "REGISTERED" || s.registered_series_conversion_fee <= 0) return null;
  return charge(
    "REGISTERED_SERIES_CONVERSION",
    s.registered_series_conversion_fee,
    "Registered-series conversion (Delaware fees at cost)",
    `registered:${config.spv_id}`,
    config.updated_at,
  );
}

/**
 * An audit evidence package requested through verifySeriesLedger. Billed only
 * when the chain verifies: a package that shows the factory's own ledger is
 * broken is the factory's problem, not the client's. The key is the ledger
 * head, so asking again before anything new is appended is not a second
 * package. Key: audit:<spv>:<head sequence>.
 */
export function auditPackageCharge(
  pkg: { spv_id: string; valid: boolean; head_entry_id: string | null; head_sequence: number; requested_at: string },
  s: FeeSchedule,
): Charge | null {
  if (!pkg.valid || pkg.head_sequence <= 0 || s.audit_package_fee <= 0) return null;
  return charge(
    "AUDIT_PACKAGE",
    s.audit_package_fee,
    `Audit evidence package (ledger through entry ${pkg.head_sequence})`,
    `audit:${pkg.spv_id}:${pkg.head_sequence}`,
    pkg.requested_at,
    { source_event_id: pkg.head_entry_id },
  );
}

/** The license terms platformLicenseCharges needs; prices come from the (locked) license row. */
export interface PlatformLicenseTerms {
  id: string;
  start_date: string;
  end_date: string | null;
  annual_fee: number;
  included_series: number;
  additional_series_fee: number;
}

/** When a series under a license was formed and, if it was, wound down. */
export interface SeriesSpan {
  spv_id: string;
  formed_at: string;
  wound_down_at: string | null;
}

/**
 * Platform license charges, per license year n (start_date + n years):
 *   - the annual fee, billed when the year starts. Key license:<id>:<n>.
 *   - one additional-series charge for each series beyond included_series
 *     that was active at any point in the year: formed before the year (or
 *     the license) ended and not wound down before the year started.
 *     Key license_series:<id>:<n>:<k> for the k-th series of the year, so the
 *     number of charges follows the number of series whichever series are
 *     linked late; each is dated when that k-th series was formed (or when
 *     the year started, if later).
 * Nothing is billed for a year starting after `now` or on or after end_date.
 * Prices come from the license row, which the database locks for 24 months.
 */
export function platformLicenseCharges(license: PlatformLicenseTerms, series: SeriesSpan[], now: Date): Charge[] {
  const start = new Date(`${license.start_date}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime())) return [];
  const end = license.end_date ? toMillis(`${license.end_date}T00:00:00.000Z`) : Number.POSITIVE_INFINITY;
  const annual = Number(license.annual_fee);
  const included = Number(license.included_series);
  const extraFee = Number(license.additional_series_fee);
  const out: Charge[] = [];
  for (let n = 0;; n++) {
    const yearStart = addYears(start, n);
    if (yearStart.getTime() > now.getTime() || yearStart.getTime() >= end) break;
    const yearEnd = addYears(start, n + 1);
    const period = { period_start: isoDate(yearStart), period_end: isoDate(new Date(yearEnd.getTime() - DAY_MS)) };
    if (annual > 0) {
      out.push(charge(
        "PLATFORM_LICENSE",
        annual,
        `Platform license, year ${n + 1} (${included} series included)`,
        `license:${license.id}:${n}`,
        yearStart.toISOString(),
        period,
      ));
    }
    if (extraFee <= 0) continue;
    const cutoff = Math.min(yearEnd.getTime(), end, now.getTime());
    const active = series
      .filter((sp) => {
        const formed = toMillis(sp.formed_at);
        if (formed === 0 || formed >= cutoff) return false;
        return !sp.wound_down_at || toMillis(sp.wound_down_at) >= yearStart.getTime();
      })
      .sort((a, b) => toMillis(a.formed_at) - toMillis(b.formed_at) || a.spv_id.localeCompare(b.spv_id));
    for (let k = included + 1; k <= active.length; k++) {
      const formed = Math.max(toMillis(active[k - 1].formed_at), yearStart.getTime());
      out.push(charge(
        "PLATFORM_ADDITIONAL_SERIES",
        extraFee,
        `Platform license, year ${n + 1}: additional series ${k} (beyond ${included} included)`,
        `license_series:${license.id}:${n}:${k}`,
        new Date(formed).toISOString(),
        period,
      ));
    }
  }
  return out;
}
