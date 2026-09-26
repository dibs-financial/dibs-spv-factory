import { assertEquals } from "jsr:@std/assert@1";
import type { LedgerEventType } from "../../../schemas/constants.ts";
import { DEFAULT_FEE_SCHEDULES, PLATFORM_LICENSE } from "../../../schemas/pricing.ts";
import {
  administrationCharges,
  auditPackageCharge,
  chargeForLedgerEvent,
  dedupeBillableEvents,
  einManualFilingCharge,
  lateFilingCharge,
  platformLicenseCharges,
  registeredConversionCharge,
  resolveFeeSchedule,
} from "./billing.ts";

const sponsor = DEFAULT_FEE_SCHEDULES.SPONSOR;

Deno.test("resolveFeeSchedule: empty → SPONSOR defaults, marked default", () => {
  const r = resolveFeeSchedule(null);
  assertEquals(r.source, "default");
  assertEquals(r.schedule, sponsor);
});

Deno.test("resolveFeeSchedule: tier picks defaults, valid overrides win, junk is ignored", () => {
  const r = resolveFeeSchedule({
    tier: "FUND",
    formation_fee: 2500,
    onboarding_fee_per_investor: -5,
    form_d_fee: "600",
    rush_track: true,
  });
  assertEquals(r.source, "deal");
  assertEquals(r.schedule.tier, "FUND");
  assertEquals(r.schedule.formation_fee, 2500);
  assertEquals(r.schedule.onboarding_fee_per_investor, DEFAULT_FEE_SCHEDULES.FUND.onboarding_fee_per_investor);
  assertEquals(r.schedule.form_d_fee, DEFAULT_FEE_SCHEDULES.FUND.form_d_fee);
  assertEquals(r.schedule.rush_track, true);
  assertEquals(resolveFeeSchedule({ tier: "BOGUS" }).schedule.tier, "SPONSOR");
});

Deno.test("chargeForLedgerEvent maps the four billable events and ignores the rest", () => {
  const base = { id: "e1", spv_id: "spv", event_data: {}, event_timestamp: "2026-03-01T00:00:00.000Z" };
  const formation = chargeForLedgerEvent({ ...base, event_type: "SERIES_CREATED" }, sponsor);
  assertEquals(formation?.charge_type, "FORMATION");
  assertEquals(formation?.amount, 3500);
  assertEquals(formation?.source_ref, "ledger:e1");
  assertEquals(formation?.source_event_id, "e1");
  const rush = chargeForLedgerEvent({ ...base, event_type: "SERIES_CREATED" }, { ...sponsor, rush_track: true });
  assertEquals(rush?.charge_type, "RUSH_FORMATION");
  assertEquals(rush?.amount, 6500);
  const kyc = chargeForLedgerEvent({ ...base, event_type: "KYC_PASS", event_data: { investor_id: "inv_1" } }, sponsor);
  assertEquals(kyc?.charge_type, "ONBOARDING");
  assertEquals(kyc?.amount, 95);
  assertEquals(kyc?.description, "Investor onboarding: inv_1");
  assertEquals(chargeForLedgerEvent({ ...base, event_type: "FORM_D_FILED" }, sponsor)?.amount, 600);
  assertEquals(
    chargeForLedgerEvent({ ...base, event_type: "BLUE_SKY_FILED", event_data: { jurisdiction: "NY" } }, sponsor)
      ?.description,
    "Blue-sky notice: NY (state fees at cost)",
  );
  assertEquals(chargeForLedgerEvent({ ...base, event_type: "KYC_FAIL" }, sponsor), null);
  assertEquals(chargeForLedgerEvent({ ...base, event_type: "STATE_CHANGE" }, sponsor), null);
});

Deno.test("administrationCharges: year 0 at formation, anniversaries as they arrive, none after wind-down", () => {
  const formed = "2024-05-10T12:00:00.000Z";
  const one = administrationCharges("spv", formed, new Date("2024-06-01T00:00:00.000Z"), sponsor);
  assertEquals(one.map((c) => c.source_ref), ["admin:spv:0"]);
  assertEquals(one[0].period_start, "2024-05-10");
  assertEquals(one[0].period_end, "2025-05-09");
  assertEquals(one[0].amount, 2400);
  const three = administrationCharges("spv", formed, new Date("2026-09-21T00:00:00.000Z"), sponsor);
  assertEquals(three.map((c) => c.source_ref), ["admin:spv:0", "admin:spv:1", "admin:spv:2"]);
  const wound = administrationCharges(
    "spv",
    formed,
    new Date("2026-09-21T00:00:00.000Z"),
    sponsor,
    "2025-12-01T00:00:00.000Z",
  );
  assertEquals(wound.map((c) => c.source_ref), ["admin:spv:0", "admin:spv:1"]);
  assertEquals(administrationCharges("spv", formed, new Date(), DEFAULT_FEE_SCHEDULES.PLATFORM), []);
  assertEquals(administrationCharges("spv", "not a date", new Date(), sponsor), []);
});

