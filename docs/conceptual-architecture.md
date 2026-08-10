# DIBS SPV Factory — Conceptual Architecture

**DIBS SPV Factory** is a compliance-first workflow product for forming and administering transaction-specific Delaware Series LLC SPVs. Its product promise is **target 72-hour funding readiness for eligible, pre-approved structures**, not unconditional legal formation or bank-account completion, because EIN, banking, investor eligibility, state processing, and legal-review dependencies may fall outside platform control.

## 1. Product Boundary

- **Product name**
  - DIBS SPV Factory
  - Optional market label: 72-Hour SPV-in-a-Box™

- **Core objective**
  - Compress standard SPV formation, document preparation, investor onboarding, and initial compliance coordination from a manual 4-6-week sequence into a structured, parallelized readiness workflow.

- **Primary users**
  - Real-estate syndicators
  - Sponsors
  - Private-fund managers
  - Fund administrators
  - Legal engineers and outside counsel
  - Accredited-investor operations teams

- **Primary output**
  - A transaction-specific SPV with:
    - Defined entity structure
    - Series-specific operating documents
    - EIN request or issued EIN status
    - Bank-readiness package
    - Investor onboarding workflow
    - Executable subscription package
    - Compliance deadline registry
    - Immutable formation and administration record

- **Commercial design**
  - Target formation fee: $7,500 per SPV
  - Target annual AUM fee: 0.25%
  - Reference historical pricing position: lower than a stated $15,000-$25,000 traditional formation-and-administration workflow

- **Explicit exclusions**
  - No guarantee of investor return, investment performance, tax treatment, legal outcome, banking approval, EIN issuance, or regulatory approval
  - No replacement for legal counsel, tax counsel, broker-dealer, investment adviser, bank, custodian, or registered agent
  - No custody of client assets or autonomous securities-law determination

## 2. Legal Entity Architecture

- **Master entity**
  - Delaware Series LLC
  - Formed once as the umbrella entity
  - Certificate of Formation must contain the statutory notice limiting liabilities among series
  - LLC agreement must authorize the creation of series

- **Protected series**
  - Default DIBS SPV Factory vehicle
  - Created under the master LLC agreement and internal series-designation process
  - Designed for speed where public registration is not required
  - Requires separate accounting and records for series assets and liabilities

- **Registered series**
  - Exception path
  - Requires a Certificate of Registered Series
  - Use when lender, title company, institutional investor, counterparty, or asset-registration requirements demand state-filed proof of a separately registered series

- **Liability-isolation preconditions**
  - Master Certificate of Formation contains the required limitation-of-liability notice
  - LLC agreement authorizes series
  - Each series maintains separately identifiable assets and records
  - Series-specific obligations are recorded and allocated without commingling
  - Platform blocks activation when required evidence of these controls is absent

Delaware law provides the liability limitation only when the LLC agreement provides for the series, the Certificate of Formation includes the required notice, and records separately account for assets associated with each protected series.

## 3. Canonical Data Model

- **Identity and tenancy**
  - `organization_id`
  - `sponsor_id`
  - `user_id`
  - `role_id`
  - `legal_entity_id`

- **Master Series LLC**
  - `master_llc_id`
  - `legal_name`
  - `delaware_file_number`
  - `certificate_of_formation_hash`
  - `liability_notice_verified_at`
  - `registered_agent_id`
  - `operating_agreement_version`
  - `entity_status`

- **SPV series**
  - `series_id`
  - `master_llc_id`
  - `series_name`
  - `series_type`
  - `series_status`
  - `effective_date`
  - `business_purpose`
  - `asset_strategy`
  - `deal_id`
  - `ein_status`
  - `banking_status`
  - `document_set_version`
  - `ledger_scope`
  - `close_target_date`

- **Deal configuration**
  - `deal_id`
  - `sponsor_id`
  - `series_id`
  - `asset_type`
  - `asset_location`
  - `purchase_price`
  - `target_raise`
  - `minimum_raise`
  - `maximum_raise`
  - `offering_exemption`
  - `investor_type`
  - `fee_schedule`
  - `waterfall_configuration`
  - `closing_conditions`

- **Investor onboarding**
  - `investor_id`
  - `investor_entity_id`
  - `beneficial_owner_id`
  - `accreditation_status`
  - `kyc_status`
  - `aml_status`
  - `signing_authority_status`
  - `subscription_status`
  - `funding_status`
  - `consent_status`

