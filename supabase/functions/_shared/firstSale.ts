import { type CommitmentType, FORM_D_FILING_WINDOW_DAYS, type FormDStatus } from "../../../schemas/constants.ts";
import { addCalendarDays } from "./time.ts";

/** Subset of FormDFiling the first-sale clock reads and writes. */
export interface FirstSaleFiling {
  status?: FormDStatus | null;
  first_sale_date?: string | null;
  filing_deadline?: string | null;
  soft_circle_at?: string | null;
  subscription_signed_at?: string | null;
  irrevocable_commitment_at?: string | null;
  funds_received_at?: string | null;
  funds_cleared_at?: string | null;
}

type TimestampField = Exclude<keyof FirstSaleFiling, "status">;

export const TIMESTAMP_FIELD: Record<CommitmentType, TimestampField> = {
  SOFT_CIRCLE: "soft_circle_at",
  SUBSCRIPTION_SIGNED: "subscription_signed_at",
  IRREVOCABLE_COMMITMENT: "irrevocable_commitment_at",
  FUNDS_RECEIVED: "funds_received_at",
  FUNDS_CLEARED: "funds_cleared_at",
};

export interface FirstSalePlan {
  /** Fields to write to the FormDFiling record (empty when nothing changes). */
  updates: Partial<FirstSaleFiling>;
  /** True only when this call recorded the first irrevocable commitment. */
  clockStarted: boolean;
  /** True when a first sale had already been recorded before this call. */
  clockAlreadyRunning: boolean;
  firstSaleDate?: string;
  filingDeadline?: string;
}

/**
 * Pure decision logic for the Form D first-sale clock.
 *
 * Rules (README "First-sale tracking"):
 * - Only IRREVOCABLE_COMMITMENT is a first sale and starts the clock.
 * - SOFT_CIRCLE, SUBSCRIPTION_SIGNED, FUNDS_RECEIVED and FUNDS_CLEARED are
 *   recorded as timestamps and never start the clock.
 * - Each timestamp is recorded once (first occurrence wins); the clock is never
 *   restarted.
 * - The deadline is measured from the commitment time supplied by the caller,
 *   not from when this function happened to run.
 */
export function planFirstSale(
  commitmentType: CommitmentType,
  existing: FirstSaleFiling | null,
  committedAt: Date,
  now: Date = new Date(),
): FirstSalePlan {
  const iso = committedAt.toISOString();
  const field = TIMESTAMP_FIELD[commitmentType];
  const updates: Partial<FirstSaleFiling> = {};
  const clockAlreadyRunning = Boolean(existing?.irrevocable_commitment_at);

  if (!existing?.[field]) {
    updates[field] = iso;
  }

  let clockStarted = false;
  if (commitmentType === "IRREVOCABLE_COMMITMENT" && !clockAlreadyRunning) {
    clockStarted = true;
    updates.first_sale_date = iso;
    const deadline = addCalendarDays(committedAt, FORM_D_FILING_WINDOW_DAYS);
    updates.filing_deadline = deadline.toISOString();
    if (existing?.status !== "FILED") {
      // A late-recorded first sale whose window has already closed is OVERDUE now,
      // not PENDING; the deadline tracker would otherwise only catch it tomorrow.
      updates.status = deadline.getTime() < now.getTime() ? "OVERDUE" : "PENDING";
    }
  } else if (!existing) {
    // A brand-new record before any first sale: no filing obligation yet.
    updates.status = "NOT_REQUIRED";
  }

  return {
    updates,
    clockStarted,
    clockAlreadyRunning,
    firstSaleDate: clockStarted ? iso : existing?.irrevocable_commitment_at ?? undefined,
    filingDeadline: clockStarted ? updates.filing_deadline ?? undefined : existing?.filing_deadline ?? undefined,
  };
}
