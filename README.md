# DIBS SPV FACTORY

Important: This repository is the open-core dump — docs, schemas as published, and demonstration UI. Dual license: see NOTICE.md. Formation engine, IRS/EDGAR, counsel templates, and the Phase 3 pack are commercial (LICENSE-PROPRIETARY).

72-hour funding-readiness applies only to eligible, pre-approved Delaware Series LLC structures, subject to EIN, banking, eligibility, state processing, and counsel review.

Delaware Series LLC SPV formation factory. Coordinates protected-series designation, EIN orchestration, banking introduction, KYC/AML batching, document packets, and Form D / blue-sky clocks. It does not replace counsel, a broker-dealer, an RIA, a bank, a custodian, or a registered agent. It does not custody assets and does not make securities-law determinations.

## Architecture

- Master Entity Layer — Single Delaware Series LLC with § 18-215(b) liability notice
- Series Ledger Layer — Hash-chained operational log (detective evidence; not a legal-record substitute under 6 Del. C. § 18-215(b))
- Financial Segregation Layer — Per-series bank sub-accounts via partner bank (DIBS does not custody)
- Compliance & Filing Layer — Form D clock, blue-sky notices, EIN (SS-4) rotation. EDGAR upload is not in this dump.
- Investor Experience Layer — KYC/AML batching, e-signature envelopes, capital calls, first-sale timestamps

## Platform

Built on Base44:

- Deal-model app — Sponsor, Spv, Investor, Subscription, KycSession, ComplianceRecord, FormationStage
- Factory ops app — entity schemas, backend functions, workflows
- Cross-app reads for covenant monitoring and investor onboarding
- Factory functions cannot write deal-model entities

## Key design decisions

Default series type: Protected. No incremental state filing lag. 72-hour funding-readiness still subject to EIN, banking, eligibility, state processing, and counsel review.

Ledger model: Hash-chained append-only convention. Detective hash chain. Isolation still requires statutory notice, LLC-agreement authority, and separate books, records, and accounts.

KYC/AML: Intended Sumsub. Not wired in this repo.

Alert channels: Slack + WhatsApp + Telegram (intended). Not wired in this repo.

EIN rotation: Pooled responsible parties. IRS online 1 EIN / responsible party / day.

First-sale tracking: Irrevocable contractual commitment only. Soft circle is not a first sale. Bank receipt is not a first sale. E-sign SIGNED is not a first sale.

## Repo structure

NOTICE.md, LICENSE, LICENSE-MIT, LICENSE-PROPRIETARY, CONTRIBUTING.md
docs/
schemas/entity-definitions.ts
functions/   (operational engine — LICENSE-PROPRIETARY)
workflows/README.md

## Status

Formation gate, ledger append, EIN rotation, Form D timestamps, and capital-call create exist as source in this dump. Runtime lives on Base44. Control gaps remain (ledger mutability, EIN race, RLS).

Phase 3 pack (document generate + e-sign) is not in this repository. All Rights Reserved.

Connectors (IRS, EDGAR, Sumsub, bank, e-sign vendor) are specified, not shipped here.

## Active workflows (documented)

DIBS Covenant Monitor — Hourly — LTV, milestones, KYC, OFAC, Form D — writes AlertLog

Form D Deadline Tracker — Daily 8am UTC — Operational +15 calendar-day clock. Not counsel's Rule 503 calendar.

SPV Formation Pipeline — Every 15 min — Stage hops with statutory gate

Investor Onboarding Monitor — Hourly — KYC escalation, capital calls, first-sale

## License

Dual license. See NOTICE.md, LICENSE-MIT, and LICENSE-PROPRIETARY.

Docs and published demonstration UI: MIT.

functions/, schemas/, Phase 3 pack, legal templates, private services: All Rights Reserved, DIBS Financial.
