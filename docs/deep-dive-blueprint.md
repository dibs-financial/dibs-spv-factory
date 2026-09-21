> **Historical document.** Written for the original Base44 build. The platform is now Lovable Cloud (Supabase); the canonical schema is `supabase/migrations/` and the functions are under `supabase/functions/`. Entity and app names below refer to the Base44 layout.

# DIBS SPV Factory — Implementation Gap Analysis & Technical Deep-Dive

## 1. Current State Inventory

### Solene App (6a7965bf9350ccc87be63765)
The deal/SPV data model. All entities exist but are empty (no live deals yet).

| Entity | Fields | Blueprint Layer | Coverage |
|---|---|---|---|
| Sponsor | company, email, name, phone, status | Layer 1 (Sponsor side) | ✅ Adequate |
| Spv | compliance, deal_type, deal_terms, ein, ein_status, estimated_completion, formation_date, jurisdiction, legal_name, min_investment, qo_business_status, series_id, sponsor_id, status, target_raise | Layer 2 (Series Ledger) | ⚠️ Partial — missing series_type, asset_account_pointer, registered_series_filing_status, hash_chain_ref |
| Investor | accredited_status, email, jurisdiction, kyc_status, name, wallet_address | Layer 5 (Investor Experience) | ⚠️ Partial — missing ofac_screening_status, e_signature_status, reporting_preferences |
| Subscription | amount, idempotency_key, investor_id, spv_id, status, units | Layer 3 (Financial) | ⚠️ Partial — no capital call tracking, no wire confirmation |
| KycSession | checks, investor_id, provider, session_id, status, verified_at | Layer 5 (KYC/AML) | ✅ Adequate for KYC, missing OFAC/sanctions results |
| ComplianceRecord | asset_test_pct, calculated_at, qo_assets, spv_id, status, test_date, test_type, threshold, total_assets | Layer 4 (Compliance) | ✅ Good for QOZ asset tests, missing Form D / blue sky tracking |
| FormationStage | completed_at, details, spv_id, stage_name, status | Layer 2 (State Machine) | ✅ Good framework, needs expanded stage taxonomy |

### Dibs Trust Network App (6a78d864c106cd65906a03b6)
Described as "secure financial management and trust capital network platform for transparent capital allocation and asset tracking." Currently has only User entity — appears to be early-stage or serving as the investor-facing portal layer.

### Elara (Super Agent — 6a79f0df89e93212f7602b23)
The monitoring/automation layer. Can read cross-app data, run scheduled workflows, send alerts via channels.

---

## 2. Gap Analysis: Blueprint Layer-by-Layer

### Layer 1 — Master Entity Layer
**Status: ❌ MISSING ENTIRELY**

The blueprint calls for a single master Delaware Series LLC with an immutable Certificate of Formation containing the § 18-215(b) liability notice. No entity exists for this.

**Required new entity: `MasterEntity`**
```json
{
  "properties": {
    "legal_name": { "type": "string" },
    "delaware_entity_id": { "type": "string" },
    "formation_date": { "type": "string", "format": "date-time" },
    "has_liability_notice": { "type": "boolean", "description": "§ 18-215(b) statutory notice present in Certificate of Formation" },
    "certificate_file_uri": { "type": "string", "description": "Private storage URI for the filed Certificate" },
    "amendment_count": { "type": "integer", "default": 0 },
    "last_amendment_date": { "type": "string", "format": "date-time" },
    "status": { "type": "string", "enum": ["ACTIVE", "AMENDMENT_PENDING", "INACTIVE"] }
  },
  "required": ["legal_name", "has_liability_notice", "status"]
}
```

**Statutory kill-switch:** Every SPV formation workflow must check `MasterEntity.has_liability_notice == true` before proceeding. This is a one-time setup gate — if it's false, the entire factory is blocked. This should be a workflow condition, not just a backend function check — so the block is visible and auditable.

**Implementation:** Create this entity in the Solene app (where deal data lives). Only one record should ever exist. The workflow checks it as the first step of every formation run.

---

### Layer 2 — Series Ledger Layer (The "Factory")
**Status: ⚠️ PARTIALLY MODELED**

