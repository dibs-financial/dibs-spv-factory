/**
 * Pure rules that turn factory rows into what the console shows. No I/O
 * here, so every rule is unit-tested (factory.test.ts). The stage lists and
 * the signatory rule mirror schemas/constants.ts and the rush-track
 * migration; keep them in sync.
 */
export type Tone = "success" | "info" | "warning" | "critical" | "neutral";

export const PIPELINE_STAGES = [
  "INTAKE",
  "SERIES_CREATED",
  "EIN_PENDING",
  "EIN_RECEIVED",
  "BANK_PENDING",
  "BANK_READY",
  "DOCS_PENDING",
  "DOCS_EXECUTED",
  "KYC_BATCH_PENDING",
  "KYC_COMPLETE",
  "CAPITAL_CALL_PENDING",
  "CAPITAL_RECEIVED",
  "REGULATORY_PENDING",
  "INVESTOR_READY",
] as const;
export const HOLD_STAGES = ["BLOCKED", "EIN_PENDING_MANUAL", "PENDING_STATE_FILING"] as const;
export const PIPELINE_STAGE_COUNT = PIPELINE_STAGES.length;
/** RUSH_TRACK_MIN_AVAILABLE_SIGNATORIES in schemas/pricing.ts. */
export const RUSH_TRACK_MIN_AVAILABLE_SIGNATORIES = 3;
/** FORM_D warning window shown on the overview, in days. */
export const FORM_D_SOON_DAYS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 1-based position in the 14 pipeline stages; a hold shows where the series stopped. */
export function stageStep(stage: string, stageBeforeHold: string | null | undefined): number {
  const at = (s: string) => (PIPELINE_STAGES as readonly string[]).indexOf(s) + 1;
  if (at(stage) > 0) return at(stage);
  if (stage === "EIN_PENDING_MANUAL") return at("EIN_PENDING");
  return stageBeforeHold && at(stageBeforeHold) > 0 ? at(stageBeforeHold) : 1;
}

export function stageTone(stage: string): Tone {
  if (stage === "INVESTOR_READY") return "success";
  if (stage === "BLOCKED") return "critical";
  if ((HOLD_STAGES as readonly string[]).includes(stage)) return "warning";
  return "info";
}

/** The status cell: why a series is where it is. */
export function pipelineStatus(row: {
  stage: string;
  hold_reason?: string | null;
  wait_reason?: string | null;
}): { text: string; tone: Tone } {
  if (row.stage === "BLOCKED") return { text: `Blocked · ${row.hold_reason ?? "gate failed"}`, tone: "critical" };
  if ((HOLD_STAGES as readonly string[]).includes(row.stage)) {
    return { text: `Held · ${row.hold_reason ?? row.stage.toLowerCase().replace(/_/g, " ")}`, tone: "warning" };
  }
  if (row.stage === "INVESTOR_READY") return { text: "Complete", tone: "success" };
  if (row.wait_reason) return { text: `Waiting · ${row.wait_reason}`, tone: "neutral" };
  return { text: "On track", tone: "success" };
}

/** Holds first (blocked before held), then the most recently moved. */
export function pipelineOrder(a: { stage: string; movedAt: number }, b: { stage: string; movedAt: number }): number {
  const rank = (s: string) => (s === "BLOCKED" ? 0 : (HOLD_STAGES as readonly string[]).includes(s) ? 1 : 2);
  return rank(a.stage) - rank(b.stage) || b.movedAt - a.movedAt;
}

export function ageLabel(iso: string | null | undefined, now: Date): string {
  if (!iso) return "—";
  const ms = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < DAY_MS) return `${Math.max(1, Math.floor(ms / 3_600_000))}h`;
  return `${Math.floor(ms / DAY_MS)}d`;
}

/** The IRS calendar day (America/New_York) as YYYY-MM-DD. */
export function easternDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Signatories able to sign an SS-4 today. Same rule as the database's
 * rush_track_available_signatories() and getNextResponsibleParty's lazy
 * reset: AVAILABLE, USED_TODAY from an earlier IRS day, EXHAUSTED from an
 * earlier IRS month. INACTIVE parties are not in the pool at all.
 */
export function signatoryPool(
  parties: { status: string; last_used_date: string | null }[],
  now: Date,
): { available: number; total: number } {
  const today = easternDate(now);
  const month = today.slice(0, 7);
  let available = 0;
  let total = 0;
  for (const p of parties) {
    if (p.status === "INACTIVE") continue;
    total += 1;
    const last = p.last_used_date ?? "";
    if (
      p.status === "AVAILABLE" ||
      (p.status === "USED_TODAY" && last < today) ||
      (p.status === "EXHAUSTED" && last.slice(0, 7) < month)
    ) available += 1;
  }
  return { available, total };
}

export function severityTone(severity: string): Tone {
  return severity === "CRITICAL" ? "critical" : severity === "WARNING" ? "warning" : "info";
}

const ALERT_TITLES: Record<string, string> = {
  LTV_BREACH: "LTV breach",
  MILESTONE_OVERDUE: "Milestone overdue",
  KYC_EXCEPTION: "KYC exception",
  OFAC_FLAG: "OFAC flag",
  FORM_D_OVERDUE: "Form D overdue",
  BLUE_SKY_OVERDUE: "Blue-sky notice overdue",
  EIN_FAILURE: "EIN failure",
  WIRE_FAILURE: "Wire failure",
  LEDGER_FORK: "Ledger fork",
  COMPLIANCE_CHECK_PASS: "Compliance check passed",
  ESCALATION: "Escalation",
};

export function alertTitle(alertType: string, spvId: string): string {
  return `${ALERT_TITLES[alertType] ?? alertType.toLowerCase().replace(/_/g, " ")} · ${spvId}`;
}

/** Critical first, then warning, then info; newest first within a severity. */
export function alertOrder(
  a: { severity: string; created_at: string },
  b: { severity: string; created_at: string },
): number {
  const rank = (s: string) => (s === "CRITICAL" ? 0 : s === "WARNING" ? 1 : 2);
  return rank(a.severity) - rank(b.severity) || b.created_at.localeCompare(a.created_at);
}

export function isRushTrack(feeSchedule: unknown): boolean {
  return typeof feeSchedule === "object" && feeSchedule !== null &&
    (feeSchedule as Record<string, unknown>).rush_track === true;
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    amount,
  );
}

/** First instant of the current UTC month, for "this month" counts. */
export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function shortHash(hash: string): string {
  return hash.length > 10 ? `${hash.slice(0, 4)}…${hash.slice(-4)}` : hash;
}
