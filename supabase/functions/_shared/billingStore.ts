import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { BillingEventRow, DealConfigurationRow, PricingTier } from "../../../schemas/types.ts";
import { type Charge, type ResolvedFeeSchedule, resolveFeeSchedule } from "./billing.ts";
import { isUniqueViolation, unwrap } from "./records.ts";

/**
 * billing_events reads and writes shared by the dibs-billing runner and
 * verifySeriesLedger (audit packages). Pure charge rules live in billing.ts.
 */

/** Refs per existence lookup; keeps the PostgREST GET URL well under proxy limits. */
const REF_LOOKUP_CHUNK = 100;

export type SpvFeeSchedule = ResolvedFeeSchedule & { dealId: string | null };

/** Fee schedule and deal id per SPV from deal_configurations; SPVs without a row are absent. */
export async function loadSchedules(db: SupabaseClient, spvIds: string[]): Promise<Map<string, SpvFeeSchedule>> {
  const out = new Map<string, SpvFeeSchedule>();
  for (let i = 0; i < spvIds.length; i += 200) {
    const rows = unwrap(
      await db.from("deal_configurations").select("spv_id,deal_id,fee_schedule").in("spv_id", spvIds.slice(i, i + 200)),
    ) as Pick<DealConfigurationRow, "spv_id" | "deal_id" | "fee_schedule">[];
    for (const row of rows) out.set(row.spv_id, { ...resolveFeeSchedule(row.fee_schedule), dealId: row.deal_id });
  }
  return out;
}

/** One SPV's schedule, falling back to the SPONSOR default when it has no deal_configurations row. */
export async function loadSchedule(db: SupabaseClient, spvId: string): Promise<SpvFeeSchedule> {
  return (await loadSchedules(db, [spvId])).get(spvId) ?? { ...resolveFeeSchedule(null), dealId: null };
}

export async function existingRefs(db: SupabaseClient, refs: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < refs.length; i += REF_LOOKUP_CHUNK) {
    const rows = unwrap(
      await db.from("billing_events").select("source_ref").in("source_ref", refs.slice(i, i + REF_LOOKUP_CHUNK)),
    ) as Pick<BillingEventRow, "source_ref">[];
    for (const r of rows) found.add(r.source_ref);
  }
  return found;
}

/** Who a charge is billed against: an SPV (and its deal), or a platform license. */
export type ChargeSubject =
  | { spv_id: string; deal_id: string | null; platform_license_id?: null }
  | { spv_id?: null; deal_id?: null; platform_license_id: string };

/** Inserts a PENDING charge. False when its source_ref is already billed (unique violation). */
export async function insertCharge(
  db: SupabaseClient,
  subject: ChargeSubject,
  tier: PricingTier,
  tierSource: BillingEventRow["tier_source"],
  c: Charge,
): Promise<boolean> {
  const { error } = await db.from("billing_events").insert({
    spv_id: subject.spv_id ?? null,
    deal_id: subject.deal_id ?? null,
    platform_license_id: subject.platform_license_id ?? null,
    charge_type: c.charge_type,
    tier,
    tier_source: tierSource,
    quantity: c.quantity,
    unit_amount: c.unit_amount,
    amount: c.amount,
    currency: "USD",
    description: c.description,
    source_ref: c.source_ref,
    source_event_id: c.source_event_id,
    period_start: c.period_start ?? null,
    period_end: c.period_end ?? null,
    occurred_at: c.occurred_at,
    status: "PENDING",
  });
  if (!error) return true;
  if (isUniqueViolation(error)) return false;
  throw error;
}