The `Spv` entity covers basic series metadata but is missing critical fields for the ledger architecture.

**Required additions to `Spv` entity:**
```json
{
  "series_type": { "type": "string", "enum": ["PROTECTED", "REGISTERED"], "default": "PROTECTED" },
  "registered_series_filing_status": { "type": "string", "enum": ["N/A", "PENDING", "FILED", "REJECTED"] },
  "registered_series_filing_date": { "type": "string", "format": "date-time" },
  "asset_account_pointer": { "type": "string", "description": "Reference to the series-specific ledger account" },
  "ledger_hash": { "type": "string", "description": "Hash-chain reference for tamper-evident recordkeeping" },
  "previous_hash": { "type": "string", "description": "Hash of the prior series registry entry" },
  "formation_timeline_status": { "type": "string", "enum": [
    "INTAKE", "SERIES_CREATED", "EIN_PENDING", "EIN_RECEIVED",
    "BANK_PENDING", "BANK_READY", "DOCS_PENDING", "DOCS_EXECUTED",
    "KYC_BATCH_PENDING", "KYC_COMPLETE", "CAPITAL_CALL_PENDING",
    "CAPITAL_RECEIVED", "REGULATORY_PENDING", "INVESTOR_READY",
    "BLOCKED", "EIN_PENDING_MANUAL", "PENDING_STATE_FILING"
  ] },
  "first_sale_date": { "type": "string", "format": "date-time", "description": "Triggers the 15-day Form D countdown" },
  "form_d_filed_date": { "type": "string", "format": "date-time" },
  "form_d_status": { "type": "string", "enum": ["NOT_REQUIRED", "PENDING", "FILED", "OVERDUE"] },
  "blue_sky_status": { "type": "string", "enum": ["NOT_REQUIRED", "PENDING", "FILED", "OVERDUE"] },
  "responsible_party_used": { "type": "string", "description": "Which signatory from the pool was used for EIN" },
  "bank_subaccount_id": { "type": "string" },
  "bank_subaccount_status": { "type": "string", "enum": ["PENDING", "PROVISIONAL", "ACTIVE", "FAILED"] }
}
```

**Hash-chaining design:** The `ledger_hash` + `previous_hash` fields create the tamper-evident chain required by § 18-215(b). The hash is computed as `SHA256(previous_hash + series_id + formation_date + legal_name + series_type)`. This is implemented in a backend function — NOT in the agent — because it must be deterministic and side-effect-free.

**Required new entity: `SeriesRegistryLog`** (append-only event log)
```json
{
  "properties": {
    "series_id": { "type": "string" },
    "spv_id": { "type": "string" },
    "event_type": { "type": "string", "enum": [
      "SERIES_CREATED", "EIN_REQUESTED", "EIN_RECEIVED", "BANK_PROVISIONED",
      "DOCS_GENERATED", "DOCS_EXECUTED", "KYC_BATCH_STARTED", "KYC_PASS",
      "KYC_FAIL", "CAPITAL_CALL_ISSUED", "CAPITAL_RECEIVED",
      "FORM_D_FILED", "BLUE_SKY_FILED", "STATE_CHANGE", "ESCALATION"
    ] },
    "event_data": { "type": "object" },
    "hash": { "type": "string" },
    "previous_hash": { "type": "string" },
    "timestamp": { "type": "string", "format": "date-time" },
    "actor": { "type": "string", "description": "system, agent, or human reviewer name" }
  }
}
```

This entity is detective evidence of series operations, not a substitute for the separate books, records and accounts required under 6 Del. C. § 18-215(b). It must be append-only — no updates, no deletes. The backend function that writes to it only creates; escalations are cleared by appending `ESCALATION_RESOLVED`.

---

### Layer 3 — Financial Segregation Layer
**Status: ⚠️ PARTIALLY MODELED**

`Subscription` captures commitment data but there's no bank account or capital call tracking.