- **Document and audit objects**
  - `document_id`
  - `template_id`
  - `template_version`
  - `document_hash`
  - `signature_status`
  - `formation_event_id`
  - `audit_event_id`
  - `external_reference`

## 4. Series Isolation Controls

- **Database isolation**
  - Enforce Postgres row-level security by `organization_id` and `series_id`
  - Reject any financial, document, investor, or activity record without an assigned `series_id`
  - Restrict cross-series access to designated administrators with logged purpose and role-based authorization
  - Separate document storage paths and encryption scopes by series

- **Accounting isolation**
  - Maintain a separate ledger scope for every series
  - Prohibit shared asset records without an allocation formula and authorized journal entry
  - Require every subscription, expense, fee, asset, liability, distribution, and tax item to carry `series_id`
  - Correct errors through compensating entries; prohibit mutation of posted audit and ledger events

- **Document isolation**
  - Bind operating agreement schedule, subscription agreement, investor roster, fee terms, and offering materials to a specific `series_id`
  - Prevent a document generated for Series A from being attached to Series B
  - Hash and archive executed documents with source template version, signer identity, and timestamp

- **Operational isolation**
  - Generate series-specific investor data rooms
  - Generate series-specific bank-readiness packages
  - Generate series-specific reporting and compliance calendars
  - Require explicit approval before any shared-service allocation

## 5. Formation Workflow

- **Stage 0 — Sponsor intake**
  - Capture sponsor identity
  - Capture asset and deal parameters
  - Capture target raise, investor profile, asset location, target close date, fee terms, and waterfall terms
  - Capture lender, title, tax, and institutional diligence requirements
  - Validate required data before workflow initiation

- **Stage 1 — Structure decision**
  - Determine `PROTECTED_SERIES` or `REGISTERED_SERIES`
  - Apply rules:
    - If lender/public-record/title requirement is present, route to registered-series review
    - If standardized domestic single-asset transaction satisfies eligibility rules, default to protected series
    - If non-U.S. investors, ERISA/retirement accounts, QOZ/QOF structuring, multi-state complications, or custom economics are present, route to counsel review
  - Generate readiness forecast and dependency graph

- **Stage 2 — Series creation**
  - Validate master LLC liability-notice evidence
  - Validate operating agreement authorization
  - Allocate unique `series_id`
  - Generate series name and designation
  - Create series registry record
  - Create series-specific ledger scope
  - Create series-specific document workspace
  - Record immutable formation event

- **Stage 3 — Parallel readiness workstreams**
  - **EIN workstream**
    - Prepare SS-4 data packet
    - Validate responsible party
    - Check responsible-party issuance capacity
    - Queue submission
    - Track `EIN_REQUESTED`, `EIN_SUBMITTED`, `EIN_ISSUED`, or `EIN_EXCEPTION`
  - **Document workstream**
    - Select counsel-approved template set
    - Insert series designation
    - Insert deal economics
    - Insert waterfall and fee schedule
    - Generate investor documents
    - Route for sponsor/counsel approval
  - **Banking workstream**
    - Assemble formation and EIN package
    - Generate beneficial-ownership and signatory packet
    - Track partner-bank requirements
    - Mark `BANKING_PENDING`, `BANKING_READY`, or `BANKING_EXCEPTION`
  - **Investor workstream**
    - Configure investor eligibility
    - Launch KYC/AML and accreditation collection
    - Create subscription workflow
    - Monitor signing and funding states

- **Stage 4 — Investor-ready review**
  - Confirm entity and document status
  - Confirm EIN/banking dependency status
  - Confirm investor onboarding configuration
  - Confirm compliance calendar activation
  - Confirm sponsor approval
  - Publish readiness status and unresolved dependencies

- **Stage 5 — Active administration**
  - Maintain investor roster
  - Maintain document repository
  - Track compliance deadlines
  - Track annual entity obligations
  - Generate reporting and audit exports
  - Support amendments, substitutions, closes, distributions, and wind-down workflow

## 6. Readiness State Machine

```text
DRAFT
→ INTAKE_VALIDATED
→ STRUCTURE_SELECTED
→ SERIES_CREATED
→ PARALLEL_PROCESSING
   ├── EIN_PENDING
   ├── DOCUMENTS_PENDING
   ├── BANKING_PENDING
   └── INVESTOR_ONBOARDING
→ DOCUMENTS_READY
→ COMPLIANCE_CONFIGURED
→ SUBSCRIPTIONS_OPEN
→ INVESTOR_READY
→ FUNDED
→ ACTIVE_ADMINISTRATION
→ EXITED / WIND_DOWN
```

