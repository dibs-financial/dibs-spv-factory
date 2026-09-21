import { FORM_D_FILING_WINDOW_DAYS } from "../../../schemas/constants.ts";
import { toMillis } from "./records.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Day of the 15-day window at which the tracker starts warning. */
export const FORM_D_WARNING_DAY = 10;

export interface FormDPhase {
  daysElapsed: number;
  daysRemaining: number;
  phase: "OK" | "WARNING" | "OVERDUE";
}

/**
 * Where a PENDING filing sits in its operational window. WARNING from day 10,
 * OVERDUE once the deadline has passed. Pure; the runners map phases to
 * alerts and status changes.
 */
export function formDPhase(
  filing: { first_sale_date: string | null; filing_deadline: string | null },
  now: Date,
): FormDPhase | null {
  if (!filing.first_sale_date) return null;
  const start = toMillis(filing.first_sale_date);
  const deadline = filing.filing_deadline
    ? toMillis(filing.filing_deadline)
    : start + FORM_D_FILING_WINDOW_DAYS * DAY_MS;
  const daysElapsed = Math.floor((now.getTime() - start) / DAY_MS);
  const daysRemaining = Math.ceil((deadline - now.getTime()) / DAY_MS);
  const phase = now.getTime() > deadline ? "OVERDUE" : daysElapsed >= FORM_D_WARNING_DAY ? "WARNING" : "OK";
  return { daysElapsed, daysRemaining, phase };
}