**Required new entity: `BankSubAccount`**
```json
{
  "properties": {
    "spv_id": { "type": "string" },
    "bank_partner": { "type": "string" },
    "account_number_masked": { "type": "string", "description": "Last 4 digits only" },
    "routing_number": { "type": "string" },
    "account_status": { "type": "string", "enum": ["PENDING", "PROVISIONAL", "ACTIVE", "FROZEN", "CLOSED"] },
    "fdic_insured": { "type": "boolean" },
    "sweep_network_id": { "type": "string", "description": "Multi-bank sweep network identifier" },
    "provisioned_at": { "type": "string", "format": "date-time" },
    "current_balance": { "type": "number" },
    "currency": { "type": "string", "default": "USD" }
  }
}
```

**Required new entity: `CapitalCall`**
```json
{
  "properties": {
    "spv_id": { "type": "string" },
    "subscription_id": { "type": "string" },
    "investor_id": { "type": "string" },
    "call_amount": { "type": "number" },
    "call_date": { "type": "string", "format": "date-time" },
    "due_date": { "type": "string", "format": "date-time" },
    "wire_status": { "type": "string", "enum": ["ISSUED", "PENDING", "RECEIVED", "OVERDUE", "FAILED"] },
    "wire_confirmation_ref": { "type": "string" },
    "received_amount": { "type": "number" },
    "received_date": { "type": "string", "format": "date-time" }
  }
}
```

**RLS enforcement:** Row-level security on `BankSubAccount` and `CapitalCall` must be keyed on `series_id` (via `spv_id` join). Cross-series queries require admin role with logged justification. In Base44, this means enabling RLS on these entities and ensuring the agent's backend functions never perform cross-series aggregations without explicit admin context.

---

### Layer 4 — Compliance & Filing Layer
**Status: ⚠️ PARTIALLY MODELED**

`ComplianceRecord` handles QOZ asset tests well. `FormationStage` tracks formation progress. But Form D, blue sky, and EIN tracking are missing.

**Required new entity: `FormDFiling`**
```json
{
  "properties": {
    "spv_id": { "type": "string" },
    "cik": { "type": "string", "description": "SEC EDGAR Central Index Key" },
    "ccc": { "type": "string", "description": "CIK Confirmation Code" },
    "offering_amount": { "type": "number" },
    "first_sale_date": { "type": "string", "format": "date-time" },
    "filing_deadline": { "type": "string", "format": "date-time", "description": "first_sale_date + 15 days" },
    "filed_date": { "type": "string", "format": "date-time" },
    "edgar_accession_number": { "type": "string" },
    "status": { "type": "string", "enum": ["NOT_REQUIRED", "PENDING", "FILED", "OVERDUE", "REJECTED"] },
    "days_until_deadline": { "type": "integer", "description": "Computed field for alerting" }
  }
}
```

**Required new entity: `BlueSkyFiling`**
```json
{
  "properties": {
    "spv_id": { "type": "string" },
    "jurisdiction": { "type": "string", "description": "Investor's state of residence" },
    "investor_id": { "type": "string" },
    "filing_type": { "type": "string", "description": "State-specific notice type" },
    "status": { "type": "string", "enum": ["PENDING", "FILED", "OVERDUE", "NOT_REQUIRED"] },
    "filed_date": { "type": "string", "format": "date-time" },
    "fee_amount": { "type": "number" }
  }
}
```

**Required new entity: `EINRequest`**
```json
{
  "properties": {
    "spv_id": { "type": "string" },
    "responsible_party": { "type": "string", "description": "Name from the pooled signatory list" },
    "responsible_party_id": { "type": "string" },
    "request_date": { "type": "string", "format": "date-time" },
    "ein": { "type": "string" },
    "status": { "type": "string", "enum": ["PENDING", "ISSUED", "FAILED", "THROTTLED", "MANUAL_REQUIRED"] },
    "irs_confirmation_ref": { "type": "string" }
  }
}
```

**Required new entity: `ResponsibleParty`** (EIN throttle management)
```json
{
  "properties": {
    "name": { "type": "string" },
    "ein_used_today": { "type": "boolean" },
    "last_used_date": { "type": "string", "format": "date" },
    "ein_count_this_month": { "type": "integer", "default": 0 },
    "status": { "type": "string", "enum": ["AVAILABLE", "USED_TODAY", "EXHAUSTED", "INACTIVE"] }
  }
}
```