- **Exception states**
  - `MASTER_ENTITY_DEFECT`
  - `COUNSEL_REVIEW_REQUIRED`
  - `EIN_CAPACITY_DELAY`
  - `EIN_DATA_ERROR`
  - `BANKING_EXCEPTION`
  - `DOCUMENT_EXCEPTION`
  - `KYC_AML_ESCALATION`
  - `ACCREDITATION_EXCEPTION`
  - `COMPLIANCE_HOLD`
  - `REGISTERED_SERIES_FILING_PENDING`
  - `MANUAL_INTERVENTION_REQUIRED`

- **Readiness score**
  - Entity readiness
  - EIN readiness
  - Banking readiness
  - Document readiness
  - Investor-readiness configuration
  - Compliance readiness
  - Unresolved-exception penalty
  - Critical-path dependency weighting

- **SLA controls**
  - Warning at 50% of target window
  - Escalation at 75%
  - Mandatory owner assignment at 90%
  - Exclude external wait states from internal execution-time reporting
  - Show actual blocker, owner, required action, and estimated completion

## 7. EIN Automation Layer

- **EIN request object**
  - `ein_request_id`
  - `series_id`
  - `responsible_party_id`
  - `ss4_payload_version`
  - `submission_channel`
  - `submission_status`
  - `submission_at`
  - `ein_number`
  - `exception_code`

- **Validation controls**
  - Legal entity name matches series records
  - Responsible party is valid and identified
  - Responsible-party taxpayer identification data is collected through a secure process
  - Formation date, business purpose, tax classification, address, and fiscal-year inputs are complete
  - No duplicate active EIN request for the same series

- **Throughput constraints**
  - One responsible party may receive one EIN per business day
  - Limit applies regardless of online, phone, fax, or mail submission path
  - Maintain capacity scheduler; do not represent EIN issuance as instantaneous

- **Exception routing**
  - `RESPONSIBLE_PARTY_LIMIT`
  - `INVALID_DATA`
  - `IRS_SYSTEM_DELAY`
  - `MANUAL_SUBMISSION_REQUIRED`
  - `RESPONSIBLE_PARTY_VERIFICATION_REQUIRED`
  - `DUPLICATE_APPLICATION_RISK`

## 8. Document Generation Engine

- **Template registry**
  - `template_id`
  - `template_type`
  - `jurisdiction`
  - `series_type`
  - `offering_type`
  - `asset_strategy`
  - `approved_by`
  - `version`
  - `effective_date`
  - `retired_at`

- **Primary generated documents**
  - Master LLC agreement reference package
  - Series designation schedule
  - Series-specific operating agreement or amendment
  - Subscription agreement
  - Investor questionnaire
  - Accredited-investor representation package
  - Risk disclosure
  - Fee and waterfall schedule
  - Capital-call notice
  - Signature packet
  - Compliance filing package

- **Template logic**
  - If `series_type == PROTECTED_SERIES`, generate protected-series designation and isolation provisions
  - If `series_type == REGISTERED_SERIES`, require registered-series filing reference and corresponding document branch
  - If `offering_exemption` changes, route to required investor-representation and disclosure branch
  - If custom economic terms exceed approved parameter ranges, route to counsel review
  - If a required legal clause is unavailable or outdated, block document generation

- **Execution controls**
  - Generate from structured deal data; prohibit uncontrolled manual edits after approval
  - Version every document
  - Preserve generated source data
  - Hash final PDFs
  - Capture signer identity, signature timestamp, and completion certificate
  - Lock executed documents; amendments create a new version and audit event

## 9. Investor Onboarding Layer

- **Investor intake**
  - Individual, trust, entity, retirement-account, or other supported investor classification
  - Identity and contact information
  - Beneficial ownership
  - Signatory authority
  - Tax documentation requirements
  - Accredited-investor workflow
  - KYC/AML workflow
  - Subscription and funding instructions

- **Investor states**
  - `INVITED`
  - `PROFILE_INCOMPLETE`
  - `KYC_PENDING`
  - `KYC_CLEARED`
  - `AML_ESCALATED`
  - `ACCREDITATION_PENDING`
  - `ACCREDITATION_VALID`
  - `SUBSCRIPTION_SENT`
  - `SUBSCRIPTION_EXECUTED`
  - `FUNDS_PENDING`
  - `FUNDS_CONFIRMED`
  - `REJECTED`
  - `WITHDRAWN`