Deno.test("lateFilingCharge only when an OVERDUE state change precedes the filing", () => {
  const filed = { id: "f1", sequence: 9, event_timestamp: "2026-04-01T00:00:00.000Z" };
  assertEquals(lateFilingCharge(filed, [], sponsor), null);
  assertEquals(lateFilingCharge(filed, [12], sponsor), null);
  const late = lateFilingCharge(filed, [7], sponsor);
  assertEquals(late?.charge_type, "LATE_FILING_REMEDIATION");
  assertEquals(late?.amount, 1500);
  assertEquals(late?.source_ref, "late:f1");
});

Deno.test("einManualFilingCharge only for issued, off-line submissions", () => {
  const base = {
    id: "r1",
    status: "ISSUED",
    submission_channel: "MAIL",
    submission_at: "2026-02-02T00:00:00.000Z",
    updated_at: "2026-02-03T00:00:00.000Z",
  };
  assertEquals(einManualFilingCharge(base, sponsor)?.amount, 250);
  assertEquals(einManualFilingCharge(base, sponsor)?.source_ref, "ein_manual:r1");
  assertEquals(einManualFilingCharge({ ...base, submission_channel: "ONLINE" }, sponsor), null);
  assertEquals(einManualFilingCharge({ ...base, submission_channel: null }, sponsor), null);
  assertEquals(einManualFilingCharge({ ...base, status: "PENDING" }, sponsor), null);
});

Deno.test("dedupeBillableEvents: one formation per SPV, one onboarding per investor, earliest kept", () => {
  const ev = (id: string, spv_id: string, sequence: number, event_type: LedgerEventType, event_data = {}) => ({
    id,
    spv_id,
    sequence,
    event_type,
    event_data,
  });
  const kept = dedupeBillableEvents([
    ev("k3", "a", 5, "KYC_PASS", { investor_id: "inv_1" }),
    ev("s2", "a", 4, "SERIES_CREATED"),
    ev("s1", "a", 1, "SERIES_CREATED"),
    ev("k1", "a", 2, "KYC_PASS", { investor_id: "inv_1" }),
    ev("k2", "a", 3, "KYC_PASS", { investor_id: "inv_2" }),
    ev("n1", "a", 6, "KYC_PASS"),
    ev("n2", "a", 7, "KYC_PASS"),
    ev("b1", "b", 1, "SERIES_CREATED"),
    ev("k4", "b", 2, "KYC_PASS", { investor_id: "inv_1" }),
    ev("f1", "a", 8, "FORM_D_FILED"),
    ev("f2", "a", 9, "FORM_D_FILED"),
  ]);
  assertEquals(kept.map((e) => e.id).sort(), ["b1", "f1", "f2", "k1", "k2", "k4", "n1", "n2", "s1"]);
});

Deno.test("registeredConversionCharge: once per REGISTERED SPV, never for PROTECTED", () => {
  const config = { spv_id: "spv", series_type: "REGISTERED", updated_at: "2026-05-01T00:00:00.000Z" };
  const c = registeredConversionCharge(config, sponsor);
  assertEquals(c?.charge_type, "REGISTERED_SERIES_CONVERSION");
  assertEquals(c?.amount, 2500);
  assertEquals(c?.source_ref, "registered:spv");
  assertEquals(c?.occurred_at, "2026-05-01T00:00:00.000Z");
  assertEquals(registeredConversionCharge({ ...config, series_type: "PROTECTED" }, sponsor), null);
  assertEquals(registeredConversionCharge(config, { ...sponsor, registered_series_conversion_fee: 0 }), null);
});

Deno.test("auditPackageCharge: verified chain only, keyed on the ledger head, free on PLATFORM", () => {
  const pkg = {
    spv_id: "spv",
    valid: true,
    head_entry_id: "e9",
    head_sequence: 9,
    requested_at: "2026-06-01T00:00:00.000Z",
  };
  const c = auditPackageCharge(pkg, sponsor);
  assertEquals(c?.charge_type, "AUDIT_PACKAGE");
  assertEquals(c?.amount, 750);
  assertEquals(c?.source_ref, "audit:spv:9");
  assertEquals(c?.source_event_id, "e9");
  assertEquals(auditPackageCharge(pkg, DEFAULT_FEE_SCHEDULES.FUND)?.amount, 500);
  assertEquals(auditPackageCharge(pkg, DEFAULT_FEE_SCHEDULES.PLATFORM), null);
  assertEquals(auditPackageCharge({ ...pkg, valid: false }, sponsor), null);
  assertEquals(auditPackageCharge({ ...pkg, head_entry_id: null, head_sequence: 0 }, sponsor), null);
});

