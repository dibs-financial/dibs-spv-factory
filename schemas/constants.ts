/**
 * DIBS SPV Factory — Shared enumerations and constants.
 *
 * Single source of truth for every enum that appears both in the entity
 * schemas (schemas/entity-definitions.ts) and in backend function validation
 * (functions/*.ts). Do not duplicate these lists elsewhere.
 */

export const LEDGER_EVENT_TYPES = [
  "SERIES_CREATED",
  "EIN_REQUESTED",
  "EIN_RECEIVED",
  "BANK_PROVISIONED",
  "DOCS_GENERATED",
  "DOCS_EXECUTED",
  "KYC_BATCH_STARTED",
  "KYC_PASS",
  "KYC_FAIL",
  "CAPITAL_CALL_ISSUED",
  "CAPITAL_RECEIVED",
  "FORM_D_FILED",
  "BLUE_SKY_FILED",
  "STATE_CHANGE",
  "ESCALATION",
  "ESCALATION_RESOLVED",
  "INVESTOR_INVITED",
  "SUBSCRIPTION_SENT",
  "SUBSCRIPTION_EXECUTED",
  "FIRST_SALE_RECORDED",
  "AMENDMENT",
  "WIND_DOWN",
] as const;
export type LedgerEventType = (typeof LEDGER_EVENT_TYPES)[number];

export const ALERT_TYPES = [
  "LTV_BREACH",
  "MILESTONE_OVERDUE",
  "KYC_EXCEPTION",
  "OFAC_FLAG",
  "FORM_D_OVERDUE",
  "BLUE_SKY_OVERDUE",
  "EIN_FAILURE",
  "WIRE_FAILURE",
  "LEDGER_FORK",
  "COMPLIANCE_CHECK_PASS",
  "ESCALATION",
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_SEVERITIES = ["INFO", "WARNING", "CRITICAL"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

/**
 * Commitment events reported to the first-sale clock. Only
 * IRREVOCABLE_COMMITMENT is a "first sale" for Form D purposes. The others are
 * recorded as timestamps and never start the clock.
 */
export const COMMITMENT_TYPES = [
  "IRREVOCABLE_COMMITMENT",
  "SOFT_CIRCLE",
  "SUBSCRIPTION_SIGNED",
  "FUNDS_RECEIVED",
  "FUNDS_CLEARED",
] as const;
export type CommitmentType = (typeof COMMITMENT_TYPES)[number];

export const FORM_D_STATUSES = [
  "NOT_REQUIRED",
  "PENDING",
  "FILED",
  "OVERDUE",
  "REJECTED",
] as const;
export type FormDStatus = (typeof FORM_D_STATUSES)[number];

/** Ordered formation pipeline stages, followed by the out-of-band hold states. */
export const FORMATION_PIPELINE_STAGES = [
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
export const FORMATION_HOLD_STAGES = [
  "BLOCKED",
  "EIN_PENDING_MANUAL",
  "PENDING_STATE_FILING",
] as const;
export const FORMATION_STAGES = [
  ...FORMATION_PIPELINE_STAGES,
  ...FORMATION_HOLD_STAGES,
] as const;
export type FormationStage = (typeof FORMATION_STAGES)[number];

export const RESPONSIBLE_PARTY_STATUSES = [
  "AVAILABLE",
  "USED_TODAY",
  "EXHAUSTED",
  "INACTIVE",
] as const;
export const EIN_REQUEST_STATUSES = [
  "PENDING",
  "ISSUED",
  "FAILED",
  "THROTTLED",
  "MANUAL_REQUIRED",
] as const;
export const CAPITAL_CALL_WIRE_STATUSES = [
  "ISSUED",
  "PENDING",
  "RECEIVED",
  "OVERDUE",
  "FAILED",
] as const;

/**
 * Operational Form D clock: first sale + 15 calendar days. This is the
 * internal deadline used for alerting. It is not counsel's Rule 503 calendar.
 */
export const FORM_D_FILING_WINDOW_DAYS = 15;

/** The IRS online SS-4 daily limit is measured on the IRS's (Eastern) calendar day. */
export const IRS_TIME_ZONE = "America/New_York";

/** previous_hash of the first entry in every SPV's ledger chain. */
export const LEDGER_GENESIS_HASH = "GENESIS";

/**
 * Exact preimage of a SeriesRegistryLog hash. Auditors recompute:
 *   SHA-256( previous_hash + "|" + spv_id + "|" + event_type + "|" + timestamp + "|" + canonical_json(event_data) )
 * where canonical_json serialises objects with keys sorted lexicographically at
 * every depth (see functions/_shared/hash.ts).
 */
export const LEDGER_HASH_PREIMAGE = "previous_hash|spv_id|event_type|timestamp|canonical_json(event_data)";

export function isOneOf<T extends readonly string[]>(
  list: T,
  value: unknown,
): value is T[number] {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}
