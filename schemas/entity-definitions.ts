/**
 * DIBS SPV Factory — Entity Schema Definitions
 * Canonical source of truth for all entity schemas
 * Repo: github.com/dibs-financial/dibs-spv-factory
 * 
 * Architecture:
 * - Solene app (6a7965bf9350ccc87be63765): Original deal entities (Sponsor, Spv, Investor, 
 *   Subscription, KycSession, ComplianceRecord, FormationStage)
 * - Elara app (6a79f0df89e93212f7602b23): Factory operational entities (MasterEntity, 
 *   SeriesRegistryLog, AlertLog, EINRequest, ResponsibleParty, BankSubAccount, CapitalCall, 
 *   FormDFiling, BlueSkyFiling, DocumentSet)
 * - Cross-app reads: Elara reads Solene entities for monitoring; backend functions
 *   use createClientFromRequest for same-app entity access
 */

// ============================================================================
// LAYER 1 — MASTER ENTITY (Elara app)
// ============================================================================
export const MasterEntity = {
  entity_name: "MasterEntity",
  app: "Elara",
  description: "Single Delaware Series LLC master record. Contains the § 18-215(b) statutory liability notice flag. One record should ever exist.",
  schema: {
    legal_name: { type: "string", required: true },
    delaware_entity_id: { type: "string" },
    formation_date: { type: "string", format: "date-time" },
    has_liability_notice: { type: "boolean", required: true, description: "§ 18-215(b) statutory notice present in Certificate of Formation" },
    certificate_file_uri: { type: "string" },
    amendment_count: { type: "integer", default: 0 },
    last_amendment_date: { type: "string", format: "date-time" },
    status: { type: "string", enum: ["ACTIVE", "AMENDMENT_PENDING", "INACTIVE"], required: true }
  }
};

// ============================================================================
// LAYER 2 — SERIES REGISTRY LOG (Elara app) — Append-only, hash-chained
// ============================================================================
export const SeriesRegistryLog = {
  entity_name: "SeriesRegistryLog",
  app: "Elara",
  description: "Tamper-evident append-only event log. Legal record substitute for protected series under § 18-215(b).",
  schema: {
    spv_id: { type: "string", required: true },
    series_id: { type: "string" },
    event_type: { type: "string", required: true, enum: [
      "SERIES_CREATED", "EIN_REQUESTED", "EIN_RECEIVED", "BANK_PROVISIONED",
      "DOCS_GENERATED", "DOCS_EXECUTED", "KYC_BATCH_STARTED", "KYC_PASS",
      "KYC_FAIL", "CAPITAL_CALL_ISSUED", "CAPITAL_RECEIVED",
      "FORM_D_FILED", "BLUE_SKY_FILED", "STATE_CHANGE", "ESCALATION"
    ]},
    event_data: { type: "object" },
    hash: { type: "string", required: true, description: "SHA-256 hash of this entry" },
    previous_hash: { type: "string", description: "Hash of prior entry" },
    actor: { type: "string", description: "system, agent, or human reviewer" }
  },
  constraints: ["APPEND_ONLY: no updates or deletes permitted", "Hash chain: SHA-256(previous_hash + spv_id + event_type + timestamp + event_data_json)"]
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
    alert_type: { type: "string", required: true, enum: [
      "LTV_BREACH", "MILESTONE_OVERDUE", "KYC_EXCEPTION", "OFAC_FLAG",
      "FORM_D_OVERDUE", "BLUE_SKY_OVERDUE", "EIN_FAILURE", "WIRE_FAILURE",
      "COMPLIANCE_CHECK_PASS", "ESCALATION"
    ]},
    severity: { type: "string", required: true, enum: ["INFO", "WARNING", "CRITICAL"] },
    covenant_type: { type: "string" },
    evidence: { type: "object", description: "JSON payload with triggering data points" },
    deal_id: { type: "string" },
    recommended_action: { type: "string" },
    escalated_to: { type: "string" },
    channels_sent: { type: "array", items: { type: "string" } },
    acknowledged: { type: "boolean", default: false },
    acknowledged_at: { type: "string", format: "date-time" },
    acknowledged_by: { type: "string" }
  }
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
    status: { type: "string", required: true, enum: ["PENDING", "ISSUED", "FAILED", "THROTTLED", "MANUAL_REQUIRED"] },
    irs_confirmation_ref: { type: "string" }
  }
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
    ein_count_this_month: { type: "integer", default: 0 },
    status: { type: "string", required: true, enum: ["AVAILABLE", "USED_TODAY", "EXHAUSTED", "INACTIVE"] }
  }
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
    currency: { type: "string", default: "USD" }
  },
  constraints: ["RLS enabled: keyed on spv_id for series isolation"]
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
    wire_status: { type: "string", required: true, enum: ["ISSUED", "PENDING", "RECEIVED", "OVERDUE", "FAILED"] },
    wire_confirmation_ref: { type: "string" },
    received_amount: { type: "number" },
    received_date: { type: "string", format: "date-time" }
  }
};