const license = {
  id: "lic",
  start_date: "2026-01-15",
  end_date: null,
  annual_fee: PLATFORM_LICENSE.annual_fee,
  included_series: PLATFORM_LICENSE.included_series,
  additional_series_fee: PLATFORM_LICENSE.additional_series_fee,
};
const formedSeries = (count: number, formedAt: (i: number) => string, wound: string | null = null) =>
  Array.from({ length: count }, (_, i) => ({ spv_id: `s${i + 1}`, formed_at: formedAt(i), wound_down_at: wound }));

Deno.test("platformLicenseCharges: annual fee per license year as each year starts", () => {
  const year1 = platformLicenseCharges(license, [], new Date("2026-01-15T00:00:00.000Z"));
  assertEquals(year1.map((c) => [c.source_ref, c.amount, c.period_start, c.period_end]), [
    ["license:lic:0", 60000, "2026-01-15", "2027-01-14"],
  ]);
  assertEquals(year1[0].charge_type, "PLATFORM_LICENSE");
  assertEquals(platformLicenseCharges(license, [], new Date("2026-01-14T23:59:59.000Z")), []);
  const three = platformLicenseCharges(license, [], new Date("2028-06-01T00:00:00.000Z"));
  assertEquals(three.map((c) => c.source_ref), ["license:lic:0", "license:lic:1", "license:lic:2"]);
});

Deno.test("platformLicenseCharges: no year starting on or after end_date", () => {
  const ended = { ...license, end_date: "2027-01-15" };
  assertEquals(
    platformLicenseCharges(ended, [], new Date("2029-01-01T00:00:00.000Z")).map((c) => c.source_ref),
    ["license:lic:0"],
  );
});

Deno.test("platformLicenseCharges: 25 series included, one charge per series beyond", () => {
  const now = new Date("2026-12-01T00:00:00.000Z");
  const at25 = platformLicenseCharges(
    license,
    formedSeries(25, (i) => `2026-02-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`),
    now,
  );
  assertEquals(at25.filter((c) => c.charge_type === "PLATFORM_ADDITIONAL_SERIES"), []);
  const at27 = platformLicenseCharges(
    license,
    formedSeries(27, (i) => new Date(Date.UTC(2026, 1, 1 + i)).toISOString()),
    now,
  ).filter((c) => c.charge_type === "PLATFORM_ADDITIONAL_SERIES");
  assertEquals(at27.map((c) => [c.source_ref, c.amount]), [
    ["license_series:lic:0:26", 2000],
    ["license_series:lic:0:27", 2000],
  ]);
  // dated when the 26th series (by formation) was formed
  assertEquals(at27[0].occurred_at, new Date(Date.UTC(2026, 1, 26)).toISOString());
});

Deno.test("platformLicenseCharges: a series counts in every year it is active, not after wind-down", () => {
  const now = new Date("2027-06-01T00:00:00.000Z");
  // 26 series formed in year 1; all wound down before year 2 starts
  const woundEarly = formedSeries(26, () => "2026-03-01T00:00:00.000Z", "2026-12-31T00:00:00.000Z");
  const refs = platformLicenseCharges(license, woundEarly, now).map((c) => c.source_ref);
  assertEquals(refs, ["license:lic:0", "license_series:lic:0:26", "license:lic:1"]);
  // still running in year 2 → the 26th series is billed again for year 2
  const running = formedSeries(26, () => "2026-03-01T00:00:00.000Z");
  const year2 = platformLicenseCharges(license, running, now).filter((c) => c.source_ref.startsWith("license_series"));
  assertEquals(year2.map((c) => [c.source_ref, c.occurred_at]), [
    ["license_series:lic:0:26", "2026-03-01T00:00:00.000Z"],
    ["license_series:lic:1:26", "2027-01-15T00:00:00.000Z"],
  ]);
});

Deno.test("platformLicenseCharges: series formed after the license ended do not count", () => {
  const ended = { ...license, end_date: "2026-06-01" };
  const series = [
    ...formedSeries(25, () => "2026-02-01T00:00:00.000Z"),
    { spv_id: "late", formed_at: "2026-07-01T00:00:00.000Z", wound_down_at: null },
  ];
  const extra = platformLicenseCharges(ended, series, new Date("2026-12-01T00:00:00.000Z"))
    .filter((c) => c.charge_type === "PLATFORM_ADDITIONAL_SERIES");
  assertEquals(extra, []);
});
