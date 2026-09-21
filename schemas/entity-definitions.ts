/**
 * DIBS SPV Factory — Entity Schema Definitions
 * Canonical source of truth for all entity schemas
 * Repo: github.com/dibs-financial/dibs-spv-factory
 *
 * Enumerations are imported from ./constants.ts, which the backend functions
 * also import, so schema and validation cannot drift.
 *
 * Architecture:
 * - Zevia, the deal-model app (6a7965bf9350ccc87be63765; called "Solene" in
 *   older docs): Sponsor, Spv, Investor, Subscription, KycSession,
 *   ComplianceRecord, FormationStage
 * - Elara, the factory ops app (6a79f0df89e93212f7602b23): MasterEntity,
 *   SeriesRegistryLog, AlertLog, EINRequest, ResponsibleParty, BankSubAccount,
 *   CapitalCall, FormDFiling, BlueSkyFiling, DocumentSet, DealConfiguration
 * - Cross-app reads: Elara reads Zevia entities for monitoring; backend
 *   functions use createClientFromRequest for same-app entity access
 */

import {
  ALERT_SEVERITIES,
  ALERT_TYPES,
  CAPITAL_CALL_WIRE_STATUSES,
  EIN_REQUEST_STATUSES,
  FORM_D_STATUSES,
  FORMATION_STAGES,
  LEDGER_EVENT_TYPES,
  LEDGER_HASH_PREIMAGE,
  RESPONSIBLE_PARTY_STATUSES,
} from "./constants.ts";

// ============================================================================
// LAYER 1 — MASTER ENTITY (Elara app)
// ============================================================================
export const MasterEntity = {
  entity_name: "MasterEntity",
  app: "Elara",
  description:
    "Single Delaware Series LLC master record. Contains the § 18-215(b) statutory liability notice flag. One record should ever exist.",
  schema: {
    legal_name: { type: "string", required: true },
    delaware_entity_id: { type: "string" },
    formation_date: { type: "string", format: "date-time" },
    has_liability_notice: {
      type: "boolean",
      required: true,
      description: "§ 18-215(b) statutory notice present in Certificate of Formation",
    },
    certificate_file_uri: { type: "string" },
    amendment_count: { type: "integer", default: 0 },
    last_amendment_date: { type: "string", format: "date-time" },
    certificate_of_formation_hash: {
      type: "string",
      description: "SHA-256 of the filed certificate for integrity verification",
    },
    liability_notice_verified_at: {
      type: "string",
      format: "date-time",
      description: "When counsel last verified the § 18-215(b) notice",
    },
    registered_agent_id: { type: "string" },
    operating_agreement_version: { type: "string" },
    status: { type: "string", enum: ["ACTIVE", "AMENDMENT_PENDING", "INACTIVE"], required: true },
  },
  constraints: [
    "Exactly one ACTIVE record may exist; getActiveMasterEntity() blocks formation on zero or more than one.",
  ],
};

// ============================================================================
// LAYER 2 — SERIES REGISTRY LOG (Elara app) — Append-only, hash-chained
// ============================================================================
export const SeriesRegistryLog = {
  entity_name: "SeriesRegistryLog",
  app: "Elara",
  description:
    "Tamper-evident append-only operational event log (detective evidence). Not a substitute for the separate books, records and accounts required under 6 Del. C. § 18-215(b).",
  schema: {
    spv_id: { type: "string", required: true },
    series_id: { type: "string" },
    event_type: { type: "string", required: true, enum: LEDGER_EVENT_TYPES },
    event_data: { type: "object" },
    hash: { type: "string", required: true, description: "SHA-256 hash of this entry (see LEDGER_HASH_PREIMAGE)" },
    previous_hash: {
      type: "string",
      required: true,
      description: "Hash of prior entry, or GENESIS for the first entry",
    },
    timestamp: {
      type: "string",
      format: "date-time",
      required: true,
      description: "Exact ISO timestamp used in the hash preimage",
    },
    sequence: { type: "integer", description: "Monotonic per-SPV position; absent on legacy entries" },
    actor: { type: "string", description: "system, agent, or human reviewer" },
    actor_role: { type: "string", description: "sponsor, system, compliance_reviewer, counsel" },
    source_system: { type: "string", default: "elara" },
    correlation_id: { type: "string", description: "Correlates related events across the pipeline" },
  },
  constraints: [
    "APPEND_ONLY: no updates or deletes permitted; an escalation is cleared by appending ESCALATION_RESOLVED",
    `Hash chain: SHA-256(${LEDGER_HASH_PREIMAGE}) with '|' separators and key-sorted JSON`,
    "Concurrent appends onto the same head are detected after write and reported as LEDGER_FORK (409 + CRITICAL AlertLog)",
  ],
};