- **Data access**
  - Investor receives access only to the applicable series data room
  - Sponsor receives only the verification status and documents authorized for that series
  - Use explicit role and organization checks
  - Do not expose another SPV's investors, documents, financial data, or activity

- **Investor readiness output**
  - `READY_TO_SUBSCRIBE`
  - `ACTION_REQUIRED`
  - `COMPLIANCE_REVIEW`
  - `NOT_ELIGIBLE`
  - `EXPIRED`
  - `FUNDED`

## 10. Securities-Compliance Workflow

- **Offering configuration**
  - Store selected offering exemption
  - Store counsel approval
  - Store investor eligibility criteria
  - Store disclosure requirements
  - Store federal and state filing obligations
  - Store responsible owner and deadlines

- **First-sale tracking**
  - Maintain discrete timestamps:
    - `soft_circle_at`
    - `subscription_sent_at`
    - `subscription_signed_at`
    - `irrevocable_commitment_at`
    - `funds_received_at`
    - `funds_cleared_at`
  - Do not treat a soft circle as a first sale
  - Do not infer first sale solely from bank receipt

- **Form D control**
  - Create filing package before subscriptions open
  - Start deadline clock at first irrevocable contractual commitment
  - Route filing package to authorized reviewer
  - Record submission receipt and status
  - Track amendments and state notice filings where applicable

Form D must be filed within 15 days after the first sale; for this purpose, first sale is generally the date the first investor becomes irrevocably contractually committed, subject to the offering terms.

## 11. Security and Audit Controls

- **Authorization**
  - Role-based access control
  - Organization-scoped authorization
  - Series-scoped authorization
  - Least-privilege permissions
  - Elevated actions require explicit justification and logging

- **Immutable audit events**
  - Formation initiation
  - Structure selection
  - Series creation
  - EIN request/submission/issuance
  - Document generation
  - Document approval
  - Signature completion
  - Investor status change
  - Compliance review
  - Filing event
  - Amendment
  - Wind-down action

- **Audit event schema**
  - `event_id`
  - `event_type`
  - `organization_id`
  - `series_id`
  - `actor_id`
  - `actor_role`
  - `occurred_at`
  - `source_system`
  - `payload_hash`
  - `previous_event_hash`
  - `correlation_id`

- **Data protection**
  - Encrypt PII at rest and in transit
  - Store sensitive identity and tax data in a separated vault
  - Use tokenized references for external identity, KYC/AML, banking, and e-signature integrations
  - Store API secrets in a secrets manager
  - Restrict production-document access
  - Prevent secrets, investor documents, SS-4 payloads, and database backups from entering source control

## 12. Primary APIs

- **Formation**
  - `POST /formation/intake`
  - `POST /formation/structure-recommendation`
  - `POST /formation/series-create`
  - `GET /formation/readiness/{series_id}`
  - `POST /formation/registered-series-file`

- **EIN**
  - `POST /formation/ein-request`
  - `GET /formation/ein-status/{series_id}`
  - `POST /formation/ein-exception/{ein_request_id}/resolve`

- **Documents**
  - `POST /documents/generate`
  - `POST /documents/{document_id}/approve`
  - `POST /documents/{document_id}/send-for-signature`
  - `GET /documents/{document_id}/audit`

- **Investor onboarding**
  - `POST /investors/invite`
  - `POST /investors/{investor_id}/verify`
  - `POST /subscriptions/create`
  - `POST /subscriptions/{subscription_id}/send`
  - `GET /subscriptions/{subscription_id}/status`

- **Compliance**
  - `POST /compliance/offering-configure`
  - `POST /compliance/form-d-package`
  - `POST /compliance/form-d-file`
  - `GET /compliance/deadlines/{series_id}`
  - `POST /compliance/exceptions/{exception_id}/resolve`

- **Administration**
  - `GET /series/{series_id}/dashboard`
  - `GET /series/{series_id}/investors`
  - `GET /series/{series_id}/documents`
  - `GET /series/{series_id}/audit-export`
  - `POST /series/{series_id}/amendment`
  - `POST /series/{series_id}/wind-down`

## 13. Operational Roles

- **Sponsor**
  - Creates and configures transaction intake
  - Approves commercial terms
  - Supplies required asset and offering materials
  - Invites investors
  - Cannot override legal, compliance, or entity-isolation blocks

