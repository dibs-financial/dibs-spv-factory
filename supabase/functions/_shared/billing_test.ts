import { assertEquals } from "jsr:@std/assert@1";
import { DEFAULT_FEE_SCHEDULES } from "../../../schemas/pricing.ts";
import {
  administrationCharges,
  chargeForLedgerEvent,
  einManualFilingCharge,
  lateFilingCharge,
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