// ============================================================================
// MONITORING LAYER — Alert Log (Elara app) — Write-only for covenant monitor
// ============================================================================
export const AlertLog = {
  entity_name: "AlertLog",
  app: "Elara",
  description: "Write-only audit trail for covenant monitoring. The monitoring agent may ONLY write to this entity.",
  schema: {
    spv_id: { type: "string", required: true },
    alert_type: { type: "string", required: true, enum: ALERT_TYPES },
    severity: { type: "string", required: true, enum: ALERT_SEVERITIES },
    covenant_type: { type: "string" },
    evidence: { type: "object", description: "JSON payload with triggering data points" },
    deal_id: { type: "string" },
    recommended_action: { type: "string" },
    escalated_to: { type: "string" },
    channels_sent: { type: "array", items: { type: "string" } },
    acknowledged: { type: "boolean", default: false },
    acknowledged_at: { type: "string", format: "date-time" },
    acknowledged_by: { type: "string" },
  },
};

// ============================================================================
// LAYER 2/4 — EIN Request & Responsible Party Pool (Elara app)
// ============================================================================
export const EINRequest = {
  entity_name: "EINRequest",
  app: "Elara",
  description: "Tracks IRS SS-4 EIN filing requests per SPV with responsible-party rotation.",
  schema: {
    spv_id: { type: "string", required: true },
    responsible_party: { type: "string", required: true },
    responsible_party_id: { type: "string" },
    request_date: { type: "string", format: "date-time" },
    ein: { type: "string" },
    status: { type: "string", required: true, enum: EIN_REQUEST_STATUSES },
    irs_confirmation_ref: { type: "string" },
    ss4_payload_version: { type: "string" },
    submission_channel: { type: "string", enum: ["ONLINE", "PHONE", "FAX", "MAIL"] },
    submission_at: { type: "string", format: "date-time" },
    exception_code: { type: "string", description: "Specific exception for FAILED/THROTTLED status" },
  },
  constraints: ["getNextResponsibleParty(spv_id) is idempotent against an open (PENDING/ISSUED) request for the SPV"],
};

export const ResponsibleParty = {
  entity_name: "ResponsibleParty",
  app: "Elara",
  description: "Pooled signatories for EIN requests. IRS throttles at 1 EIN per responsible party per day.",
  schema: {
    name: { type: "string", required: true },
    email: { type: "string" },
    ein_used_today: { type: "boolean", default: false },
    last_used_date: { type: "string", format: "date" },
    ein_count_this_month: {
      type: "integer",
      default: 0,
      description: "Reset when the IRS (Eastern) calendar month changes",
    },
    status: { type: "string", required: true, enum: RESPONSIBLE_PARTY_STATUSES },
    claim_token: {
      type: "string",
      description: "Random token written on claim and re-read to detect a concurrent claimer",
    },
  },
  constraints: [
    "Daily limit is measured on the America/New_York calendar day",
    "EXHAUSTED is reached at DIBS_EIN_MONTHLY_CAP and clears on the next month",
  ],
};

