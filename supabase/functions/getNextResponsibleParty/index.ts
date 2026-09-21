import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { IRS_TIME_ZONE } from "../../../schemas/constants.ts";
import type { EINRequestRow, ResponsiblePartyRow } from "../../../schemas/types.ts";
import { fail, ok, serveFunction } from "../_shared/http.ts";
import { isUniqueViolation, unwrap } from "../_shared/records.ts";
import { calendarDateInZone, monthKeyInZone } from "../_shared/time.ts";
import { numberOption, optionalString } from "../_shared/validate.ts";

/**
 * Responsible Party Rotation — IRS SS-4 EIN Throttle Manager
 *
 * IRS rules: each responsible party may obtain 1 EIN per day via the online
 * SS-4 system, measured on the IRS's Eastern-time calendar day. This function
 * rotates through the pooled signatories, respecting that limit.
 *
 * Body (all optional):
 *   spv_id       — when supplied, the assignment is idempotent per SPV: an
 *                  open ein_requests row for the SPV returns its existing party
 *                  instead of consuming another signatory, and a new PENDING
 *                  request is created on first assignment. A partial unique
 *                  index guarantees at most one open request per SPV.
 *   monthly_cap  — per-party monthly ceiling; parties at the cap become
 *                  EXHAUSTED until the next month. Defaults to
 *                  DIBS_EIN_MONTHLY_CAP or no cap.
 *
 * Concurrency: a claim is a single conditional UPDATE (... WHERE status =
 * 'AVAILABLE') so two callers can never take the same party.
 */
serveFunction(async ({ db, body }) => {
  const spv_id = optionalString(body, "spv_id");
  const envCap = Number(Deno.env.get("DIBS_EIN_MONTHLY_CAP") ?? "");
  const monthlyCap = numberOption(body, "monthly_cap", {
    default: Number.isFinite(envCap) && envCap > 0 ? envCap : Number.POSITIVE_INFINITY,
    min: 1,
    integer: true,
  });

  const now = new Date();
  const today = calendarDateInZone(now, IRS_TIME_ZONE);
  const thisMonth = monthKeyInZone(now, IRS_TIME_ZONE);

  if (spv_id) {
    const existing = await findOpenRequest(db, spv_id);
    if (existing) return ok(alreadyAssigned(spv_id, existing));
  }

  await resetStaleParties(db, today, thisMonth);

  const available = unwrap(
    await db.from("responsible_parties").select("*").eq("status", "AVAILABLE").order("last_used_date", {
      ascending: true,
      nullsFirst: true,
    }),
  ) as ResponsiblePartyRow[];

  for (const party of available) {
    const claimed = await tryClaim(db, party, today, thisMonth, monthlyCap);
    if (!claimed) continue;

    let einRequestId: string | undefined;
    if (spv_id) {
      const { data, error } = await db.from("ein_requests").insert({
        spv_id,
        responsible_party: claimed.name,
        responsible_party_id: claimed.id,
        request_date: now.toISOString(),
        status: "PENDING",
      }).select("id").single();
      if (error) {
        if (!isUniqueViolation(error)) throw error;
        // Another caller opened a request for this SPV between our check and insert:
        // hand the signatory back and return the winner's assignment.
        await releaseClaim(db, party, claimed);
        const winner = await findOpenRequest(db, spv_id);
        if (winner) return ok(alreadyAssigned(spv_id, winner));
        throw error;
      }
      einRequestId = data.id;
    }

    return ok({
      already_assigned: false,
      responsible_party_id: claimed.id,
      name: claimed.name,
      ein_count_this_month: claimed.ein_count_this_month,
      ein_request_id: einRequestId,
      irs_calendar_date: today,
      message: `Responsible party assigned: ${claimed.name}. EIN count this month: ${claimed.ein_count_this_month}.`,
    });
  }

  return fail(
    429,
    "NO_AVAILABLE_PARTY",
    "All responsible parties have been used today (IRS Eastern-time day). EIN requests must wait until tomorrow or be filed manually via paper SS-4.",
    { irs_calendar_date: today },
  );
});

async function findOpenRequest(db: SupabaseClient, spvId: string): Promise<EINRequestRow | null> {
  return unwrap(
    await db.from("ein_requests").select("*").eq("spv_id", spvId).in("status", ["PENDING", "ISSUED"]).limit(1)
      .maybeSingle(),
  ) as EINRequestRow | null;
}

function alreadyAssigned(spvId: string, request: EINRequestRow): Record<string, unknown> {
  return {
    already_assigned: true,
    ein_request_id: request.id,
    ein_request_status: request.status,
    responsible_party_id: request.responsible_party_id,
    name: request.responsible_party,
    message: `SPV ${spvId} already has an open EIN request; reusing its responsible party.`,
  };
}

/** Returns USED_TODAY parties from earlier days, and EXHAUSTED parties from earlier months, to the pool. */
async function resetStaleParties(db: SupabaseClient, today: string, thisMonth: string): Promise<void> {
  const stale = unwrap(
    await db.from("responsible_parties").select("*").in("status", ["USED_TODAY", "EXHAUSTED"]),
  ) as ResponsiblePartyRow[];

  for (const party of stale) {
    const lastUsed = party.last_used_date ?? "";
    const newMonth = lastUsed.slice(0, 7) < thisMonth;
    const newDay = lastUsed < today;
    if (party.status === "USED_TODAY" && newDay) {
      unwrap(
        await db.from("responsible_parties").update({
          status: "AVAILABLE",
          ein_used_today: false,
          ...(newMonth ? { ein_count_this_month: 0 } : {}),
        }).eq("id", party.id).eq("status", "USED_TODAY"),
      );
    } else if (party.status === "EXHAUSTED" && newMonth) {
      unwrap(
        await db.from("responsible_parties").update({
          status: "AVAILABLE",
          ein_used_today: false,
          ein_count_this_month: 0,
        }).eq("id", party.id).eq("status", "EXHAUSTED"),
      );
    }
  }
}

/** Atomic claim: the conditional UPDATE only matches while the party is still AVAILABLE. */
async function tryClaim(
  db: SupabaseClient,
  party: ResponsiblePartyRow,
  today: string,
  thisMonth: string,
  monthlyCap: number,
): Promise<ResponsiblePartyRow | null> {
  const countBase = (party.last_used_date ?? "").slice(0, 7) === thisMonth ? party.ein_count_this_month : 0;
  const newCount = countBase + 1;

  return unwrap(
    await db.from("responsible_parties").update({
      status: newCount >= monthlyCap ? "EXHAUSTED" : "USED_TODAY",
      ein_used_today: true,
      last_used_date: today,
      ein_count_this_month: newCount,
    }).eq("id", party.id).eq("status", "AVAILABLE").select("*").maybeSingle(),
  ) as ResponsiblePartyRow | null;
}

/** Compensating update when a claim turned out not to be needed. */
async function releaseClaim(
  db: SupabaseClient,
  before: ResponsiblePartyRow,
  after: ResponsiblePartyRow,
): Promise<void> {
  unwrap(
    await db.from("responsible_parties").update({
      status: before.status,
      ein_used_today: before.ein_used_today,
      last_used_date: before.last_used_date,
      ein_count_this_month: before.ein_count_this_month,
    }).eq("id", after.id).eq("status", after.status).eq("ein_count_this_month", after.ein_count_this_month),
  );
}
