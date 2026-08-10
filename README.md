# DIBS SPV Factory

Delaware Series LLC SPV formation platform with a 72-hour SLA. Automates protected series creation, EIN filing, bank account provisioning, KYC/AML screening, document generation, and regulatory compliance (Form D, blue sky) for special purpose vehicles.

## Architecture

- **Master Entity Layer** — Single Delaware Series LLC with § 18-215(b) liability notice
- **Series Ledger Layer** — Hash-chained, tamper-evident append-only log (legal record substitute for protected series)
- **Financial Segregation Layer** — Per-series bank sub-accounts via partner bank sweep
- **Compliance & Filing Layer** — Form D (EDGAR), blue sky notices, EIN (SS-4) automation
- **Investor Experience Layer** — KYC/AML (Sumsub), e-signature, capital calls, first-sale tracking

## Platform

Built on [Base44](https://base44.com) with:
- **Zevia app** — Deal data model (Spv, Sponsor, Investor, Subscription, KycSession, ComplianceRecord, FormationStage)
- **Elara app (Super Agent)** — Factory operational layer (entity schemas, backend functions, workflows)
- Cross-app entity reads for covenant monitoring and investor onboarding

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Default series type | Protected | No state filing lag — enables 72-hour SLA |
| Ledger model | Hash-chained append-only | Tamper-evident legal record per § 18-215(b) |
| KYC/AML provider | Sumsub | Global coverage, OFAC/sanctions screening |
| Alert channels | Slack + WhatsApp + Telegram | Multi-channel compliance escalation |
| Monitoring agent | Base44 Super Agent | 24/7 scheduled, cross-app, real actions |
| EIN rotation | Pooled responsible parties | IRS 1-EIN-per-day throttle compliance |
| First-sale tracking | Discrete timestamps | Soft circle ≠ first sale; irrevocable commitment starts Form D clock |

## Repo Structure

```
├── docs/
│   ├── conceptual-architecture.md       # Full canonical architecture (15 sections)
│   ├── deep-dive-blueprint.md            # Technical gap analysis & implementation plan
│   └── schema-gap-analysis.md            # Schema alignment with canonical data model
├── schemas/
│   └── entity-definitions.ts             # All entity schema definitions
├── functions/
│   ├── checkMasterEntityLiabilityNotice.ts  # Statutory § 18-215(b) kill-switch
│   ├── checkFormationGate.ts                # Formation pipeline pre-flight gate check
│   ├── createSeriesLedgerEntry.ts           # Hash-chained append-only ledger (with timestamp)
│   ├── getNextResponsibleParty.ts           # IRS SS-4 EIN throttle rotation
│   ├── triggerFirstSaleClock.ts             # Form D 15-day deadline engine
│   ├── processCapitalCall.ts                # Capital call creation for executed subscriptions
│   └── logAlert.ts                          # Write-only alert logger for monitoring
└── workflows/
    └── README.md                            # 4 workflow configurations
```

## Phase 0 — Complete ✅

- 10 entity schemas created
- 3 backend functions deployed and tested
- 2 workflows active
- Hash-chain ledger verified (SHA-256, tamper-evident)
- Statutory kill-switch verified

## Phase 1 — Complete ✅

- SeriesRegistryLog schema updated with timestamp + audit fields
- checkFormationGate deployed (statutory + escalation gate)
- getNextResponsibleParty deployed (3 pooled signatories, EIN throttle)
- SPV Formation Pipeline workflow active (15-min, 13 stages)
- EIN rotation verified

## Phase 2 — Complete ✅

- Schema gap analysis completed against canonical data model
- MasterEntity, SeriesRegistryLog, EINRequest, DocumentSet, FormDFiling schemas updated
- DealConfiguration entity created (18 fields, waterfall/closing conditions)
- triggerFirstSaleClock deployed (Form D deadline engine, soft circle guardrail)
- processCapitalCall deployed (capital call creation with duplicate prevention)
- Investor Onboarding Monitor workflow active (hourly, KYC/AML escalation)
- First-sale tracking with 6 discrete timestamps (soft circle → irrevocable → funds cleared)
- Form D clock verified (15-day deadline, soft circle correctly excluded)

## Active Workflows

| Workflow | Cadence | Purpose |
|---|---|---|
| DIBS Covenant Monitor | Hourly | LTV, milestones, KYC, OFAC, Form D monitoring |
| Form D Deadline Tracker | Daily 8am UTC | 15-day statutory deadline countdown |
| SPV Formation Pipeline | Every 15 min | 13-stage formation with statutory gate + hash-chain |
| Investor Onboarding Monitor | Hourly | KYC/AML escalation, capital calls, first-sale tracking |

## License

Proprietary — DIBS Financial