// ============================================================================
// LAYER 3 — Financial Segregation (Elara app)
// ============================================================================
export const BankSubAccount = {
  entity_name: "BankSubAccount",
  app: "Elara",
  description: "Per-series segregated bank sub-accounts via partner bank sweep network.",
  schema: {
    spv_id: { type: "string", required: true },
    bank_partner: { type: "string" },
    account_number_masked: { type: "string", description: "Last 4 digits only" },
    routing_number: { type: "string" },
    account_status: { type: "string", required: true, enum: ["PENDING", "PROVISIONAL", "ACTIVE", "FROZEN", "CLOSED"] },
    fdic_insured: { type: "boolean", default: true },
    sweep_network_id: { type: "string" },
    provisioned_at: { type: "string", format: "date-time" },
    current_balance: { type: "number", default: 0 },
    currency: { type: "string", default: "USD" },
  },
  constraints: ["RLS enabled: keyed on spv_id for series isolation"],
};

export const CapitalCall = {
  entity_name: "CapitalCall",
  app: "Elara",
  description: "Wire instructions and confirmation tracking per investor per SPV.",
  schema: {
    spv_id: { type: "string", required: true },
    subscription_id: { type: "string" },
    investor_id: { type: "string" },
    call_amount: { type: "number", required: true },
    call_date: { type: "string", format: "date-time" },
    due_date: { type: "string", format: "date-time" },
    wire_status: { type: "string", required: true, enum: CAPITAL_CALL_WIRE_STATUSES },
    wire_confirmation_ref: { type: "string" },
    received_amount: { type: "number" },
    received_date: { type: "string", format: "date-time" },
  },
  constraints: ["Unique per (spv_id, investor_id, subscription_id)", "call_amount is rounded to cents"],
};

// ============================================================================
// LAYER 4 — Compliance & Filing (Elara app)
// ============================================================================
export const FormDFiling = {
  entity_name: "FormDFiling",
  app: "Elara",
  description:
    "SEC EDGAR Form D filing tracking with the operational 15-calendar-day deadline countdown (not counsel's Rule 503 calendar).",
  schema: {
    spv_id: { type: "string", required: true },
    cik: { type: "string", description: "SEC EDGAR Central Index Key" },
    offering_amount: { type: "number" },
    first_sale_date: { type: "string", format: "date-time", description: "Equals irrevocable_commitment_at" },
    filing_deadline: { type: "string", format: "date-time", description: "first_sale_date + 15 calendar days" },
    filed_date: { type: "string", format: "date-time" },
    edgar_accession_number: { type: "string" },
    status: { type: "string", required: true, enum: FORM_D_STATUSES },
    soft_circle_at: { type: "string", format: "date-time", description: "NOT a first sale" },
    subscription_sent_at: { type: "string", format: "date-time" },
    subscription_signed_at: { type: "string", format: "date-time", description: "NOT a first sale" },
    irrevocable_commitment_at: {
      type: "string",
      format: "date-time",
      description: "First irrevocable contractual commitment; the only event that starts the clock",
    },
    funds_received_at: { type: "string", format: "date-time", description: "NOT a first sale" },
    funds_cleared_at: { type: "string", format: "date-time" },
  },
  constraints: [
    "One record per spv_id; if duplicates exist the oldest is canonical",
    "Each timestamp is written once; the clock is never restarted",
  ],
};

export const BlueSkyFiling = {
  entity_name: "BlueSkyFiling",
  app: "Elara",
  description: "State blue sky notice filings keyed to investor jurisdiction.",
  schema: {
    spv_id: { type: "string", required: true },
    jurisdiction: { type: "string", required: true, description: "Investor state of residence" },
    investor_id: { type: "string" },
    filing_type: { type: "string" },
    status: { type: "string", required: true, enum: ["PENDING", "FILED", "OVERDUE", "NOT_REQUIRED"] },
    filed_date: { type: "string", format: "date-time" },
    fee_amount: { type: "number" },
  },
};