---

### Layer 5 — Investor Experience Layer
**Status: ⚠️ PARTIALLY MODELED**

`Investor` and `KycSession` exist but need OFAC/sanctions and e-signature tracking.

**Required additions to `Investor` entity:**
```json
{
  "ofac_screening_status": { "type": "string", "enum": ["PENDING", "CLEAR", "FLAGGED", "BLOCKED"] },
  "ofac_screening_date": { "type": "string", "format": "date-time" },
  "e_signature_status": { "type": "string", "enum": ["NOT_SENT", "PENDING", "SIGNED", "EXPIRED", "DECLINED"] },
  "e_signature_doc_ref": { "type": "string", "description": "Hash reference to signed document set" }
}
```

**Required new entity: `DocumentSet`**
```json
{
  "properties": {
    "spv_id": { "type": "string" },
    "document_type": { "type": "string", "enum": ["SERIES_SCHEDULE", "SUBSCRIPTION_AGREEMENT", "AMENDMENT", "CERTIFICATE"] },
    "template_version": { "type": "string" },
    "generated_hash": { "type": "string", "description": "SHA-256 of the generated document" },
    "storage_uri": { "type": "string", "description": "Private storage URI" },
    "status": { "type": "string", "enum": ["GENERATED", "SENT_FOR_SIGNATURE", "EXECUTED", "EXPIRED"] },
    "executed_at": { "type": "string", "format": "date-time" },
    "structure_type": { "type": "string", "enum": ["SINGLE_ASSET", "ROLLING_FUND", "MULTI_CLOSE"] }
  }
}
```

---

## 3. State Machine → Workflow Mapping

The blueprint's 72-hour timeline maps to a Base44 workflow as follows. Note: Base44 workflows execute **sequentially** (no parallel branching), so the three concurrent forks (EIN, Banking, Docs) must be modeled as sequential steps with the understanding that the backend functions can trigger async operations and poll for completion.

### Workflow: `SPV Formation Pipeline`

```
Trigger: Entity trigger on Spv (event: create)
  Condition: Spv.formation_timeline_status == "INTAKE"

Step 1: check_statutory_gate
  → invoke_backend_function: checkMasterEntityLiabilityNotice()
  → Returns: { has_notice: boolean }
  → switch:
    → if false: escalate to compliance (send alert, set status BLOCKED, end)
    → if true: proceed

Step 2: create_series_ledger_entry
  → invoke_backend_function: createSeriesLedgerEntry(spv_id, series_type)
  → Hash-chains the new entry, writes to SeriesRegistryLog
  → Returns: { ledger_hash, series_id }

Step 3: check_series_type
  → switch on Spv.series_type:
    → PROTECTED: skip to step 4
    → REGISTERED: invoke_backend_function: fileRegisteredSeries(spv_id)
      → Sets status PENDING_STATE_FILING
      → Proceed (doesn't block — async callback expected)

Step 4: request_ein
  → invoke_backend_function: requestEIN(spv_id)
  → Rotates through ResponsibleParty pool, submits SS-4
  → Returns: { status: "PENDING" | "ISSUED" | "THROTTLED" }

Step 5: wait_ein
  → wait: PT1H (poll hourly)
  → invoke_backend_function: checkEINStatus(spv_id)
  → switch:
    → ISSUED: proceed
    → THROTTLED: queue for next available responsible party, wait PT1H, retry
    → MANUAL_REQUIRED: escalate, end

Step 6: provision_bank_account
  → invoke_backend_function: provisionBankSubAccount(spv_id)
  → Returns: { account_status: "PROVISIONAL" | "ACTIVE" }

Step 7: generate_documents
  → invoke_backend_function: generateSeriesDocuments(spv_id)
  → Template engine selects structure_type, injects deal terms
  → Returns: { document_set_id, hash }

Step 8: dispatch_e_signature
  → invoke_backend_function: dispatchESignature(spv_id, document_set_id)
  → Returns: { status: "PENDING" }

Step 9: kyc_batch
  → invoke_backend_function: runKYCBatch(spv_id)
  → Per-investor KYC/AML + accreditation + OFAC
  → Returns: { passed: [], failed: [], pending: [] }

Step 10: wait_kyc
  → wait: PT2H
  → invoke_backend_function: checkKYCStatus(spv_id)
  → switch:
    → All pass: proceed
    → Some fail but min raise met: proceed with partial close
    → Min raise not met: escalate, end

Step 11: capital_call
  → invoke_backend_function: issueCapitalCall(spv_id)
  → Returns: { call_ids: [] }

Step 12: wait_capital
  → wait: PT6H
  → invoke_backend_function: checkWireConfirmations(spv_id)
  → switch:
    → All received: proceed
    → Some missing: check if threshold met, proceed or extend

Step 13: regulatory_closeout
  → invoke_backend_function: fileFormD(spv_id)
  → invoke_backend_function: fileBlueSkyNotices(spv_id)
  → Update Spv.formation_timeline_status = "INVESTOR_READY"

Step 14: notify_completion
  → invoke_superagent_step: "SPV ${spv_id} formation complete. Notify sponsor and compliance team of successful formation. Include summary of timeline."
```