// ============================================================================
// LAYER 4 — Compliance & Filing (Elara app)
// ============================================================================
export const FormDFiling = {
  entity_name: "FormDFiling",
  app: "Elara",
  description: "SEC EDGAR Form D filing tracking with 15-day statutory deadline countdown.",
  schema: {
    spv_id: { type: "string", required: true },
    cik: { type: "string", description: "SEC EDGAR Central Index Key" },
    offering_amount: { type: "number" },
    first_sale_date: { type: "string", format: "date-time" },
    filing_deadline: { type: "string", format: "date-time", description: "first_sale_date + 15 days" },
    filed_date: { type: "string", format: "date-time" },
    edgar_accession_number: { type: "string" },
    status: { type: "string", required: true, enum: ["NOT_REQUIRED", "PENDING", "FILED", "OVERDUE", "REJECTED"] }
  }
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
    fee_amount: { type: "number" }
  }
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
    document_type: { type: "string", required: true, enum: ["SERIES_SCHEDULE", "SUBSCRIPTION_AGREEMENT", "AMENDMENT", "CERTIFICATE", "SIDE_LETTER"] },
    template_version: { type: "string" },
    generated_hash: { type: "string", description: "SHA-256 of generated document" },
    storage_uri: { type: "string" },
    status: { type: "string", required: true, enum: ["GENERATED", "SENT_FOR_SIGNATURE", "EXECUTED", "EXPIRED"] },
    executed_at: { type: "string", format: "date-time" },
    structure_type: { type: "string", enum: ["SINGLE_ASSET", "ROLLING_FUND", "MULTI_CLOSE"] }
  }
};

// ============================================================================
// EXISTING ENTITIES (Solene app) — Updates pending via builder
// ============================================================================
export const SpvUpdates = {
  entity_name: "Spv",
  app: "Solene",
  description: "NEW FIELDS to add to existing Spv entity for factory operations.",
  new_fields: {
    series_type: { type: "string", enum: ["PROTECTED", "REGISTERED"], default: "PROTECTED" },
    registered_series_filing_status: { type: "string", enum: ["N/A", "PENDING", "FILED", "REJECTED"], default: "N/A" },
    registered_series_filing_date: { type: "string", format: "date-time" },
    asset_account_pointer: { type: "string" },
    ledger_hash: { type: "string" },
    previous_hash: { type: "string" },
    formation_timeline_status: { type: "string", enum: [
      "INTAKE", "SERIES_CREATED", "EIN_PENDING", "EIN_RECEIVED",
      "BANK_PENDING", "BANK_READY", "DOCS_PENDING", "DOCS_EXECUTED",
      "KYC_BATCH_PENDING", "KYC_COMPLETE", "CAPITAL_CALL_PENDING",
      "CAPITAL_RECEIVED", "REGULATORY_PENDING", "INVESTOR_READY",
      "BLOCKED", "EIN_PENDING_MANUAL", "PENDING_STATE_FILING"
    ]},
    first_sale_date: { type: "string", format: "date-time" },
    form_d_filed_date: { type: "string", format: "date-time" },
    form_d_status: { type: "string", enum: ["NOT_REQUIRED", "PENDING", "FILED", "OVERDUE"], default: "NOT_REQUIRED" },
    blue_sky_status: { type: "string", enum: ["NOT_REQUIRED", "PENDING", "FILED", "OVERDUE"], default: "NOT_REQUIRED" },
    responsible_party_used: { type: "string" },
    bank_subaccount_id: { type: "string" },
    bank_subaccount_status: { type: "string", enum: ["PENDING", "PROVISIONAL", "ACTIVE", "FAILED"] }
  }
};

export const InvestorUpdates = {
  entity_name: "Investor",
  app: "Solene",
  description: "NEW FIELDS to add to existing Investor entity for compliance tracking.",
  new_fields: {
    ofac_screening_status: { type: "string", enum: ["PENDING", "CLEAR", "FLAGGED", "BLOCKED"], default: "PENDING" },
    ofac_screening_date: { type: "string", format: "date-time" },
    e_signature_status: { type: "string", enum: ["NOT_SENT", "PENDING", "SIGNED", "EXPIRED", "DECLINED"], default: "NOT_SENT" },
    e_signature_doc_ref: { type: "string" }
  }
};

// ============================================================================
// BACKEND FUNCTIONS (Elara app)
// ============================================================================
export const BackendFunctions = {
  checkMasterEntityLiabilityNotice: {
    description: "Statutory kill-switch. Checks MasterEntity.has_liability_notice. Returns 200 if true, 422 if false or missing.",
    deployed: true,
    url: "https://elara-f7602b23.base44.app/functions/checkMasterEntityLiabilityNotice"
  },
  createSeriesLedgerEntry: {
    description: "Hash-chained append to SeriesRegistryLog. Computes SHA-256(previous_hash + spv_id + event_type + timestamp + event_data).",
    deployed: true,
    url: "https://elara-f7602b23.base44.app/functions/createSeriesLedgerEntry"
  },
  logAlert: {
    description: "Write-only AlertLog creator for covenant monitoring. Validates alert_type and severity. The ONLY write path for the monitoring agent.",
    deployed: true,
    url: "https://elara-f7602b23.base44.app/functions/logAlert"
  }
};

// ============================================================================
// WORKFLOWS
// ============================================================================
export const Workflows = {
  "DIBS Covenant Monitor": {
    trigger: "scheduled, every hour (0 * * * *)",
    description: "Hourly covenant monitoring across all active SPVs. Reads cross-app from Solene, checks LTV/milestones/KYC/OFAC/Form D. Logs to AlertLog.",
    active: true
  },
  "Form D Deadline Tracker": {
    trigger: "scheduled, daily 8am UTC (0 8 * * *)",
    description: "Daily Form D 15-day statutory deadline countdown. Alerts at day 10, escalates at day 15.",
    active: true
  }
};
