# DIBS SPV Factory

Delaware Series LLC SPV formation platform with a 72-hour SLA. Automates protected series creation, EIN filing, bank account provisioning, KYC/AML screening, document generation, and regulatory compliance (Form D, blue sky) for special purpose vehicles.

## Architecture

- **Master Entity Layer** — Single Delaware Series LLC with § 18-215(b) liability notice
- **Series Ledger Layer** — Hash-chained, tamper-evident append-only log (legal record substitute for protected series)
- **Financial Segregation Layer** — Per-series bank sub-accounts via partner bank sweep
- **Compliance & Filing Layer** — Form D (EDGAR), blue sky notices, EIN (SS-4) automation
- **Investor Experience Layer** — KYC/AML (Sumsub), e-signature, capital calls, reporting

## Platform

Built on [Base44](https://base44.com) with:
- **Zevia app** — Deal data model (Spv, Sponsor, Investor, Subscription, KycSession, ComplianceRecord, FormationStage)
- **Elara app (Super Agent)** — Factory operational layer (entity schemas, backend functions, workflows)
- Cross-app entity reads for covenant monitoring

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Default series type | Protected | No state filing lag — enables 72-hour SLA |
| Ledger model | Hash-chained append-only | Tamper-evident legal record per § 18-215(b) |
| KYC/AML provider | Sumsub | Global coverage, OFAC/sanctions screening |
| Alert channels | Slack + WhatsApp + Telegram | Multi-channel compliance escalation |
| Monitoring agent | Base44 Super Agent | 24/7 scheduled, cross-app, real actions |

## Repo Structure

```
├── docs/
│   └── deep-dive-blueprint.md          # Full technical gap analysis & implementation plan
├── schemas/
│   └── entity-definitions.ts            # All entity schema definitions
├── functions/
│   ├── checkMasterEntityLiabilityNotice.ts  # Statutory § 18-215(b) kill-switch
│   ├── createSeriesLedgerEntry.ts           # Hash-chained append-only ledger
│   └── logAlert.ts                          # Write-only alert logger for monitoring
└── workflows/
    └── README.md                            # Workflow configuration docs
```

## Phase 0 — Complete

- ✅ 10 new entity schemas created (MasterEntity, SeriesRegistryLog, AlertLog, EINRequest, ResponsibleParty, BankSubAccount, CapitalCall, FormDFiling, BlueSkyFiling, DocumentSet)
- ✅ 15 new fields added to Spv entity (series_type, formation_timeline_status, ledger hashes, etc.)
- ✅ 4 new fields added to Investor entity (OFAC screening, e-signature)
- ✅ 3 backend functions deployed and tested
- ✅ 2 scheduled workflows active (Covenant Monitor hourly, Form D Tracker daily)
- ✅ Hash-chain ledger verified (SHA-256, tamper-evident)
- ✅ Statutory kill-switch verified (blocks formation if § 18-215(b) notice missing)

## License

Proprietary — DIBS Financial