### Workflow: `Covenant Monitor` (the monitoring layer)
```
Trigger: Scheduled, every hour
  Condition: (none — always runs)

Step 1: fetch_active_deals
  → invoke_backend_function: getActiveSPVs()
  → Returns: { spvs: [...] }

Step 2: check_covenants
  → invoke_superagent_step: "Check these SPVs for covenant breaches:
     - LTV threshold violations (from ComplianceRecord)
     - Missed milestone deadlines (from FormationStage)
     - KYC/AML exceptions (from KycSession/Investor.ofac_screening_status)
     - Form D filing overdue (from FormDFiling, deadline = first_sale_date + 15 days)
     For each breach found, include: SPV ID, covenant type, evidence data point.
     Log every check to AlertLog. Never approve, waive, or modify covenant status.
     Data: ${.fetch_active_deals}"

Step 3: send_alerts
  → invoke_superagent_step: "Send alerts for any breaches found to Slack #compliance-alerts.
     Include deal ID, covenant type, and evidence.
     Log to audit table."
```

### Workflow: `Form D Deadline Tracker`
```
Trigger: Scheduled, daily at 8am

Step 1: check_form_d_deadlines
  → invoke_backend_function: checkFormDDeadlines()
  → Returns: { overdue: [], approaching: [], filed: [] }

Step 2: alert_overdue
  → switch:
    → if overdue.length > 0: invoke_superagent_step: "Form D filings overdue for SPVs: ${.check_form_d_deadlines.overdue}. Escalate immediately to compliance team."
    → if approaching.length > 0: invoke_superagent_step: "Form D deadlines approaching (within 5 days) for SPVs: ${.check_form_d_deadlines.approaching}. Notify compliance team."
    → else: end (clean)
```

---

## 4. Backend Functions Required

| Function Name | Purpose | Layer |
|---|---|---|
| `checkMasterEntityLiabilityNotice` | Statutory kill-switch check | Layer 1 |
| `createSeriesLedgerEntry` | Hash-chain append to SeriesRegistryLog | Layer 2 |
| `fileRegisteredSeries` | Trigger DE SoS registered series filing | Layer 2 |
| `requestEIN` | IRS SS-4 submission with responsible-party rotation | Layer 2/4 |
| `checkEINStatus` | Poll EIN request status | Layer 2/4 |
| `provisionBankSubAccount` | Partner bank sweep API call | Layer 3 |
| `generateSeriesDocuments` | Template engine document generation | Layer 2/5 |
| `dispatchESignature` | E-signature platform integration | Layer 5 |
| `runKYCBatch` | Per-investor KYC/AML/accreditation/OFAC | Layer 5 |
| `checkKYCStatus` | Poll KYC session results | Layer 5 |
| `issueCapitalCall` | Generate wire instructions | Layer 3 |
| `checkWireConfirmations` | Poll bank for wire receipts | Layer 3 |
| `fileFormD` | EDGAR Form D submission | Layer 4 |
| `fileBlueSkyNotices` | State blue sky notice automation | Layer 4 |
| `checkFormDDeadlines` | 15-day countdown check | Layer 4 |
| `getActiveSPVs` | Fetch all SPVs with active monitoring status | Monitoring |
| `logAlert` | Write-only to AlertLog entity | Monitoring |