- **DIBS operations**
  - Monitors workflow SLA
  - Resolves data and integration exceptions
  - Manages registered-agent and partner coordination
  - Cannot unilaterally alter approved legal templates or compliance determinations

- **Legal counsel**
  - Approves templates
  - Reviews nonstandard structures
  - Approves material amendments
  - Reviews offering-exemption and jurisdictional exceptions

- **Compliance reviewer**
  - Resolves KYC/AML and accreditation exceptions
  - Reviews Form D package
  - Owns filing deadline escalation

- **Investor**
  - Completes required onboarding
  - Reviews series documents
  - Executes subscription documents
  - Confirms funding instructions

- **Registered agent / banking / KYC / e-signature partner**
  - Executes external service function
  - Provides status callback
  - Does not control DIBS series ledger or internal readiness state

## 14. Failure-State Controls

- **Master entity defect**
  - Trigger: Missing liability-limitation notice or missing authority to create series
  - Action: Block all new protected-series creation; route to counsel

- **Series-isolation defect**
  - Trigger: Missing `series_id`, cross-series record, unallocated shared asset, or ledger inconsistency
  - Action: Lock affected workflow; generate remediation case; require legal/finance authorization

- **EIN delay**
  - Trigger: Responsible-party daily capacity exhausted, IRS delay, data rejection, or manual submission requirement
  - Action: Continue documents and investor onboarding; report EIN as external dependency; do not represent entity as tax-ready until issued

- **Banking delay**
  - Trigger: Partner-bank document request, approval delay, signatory mismatch, or EIN dependency
  - Action: Continue non-banking tasks; hold final funding-readiness designation until banking conditions resolve

- **Document exception**
  - Trigger: Nonstandard economics, unsupported entity type, outdated template, or missing legal clause
  - Action: Freeze generation; assign counsel review; preserve draft state

- **Investor compliance exception**
  - Trigger: KYC/AML hit, accreditation failure, authority deficiency, or incomplete disclosure acknowledgment
  - Action: Block that investor from subscription acceptance; allow eligible investors to proceed where offering terms permit

- **Form D deadline risk**
  - Trigger: First-sale clock active and filing incomplete
  - Action: Escalate at configured intervals; lock compliance close-out until authorized filing owner acts

## 15. Delivery Sequence

- **Release 1 — Formation core**
  - Master-entity registry
  - Series registry
  - `series_id` isolation
  - Structure decision engine
  - Readiness state machine
  - Formation audit log
  - Standard protected-series document package

- **Release 2 — Readiness automation**
  - EIN request workflow and capacity scheduler
  - Template engine
  - E-signature integration
  - Sponsor command center
  - Banking-readiness package
  - SLA and exception management

- **Release 3 — Investor and compliance**
  - Investor onboarding
  - KYC/AML and accreditation orchestration
  - Subscription workflow
  - Data room
  - Form D deadline engine
  - Compliance-review console

- **Release 4 — Administration**
  - Investor roster
  - Amendment workflow
  - Annual compliance calendar
  - Audit export
  - Series wind-down workflow
  - Portfolio-level sponsor reporting

## Dependency Matrix

| Source node | Dependent node | Required relationship |
|---|---|---|
| Master Series LLC | Protected-series creation | Master certificate notice and LLC-agreement authority must validate before activation |
| `series_id` | All records | Every investor, document, ledger, workflow, and audit record requires series assignment |
| Structure decision engine | Formation workflow | Determines protected versus registered series, counsel routing, filing path, and readiness estimate |
| EIN request | Banking readiness | Banking may require issued EIN; documents and investor onboarding can continue where appropriate |
| Template registry | Document engine | Only approved, current template versions can generate legal documents |
| Deal configuration | Document engine | Deal economics, fees, investor type, and series structure populate document branches |
| Investor onboarding | Subscription status | KYC, AML, accreditation, authority, and executed disclosures determine investor eligibility |
| First irrevocable commitment | Form D clock | Triggers 15-day filing deadline monitoring |
| Series ledger scope | Liability-isolation evidence | Separate accounting supports protected-series isolation requirements |
| Banking readiness | Funding-ready designation | SPV cannot be represented as funded or bank-ready until external banking conditions are confirmed |
| Immutable audit log | Legal, compliance, operations | Every formation, document, investor, EIN, and compliance state mutation must generate an audit event |
