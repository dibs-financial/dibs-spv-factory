import type { Base44Client } from "npm:@base44/sdk@0.8.31";
import { IRS_TIME_ZONE } from "../schemas/constants.ts";
import { fail, ok, serveFunction } from "./_shared/http.ts";
import type { Rec } from "./_shared/records.ts";
import { calendarDateInZone, monthKeyInZone } from "./_shared/time.ts";
import { numberOption, optionalString } from "./_shared/validate.ts";

/**
 * Responsible Party Rotation — IRS SS-4 EIN Throttle Manager
 *
 * IRS rules: each responsible party may obtain 1 EIN per day via the online
 * SS-4 system, measured on the IRS's Eastern-time calendar day. This function
 * rotates through the pooled signatories, respecting that limit.
 *
 * Body (all optional):
 *   spv_id       — when supplied, the assignment is idempotent per SPV: an
 *                  open EINRequest for the SPV returns its existing party
 *                  instead of consuming another signatory, and a new
 *                  EINRequest (PENDING) is created on first assignment.
 *   monthly_cap  — per-party monthly ceiling; parties at the cap become
 *                  EXHAUSTED until the next month. Defaults to
 *                  DIBS_EIN_MONTHLY_CAP or no cap.
 *
 * Concurrency: Base44 has no compare-and-swap, so a claim is written with a
 * random claim_token and then re-read. If another caller's token won the
 * write, this caller moves on to the next party.
 */
interface ResponsibleParty {
  name: string;
  email?: string;
  ein_used_today: boolean;
  last_used_date?: string;
  ein_count_this_month: number;
  status: "AVAILABLE" | "USED_TODAY" | "EXHAUSTED" | "INACTIVE";
  claim_token?: string;
}
type PartyRecord = Rec<ResponsibleParty>;

interface EINRequest {
  spv_id: string;
  responsible_party: string;
  responsible_party_id?: string;
  request_date?: string;
  status: "PENDING" | "ISSUED" | "FAILED" | "THROTTLED" | "MANUAL_REQUIRED";
}
type EINRequestRecord = Rec<EINRequest>;

serveFunction(async ({ base44, body }) => {
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
    const open = (await base44.entities.EINRequest.filter({
      spv_id,
      status: { $in: ["PENDING", "ISSUED"] },
    })) as EINRequestRecord[];
    if (open.length > 0) {
      const existing = open[0];
      return ok({
        already_assigned: true,
        ein_request_id: existing.id,
        ein_request_status: existing.status,
        responsible_party_id: existing.responsible_party_id,
        name: existing.responsible_party,
        message: `SPV ${spv_id} already has an open EIN request; reusing its responsible party.`,
      });
    }
  }

  await resetStaleParties(base44, today, thisMonth);

  const available = (await base44.entities.ResponsibleParty.filter({ status: "AVAILABLE" })) as PartyRecord[];
  for (const party of available) {
    const claimed = await tryClaim(base44, party, today, thisMonth, monthlyCap);
    if (!claimed) continue;

    let einRequestId: string | undefined;
    if (spv_id) {
      const request = (await base44.entities.EINRequest.create({
        spv_id,
        responsible_party: claimed.name,
        responsible_party_id: claimed.id,
        request_date: now.toISOString(),
        status: "PENDING",
      })) as EINRequestRecord;
      einRequestId = request.id;
    }

    return ok({
      already_assigned: false,
      responsible_party_id: claimed.id,
      name: claimed.name,
      email: claimed.email,
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

/** Returns USED_TODAY parties from earlier days, and EXHAUSTED parties from earlier months, to the pool. */
async function resetStaleParties(
  base44: Base44Client,
  today: string,
  thisMonth: string,
): Promise<void> {
  const stale = (await base44.entities.ResponsibleParty.filter({
    status: { $in: ["USED_TODAY", "EXHAUSTED"] },
  })) as PartyRecord[];

  for (const party of stale) {
    const lastUsed = party.last_used_date ?? "";
    const newMonth = lastUsed.slice(0, 7) < thisMonth;
    const newDay = lastUsed < today;
    if (party.status === "USED_TODAY" && newDay) {
      await base44.entities.ResponsibleParty.update(party.id, {
        status: "AVAILABLE",
        ein_used_today: false,
        ...(newMonth ? { ein_count_this_month: 0 } : {}),
      });
    } else if (party.status === "EXHAUSTED" && newMonth) {
      await base44.entities.ResponsibleParty.update(party.id, {
        status: "AVAILABLE",
        ein_used_today: false,
        ein_count_this_month: 0,
      });
    }
  }
}

/** Optimistic claim: write a token, re-read, and keep the party only if our token stuck. */
async function tryClaim(
  base44: Base44Client,
  party: PartyRecord,
  today: string,
  thisMonth: string,
  monthlyCap: number,
): Promise<PartyRecord | null> {
  const countBase = (party.last_used_date ?? "").slice(0, 7) === thisMonth ? party.ein_count_this_month ?? 0 : 0;
  const newCount = countBase + 1;
  const claimToken = crypto.randomUUID();

  await base44.entities.ResponsibleParty.update(party.id, {
    status: newCount >= monthlyCap ? "EXHAUSTED" : "USED_TODAY",
    ein_used_today: true,
    last_used_date: today,
    ein_count_this_month: newCount,
    claim_token: claimToken,
  });

  const fresh = (await base44.entities.ResponsibleParty.get(party.id)) as PartyRecord;
  if (fresh.claim_token !== claimToken) return null;
  return fresh;
}