---

## 5. External API Integrations Required

| Integration | Purpose | Base44 Connector Available? | Implementation |
|---|---|---|---|
| IRS e-Services | EIN filing (SS-4) | ❌ No native connector | Backend function with HTTPS call to IRS API (paid plan needed for non-443 ports) |
| SEC EDGAR | Form D filing | ❌ No native connector | Backend function with EDGAR API (CIK/CCC/PMAC credentials as secrets) |
| DE Secretary of State | Registered series filing (override path only) | ❌ No native connector | Backend function with DE SoS API |
| Partner Bank Sweep API | Bank sub-account provisioning | ❌ No native connector | Backend function with bank partner's API |
| E-Signature Platform | Document execution | Check if DocuSign/Hellosign connector exists | Backend function or connector if available |
| KYC/AML Provider | Identity verification + OFAC | Check if Persona/Sumsub connector exists | Backend function with provider API |
| Slack | Compliance alerts | ✅ Native connector | Use Base44 Slack connector + workflow |

---

## 6. What Can Be Built Right Now (No External APIs Needed)

These components can be implemented immediately using only Base44 native tools:

1. ✅ **All entity schemas** — Create/update all entities listed above in the Solene app
2. ✅ **Statutory kill-switch workflow** — Entity trigger + backend function checking MasterEntity
3. ✅ **Hash-chained series ledger** — Backend function computing SHA-256 hashes
4. ✅ **Covenant monitoring workflow** — Scheduled, reads entities, uses agent for breach detection
5. ✅ **Form D deadline tracker** — Scheduled, computes countdown, alerts
6. ✅ **AlertLog entity** — Write-only audit trail
7. ✅ **State machine tracking** — FormationStage + Spv.formation_timeline_status
8. ✅ **Responsible party pool management** — Entity + backend function for rotation logic

These require external API connections and are blocked until connectors/secrets are configured:

1. 🔒 **EIN automation** — Needs IRS e-Services API access
2. 🔒 **Bank sub-account provisioning** — Needs partner bank API contract
3. 🔒 **Form D filing** — Needs EDGAR credentials (CIK/CCC/PMAC)
4. 🔒 **Blue sky filings** — Needs state-by-state filing API or manual process
5. 🔒 **E-signature dispatch** — Needs e-signature platform integration
6. 🔒 **KYC/AML execution** — Needs KYC provider API
7. 🔒 **Registered series filing** — Needs DE SoS API access

---

## 7. Recommended Implementation Sequence

### Phase 0 (Immediate — I can build this now)
- Create `MasterEntity` entity in Solene app
- Update `Spv` entity with series_type, ledger hashes, timeline status
- Create `SeriesRegistryLog` (append-only event log)
- Create `AlertLog` entity for covenant monitoring
- Create `FormDFiling`, `BlueSkyFiling`, `EINRequest`, `ResponsibleParty` entities
- Create `BankSubAccount`, `CapitalCall`, `DocumentSet` entities
- Update `Investor` with OFAC/e-signature fields

### Phase 1 (Weeks 1-2 — Legal core)
- Deploy `checkMasterEntityLiabilityNotice` backend function
- Deploy `createSeriesLedgerEntry` backend function (hash-chaining)
- Create the SPV Formation Pipeline workflow with statutory gate
- Test hash-chain integrity and append-only enforcement
- Deploy `logAlert` backend function + covenant monitor workflow (stub data)

### Phase 2 (Weeks 3-4 — EIN + banking fork)
- Deploy `requestEIN` backend function (IRS API)
- Deploy `checkEINStatus` backend function
- Deploy `provisionBankSubAccount` backend function (bank API)
- Wire up responsible-party rotation logic
- Add EIN throttling queue and manual escalation path
- Add formation pipeline steps 4-6