// ============================================================================
// LAYER 5 — Document Management (Elara app)
// ============================================================================
export const DocumentSet = {
  entity_name: "DocumentSet",
  app: "Elara",
  description: "Hash-committed document versioning for audit defense and registered-series conversion.",
  schema: {
    spv_id: { type: "string", required: true },
    document_type: {
      type: "string",
      required: true,
      enum: [
        "SERIES_SCHEDULE",
        "SUBSCRIPTION_AGREEMENT",
        "AMENDMENT",
        "CERTIFICATE",
        "SIDE_LETTER",
        "INVESTOR_QUESTIONNAIRE",
        "ACCREDITATION_PACKAGE",
        "RISK_DISCLOSURE",
        "FEE_WATERFALL_SCHEDULE",
        "CAPITAL_CALL_NOTICE",
        "SIGNATURE_PACKET",
        "COMPLIANCE_FILING",
      ],
    },
    template_id: { type: "string", description: "Reference to template registry" },
    template_version: { type: "string" },
    generated_hash: { type: "string", description: "SHA-256 of generated document" },
    storage_uri: { type: "string" },
    status: {
      type: "string",
      required: true,
      enum: ["GENERATED", "SENT_FOR_SIGNATURE", "EXECUTED", "EXPIRED", "BLOCKED"],
    },
    executed_at: { type: "string", format: "date-time" },
    structure_type: { type: "string", enum: ["SINGLE_ASSET", "ROLLING_FUND", "MULTI_CLOSE"] },
    formation_event_id: { type: "string", description: "SeriesRegistryLog entry id" },
    external_reference: { type: "string", description: "E-signature or filing-system reference" },
  },
};

export const DealConfiguration = {
  entity_name: "DealConfiguration",
  app: "Elara",
  description: "Offering configuration per SPV: exemption, investor type, economics and closing conditions.",
  schema: {
    spv_id: { type: "string", required: true },
    deal_id: { type: "string" },
    sponsor_id: { type: "string" },
    asset_type: { type: "string" },
    asset_location: { type: "string" },
    purchase_price: { type: "number" },
    target_raise: { type: "number" },
    minimum_raise: { type: "number" },
    maximum_raise: { type: "number" },
    offering_exemption: { type: "string" },
    investor_type: { type: "string" },
    fee_schedule: { type: "object" },
    waterfall_configuration: { type: "object" },
    closing_conditions: { type: "object" },
    structure_type: { type: "string", enum: ["SINGLE_ASSET", "ROLLING_FUND", "MULTI_CLOSE"] },
    series_type: { type: "string", enum: ["PROTECTED", "REGISTERED"], default: "PROTECTED" },
    close_target_date: { type: "string", format: "date-time" },
    status: { type: "string" },
  },
};

// ============================================================================
// EXISTING ENTITIES (Zevia deal-model app) — Updates pending via builder
// ============================================================================
export const SpvUpdates = {
  entity_name: "Spv",
  app: "Zevia",
  description: "NEW FIELDS to add to existing Spv entity for factory operations.",
  new_fields: {
    series_type: { type: "string", enum: ["PROTECTED", "REGISTERED"], default: "PROTECTED" },
    registered_series_filing_status: { type: "string", enum: ["N/A", "PENDING", "FILED", "REJECTED"], default: "N/A" },
    registered_series_filing_date: { type: "string", format: "date-time" },
    asset_account_pointer: { type: "string" },
    ledger_hash: { type: "string" },
    previous_hash: { type: "string" },
    formation_timeline_status: { type: "string", enum: FORMATION_STAGES },
    first_sale_date: { type: "string", format: "date-time" },
    form_d_filed_date: { type: "string", format: "date-time" },
    form_d_status: { type: "string", enum: ["NOT_REQUIRED", "PENDING", "FILED", "OVERDUE"], default: "NOT_REQUIRED" },
    blue_sky_status: { type: "string", enum: ["NOT_REQUIRED", "PENDING", "FILED", "OVERDUE"], default: "NOT_REQUIRED" },
    responsible_party_used: { type: "string" },
    bank_subaccount_id: { type: "string" },
    bank_subaccount_status: { type: "string", enum: ["PENDING", "PROVISIONAL", "ACTIVE", "FAILED"] },
  },
};

