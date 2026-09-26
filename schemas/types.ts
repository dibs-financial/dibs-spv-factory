/**
 * Row types for the DIBS SPV Factory tables. The canonical schema is
 * supabase/migrations/20260921000000_dibs_spv_factory.sql; keep this file in
 * step with it. Enumerations come from ./constants.ts.
 */
import type { AlertSeverity, AlertType, FormationStage, FormDStatus, LedgerEventType } from "./constants.ts";

export interface ServerFields {
  id: string;
  created_at: string;
}

export interface MasterEntityRow extends ServerFields {
  legal_name: string;
  delaware_entity_id: string | null;
  formation_date: string | null;
  has_liability_notice: boolean;
  certificate_file_uri: string | null;
  certificate_of_formation_hash: string | null;
  liability_notice_verified_at: string | null;
  registered_agent_id: string | null;
  operating_agreement_version: string | null;
  amendment_count: number;
  last_amendment_date: string | null;
  status: "ACTIVE" | "AMENDMENT_PENDING" | "INACTIVE";
  updated_at: string;
}

export interface LedgerRow extends ServerFields {
  spv_id: string;
  series_id: string | null;
  event_type: LedgerEventType;
  event_data: Record<string, unknown>;
  hash: string;
  previous_hash: string;
  /** Exact ISO-8601 string used in the hash preimage. */
  event_timestamp: string;
  sequence: number;
  actor: string;
  actor_role: string | null;
  source_system: string;
  correlation_id: string | null;
}

export interface AlertRow extends ServerFields {
  spv_id: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  covenant_type: string | null;
  evidence: Record<string, unknown>;
  deal_id: string | null;
  recommended_action: string | null;
  escalated_to: string | null;
  channels_sent: string[];
  acknowledged: boolean;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

export interface ResponsiblePartyRow extends ServerFields {
  name: string;
  email: string | null;
  ein_used_today: boolean;
  /** YYYY-MM-DD on the IRS (Eastern) calendar. */
  last_used_date: string | null;
  ein_count_this_month: number;
  status: "AVAILABLE" | "USED_TODAY" | "EXHAUSTED" | "INACTIVE";
  updated_at: string;
}

export interface EINRequestRow extends ServerFields {
  spv_id: string;
  responsible_party: string;
  responsible_party_id: string | null;
  request_date: string | null;
  ein: string | null;
  status: "PENDING" | "ISSUED" | "FAILED" | "THROTTLED" | "MANUAL_REQUIRED";
  irs_confirmation_ref: string | null;
  submission_channel: "ONLINE" | "PHONE" | "FAX" | "MAIL" | null;
  submission_at: string | null;
  exception_code: string | null;
  updated_at: string;
}

export interface CapitalCallRow extends ServerFields {
  spv_id: string;
  subscription_id: string;
  investor_id: string;
  call_amount: number;
  call_date: string;
  due_date: string | null;
  wire_status: "ISSUED" | "PENDING" | "RECEIVED" | "OVERDUE" | "FAILED";
  wire_confirmation_ref: string | null;
  received_amount: number;
  received_date: string | null;
  updated_at: string;
}

export interface FormDFilingRow extends ServerFields {
  spv_id: string;
  cik: string | null;
  offering_amount: number | null;
  first_sale_date: string | null;
  filing_deadline: string | null;
  filed_date: string | null;
  edgar_accession_number: string | null;
  status: FormDStatus;
  soft_circle_at: string | null;
  subscription_sent_at: string | null;
  subscription_signed_at: string | null;
  irrevocable_commitment_at: string | null;
  funds_received_at: string | null;
  funds_cleared_at: string | null;
  updated_at: string;
}

export interface BankSubAccountRow extends ServerFields {
  spv_id: string;
  bank_partner: string | null;
  account_status: "PENDING" | "PROVISIONAL" | "ACTIVE" | "FROZEN" | "CLOSED";
  provisioned_at: string | null;
  updated_at: string;
}

export interface DocumentSetRow extends ServerFields {
  spv_id: string;
  document_type: string;
  status: "GENERATED" | "SENT_FOR_SIGNATURE" | "EXECUTED" | "EXPIRED" | "BLOCKED";
  executed_at: string | null;
  updated_at: string;
}

export interface BlueSkyFilingRow extends ServerFields {
  spv_id: string;
  jurisdiction: string;
  status: "PENDING" | "FILED" | "OVERDUE" | "NOT_REQUIRED";
  filed_date: string | null;
  updated_at: string;
}

export interface SpvPipelineRow {
  spv_id: string;
  stage: FormationStage;
  stage_before_hold: FormationStage | null;
  hold_reason: string | null;
  wait_reason: string | null;
  last_transition_at: string | null;
  last_evaluated_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PricingTier = "SPONSOR" | "FUND" | "PLATFORM";

/**
 * Shape of deal_configurations.fee_schedule. All amounts are flat fees in
 * `currency`; none is a percentage of capital raised. Defaults per tier are
 * in ./pricing.ts; rationale in docs/pricing.md.
 */
export interface FeeSchedule {
  tier: PricingTier;
  formation_fee: number;
  rush_track: boolean;
  rush_formation_fee: number;
  admin_fee_annual: number;
  onboarding_fee_per_investor: number;
  form_d_fee: number;
  blue_sky_fee_per_state: number;
  late_filing_remediation_fee: number;
  registered_series_conversion_fee: number;
  audit_package_fee: number;
  ein_manual_filing_fee: number;
  currency: "USD";
}

export type BillingChargeType =
  | "FORMATION"
  | "RUSH_FORMATION"
  | "ADMINISTRATION"
  | "ONBOARDING"
  | "FORM_D"
  | "BLUE_SKY"
  | "LATE_FILING_REMEDIATION"
  | "EIN_MANUAL_FILING"
  | "REGISTERED_SERIES_CONVERSION"
  | "AUDIT_PACKAGE"
  | "PLATFORM_LICENSE"
  | "PLATFORM_ADDITIONAL_SERIES";

export interface BillingEventRow extends ServerFields {
  /** null for platform license charges, which belong to platform_license_id instead. */
  spv_id: string | null;
  platform_license_id: string | null;
  deal_id: string | null;
  charge_type: BillingChargeType;
  tier: PricingTier;
  tier_source: "deal" | "default" | "license";
  quantity: number;
  unit_amount: number;
  amount: number;
  currency: string;
  description: string;
  source_ref: string;
  source_event_id: string | null;
  period_start: string | null;
  period_end: string | null;
  occurred_at: string;
  status: "PENDING" | "INVOICED" | "PAID" | "VOID";
  invoice_ref: string | null;
  invoiced_at: string | null;
  paid_at: string | null;
  updated_at: string;
}

export interface DealConfigurationRow extends ServerFields {
  spv_id: string;
  deal_id: string | null;
  fee_schedule: Record<string, unknown>;
  series_type: "PROTECTED" | "REGISTERED";
  /** The platform license this series runs under; counts toward its included series. */
  platform_license_id: string | null;
  updated_at: string;
}

/** A white-label / API operator's license. Price columns are locked until price_locked_until. */
export interface PlatformLicenseRow extends ServerFields {
  operator_id: string;
  operator_name: string;
  /** YYYY-MM-DD; first day of license year 0. */
  start_date: string;
  /** YYYY-MM-DD; no license year starting on or after it is billed. */
  end_date: string | null;
  annual_fee: number;
  included_series: number;
  additional_series_fee: number;
  price_locked_until: string;
  status: "ACTIVE" | "TERMINATED";
  currency: string;
  updated_at: string;
}