### Phase 3 (Weeks 5-6 — Documents + e-signature)
- Deploy `generateSeriesDocuments` backend function (template engine)
- Deploy `dispatchESignature` backend function (e-sign platform)
- Add formation pipeline steps 7-8
- Implement document hash-committing to immutable store

### Phase 4 (Weeks 7-8 — KYC + regulatory)
- Deploy `runKYCBatch` and `checkKYCStatus` backend functions
- Deploy `fileFormD` and `fileBlueSkyNotices` backend functions
- Deploy `checkFormDDeadlines` backend function
- Add formation pipeline steps 9-13
- Create Form D Deadline Tracker workflow
- Activate covenant monitor workflow on live data

### Phase 5 (Weeks 9-10 — E2E testing)
- Run full 72-hour SLA simulation with test data
- Failure-state simulation: EIN throttle, KYC fail, wire delay, Form D deadline
- Compliance officer review workflow testing
- Verify audit trail completeness (every state transition logged)
- Verify RLS enforcement (no cross-series data leakage)
- Production cutover

---

## 8. Critical Design Decisions to Resolve

1. **Which app hosts the deal data?** Solene has the entities, Dibs Trust Network is the described platform. Should the entity schemas live in Solene or be migrated to Dibs Trust Network? The covenant monitor (me, Elara) can read cross-app, but having all deal data in one app is cleaner.

2. **Where does AlertLog live?** Options: (a) in Solene alongside deal data, (b) in the Elara/agent app for isolation. Recommendation: in Solene, with RLS enabled so only admin/agent can read.

3. **Responsible party pool** — How many signatories are available? The IRS throttle is 1 EIN per responsible party per day. If you need to form 5 SPVs/day, you need 5 signatories.

4. **KYC provider** — Persona, Sumsub, ComplyAdvantage, or another? Each has different API structures and OFAC screening coverage.

5. **Bank partner** — Which sweep network? This determines the `provisionBankSubAccount` backend function implementation.

6. **E-signature platform** — DocuSign, HelloSign/Dropbox Sign, or embedded solution?

7. **Document template engine** — Will documents be generated as PDFs from templates? What templating system? The `structure_type` branching (single-asset vs rolling-fund vs multi-close) requires multiple template variants.

8. **Memory scope** — For the covenant monitor, "Global Only" is correct (tracking shared portfolio state). Confirm this.

---

## 9. Super Agent (Elara) Role Definition

### What I do:
- **Covenant monitoring** — Hourly scheduled checks across all active SPVs
- **Form D deadline tracking** — Daily countdown alerts
- **Escalation routing** — Send alerts to Slack/WhatsApp with full evidence
- **Audit logging** — Every check logged to AlertLog
- **Formation status reporting** — When queried, summarize pipeline state

### What I never do:
- **Approve or waive covenants** — Only detect and alert
- **Write to covenant status, approval, or disbursement fields** — Only read + write to AlertLog
- **Auto-resolve KYC/AML or sanctions flags** — Always escalate to named human reviewer
- **Execute capital actions** — Wire transfers, capital calls execution, or fund movements
- **Modify entity formation status** — The backend functions handle state transitions; I monitor and report

### Guardrails baked into workflow instructions:
```
You are the DIBS Covenant Monitor. Your role is strictly monitoring and alerting.

READ-ONLY: You may read Spv, ComplianceRecord, KycSession, FormationStage, FormDFiling,
BlueSkyFiling, EINRequest, Investor, Subscription, BankSubAccount, CapitalCall entities.

WRITE-ONLY: You may write ONLY to AlertLog. You may not create, update, or delete any
other entity.

ESCALATION: Any KYC/AML flag, OFAC hit, or sanctions match must be escalated to
[Named Compliance Officer]. Never attempt to resolve these automatically.

ALERT FORMAT: Every alert must include: SPV ID, deal ID, covenant type, the specific
data point that triggered the alert, timestamp, and recommended action.

NEVER: Approve, waive, or modify covenant status. Never execute capital actions.
Never modify formation pipeline state. Never send messages on behalf of sponsors
or investors.
```