export const InvestorUpdates = {
  entity_name: "Investor",
  app: "Zevia",
  description: "NEW FIELDS to add to existing Investor entity for compliance tracking.",
  new_fields: {
    ofac_screening_status: { type: "string", enum: ["PENDING", "CLEAR", "FLAGGED", "BLOCKED"], default: "PENDING" },
    ofac_screening_date: { type: "string", format: "date-time" },
    e_signature_status: {
      type: "string",
      enum: ["NOT_SENT", "PENDING", "SIGNED", "EXPIRED", "DECLINED"],
      default: "NOT_SENT",
    },
    e_signature_doc_ref: { type: "string" },
  },
};

// ============================================================================
// BACKEND FUNCTIONS (Elara app)
// ============================================================================
export const BackendFunctions = {
  checkMasterEntityLiabilityNotice: {
    description:
      "Statutory kill-switch. Resolves the single ACTIVE MasterEntity and reports has_liability_notice. 422 on zero or multiple ACTIVE masters.",
    source: "functions/checkMasterEntityLiabilityNotice.ts",
    deployed: true,
    url: "https://elara-f7602b23.base44.app/functions/checkMasterEntityLiabilityNotice",
  },
  checkFormationGate: {
    description:
      "Pre-flight gate for every stage transition: statutory gate plus unresolved-escalation check (ESCALATION newer than ESCALATION_RESOLVED).",
    source: "functions/checkFormationGate.ts",
  },
  createSeriesLedgerEntry: {
    description:
      "Hash-chained append to SeriesRegistryLog with sequence numbers and post-write fork detection (409 LEDGER_FORK).",
    source: "functions/createSeriesLedgerEntry.ts",
    deployed: true,
    url: "https://elara-f7602b23.base44.app/functions/createSeriesLedgerEntry",
  },
  verifySeriesLedger: {
    description: "Read-only chain verification: recomputes every hash and previous_hash link for one SPV.",
    source: "functions/verifySeriesLedger.ts",
  },
  logAlert: {
    description:
      "Write-only AlertLog creator for covenant monitoring. Validates alert_type and severity. The ONLY write path for the monitoring agent.",
    source: "functions/logAlert.ts",
    deployed: true,
    url: "https://elara-f7602b23.base44.app/functions/logAlert",
  },
  getNextResponsibleParty: {
    description:
      "IRS SS-4 responsible-party rotation on the Eastern calendar day, with optimistic claim tokens and per-SPV idempotency via EINRequest.",
    source: "functions/getNextResponsibleParty.ts",
  },
  processCapitalCall: {
    description:
      "Creates CapitalCall records (cents-rounded) for a caller-supplied investor list; idempotent per subscription; appends CAPITAL_CALL_ISSUED.",
    source: "functions/processCapitalCall.ts",
  },
  triggerFirstSaleClock: {
    description:
      "Records commitment milestones on FormDFiling. Only IRREVOCABLE_COMMITMENT starts the 15-day clock; appends FIRST_SALE_RECORDED.",
    source: "functions/triggerFirstSaleClock.ts",
  },
  _authorization:
    "Every function requires a Base44 service token or a user whose role is in DIBS_FUNCTION_ALLOWED_ROLES (default: admin). See functions/_shared/http.ts.",
};

// ============================================================================
// WORKFLOWS
// ============================================================================
export const Workflows = {
  "DIBS Covenant Monitor": {
    trigger: "scheduled, every hour (0 * * * *)",
    description:
      "Hourly covenant monitoring across all active SPVs. Reads cross-app from Zevia, checks LTV/milestones/KYC/OFAC/Form D. Logs to AlertLog.",
    active: true,
  },
  "Form D Deadline Tracker": {
    trigger: "scheduled, daily 8am UTC (0 8 * * *)",
    description: "Daily operational Form D 15-calendar-day deadline countdown. Alerts at day 10, escalates at day 15.",
    active: true,
  },
  "SPV Formation Pipeline": {
    trigger: "scheduled, every 15 minutes (*/15 * * * *)",
    description:
      "Reads pending SPVs from Zevia and advances them through the 14-stage formation pipeline behind checkFormationGate.",
    active: true,
  },
  "Investor Onboarding Monitor": {
    trigger: "scheduled, every hour (0 * * * *)",
    description: "KYC/AML escalation, capital-call processing, first-sale clock and Form D deadline monitoring.",
    active: true,
  },
};
