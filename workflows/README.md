# Workflow Definitions

Workflows are deployed and managed via the Base44 platform. This directory documents their configuration.

## DIBS Covenant Monitor
- **Trigger:** Scheduled, every hour (cron: `0 * * * *`, UTC)
- **Activity:** `invoke_superagent_step` — agent reads active SPVs cross-app, checks covenants, logs alerts
- **Scope:** LTV thresholds, milestone deadlines, KYC/AML exceptions, OFAC flags, Form D deadlines
- **Guardrails:** Read-only on all entities except AlertLog (write-only). Never approves, waives, or modifies covenant status.

## Form D Deadline Tracker
- **Trigger:** Scheduled, daily at 8am UTC (cron: `0 8 * * *`)
- **Activity:** `invoke_superagent_step` — checks FormDFiling records for 15-day statutory deadline
- **Escalation:** WARNING at day 10, CRITICAL at day 15+ (overdue)

## SPV Formation Pipeline
- **Trigger:** Scheduled, every 15 minutes (cron: `*/15 * * * *`, UTC)
- **Activity:** `invoke_superagent_step` — reads pending SPVs from Zevia app, advances through the 14-stage formation pipeline (plus hold states BLOCKED, EIN_PENDING_MANUAL, PENDING_STATE_FILING)
- **Pipeline Stages:** INTAKE → SERIES_CREATED → EIN_PENDING → EIN_RECEIVED → BANK_PENDING → BANK_READY → DOCS_PENDING → DOCS_EXECUTED → KYC_BATCH_PENDING → KYC_COMPLETE → CAPITAL_CALL_PENDING → CAPITAL_RECEIVED → REGULATORY_PENDING → INVESTOR_READY
- **Guardrails:** `checkFormationGate` runs before every transition (statutory gate, exactly one ACTIVE master, no unresolved escalation). Every transition logged to hash-chain ledger. Escalates on any gate failure; an escalation is cleared only by appending `ESCALATION_RESOLVED`.

## Investor Onboarding Monitor
- **Trigger:** Scheduled, hourly (cron: `0 * * * *`, UTC)
- **Activity:** `invoke_superagent_step` — monitors investor KYC/AML status, capital calls, first-sale clock, Form D deadlines
- **Scope:** KYC/AML escalation, capital call processing, irrevocable commitment tracking, Form D deadline monitoring
- **Guardrails:** KYC/AML hits escalated to human review. Only an irrevocable commitment starts the Form D clock — soft circles, signed subscriptions and bank receipts are recorded as timestamps only. Pass `committed_at` to `triggerFirstSaleClock` so the clock starts at the commitment, not at the monitor run. Cross-series data never exposed.
