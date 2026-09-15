# DIBS SPV FACTORY

Important: This repository is the open-core dump — docs, schemas as published, and demonstration UI. Dual license: see NOTICE.md. Formation engine, IRS/EDGAR, counsel templates, and the Phase 3 pack are commercial (LICENSE-PROPRIETARY).

72-hour funding-readiness applies only to eligible, pre-approved Delaware Series LLC structures, subject to EIN, banking, eligibility, state processing, and counsel review.

Delaware Series LLC SPV formation factory. Coordinates protected-series designation, EIN orchestration, banking introduction, KYC/AML batching, document packets, and Form D / blue-sky clocks. It does not replace counsel, a broker-dealer, an RIA, a bank, a custodian, or a registered agent. It does not custody assets and does not make securities-law determinations.

## Architecture

- **Master Entity Layer** — Single Delaware Series LLC with § 18-215(b) liability notice
- **Series Ledger Layer** — Hash-chained operational log (detective evidence; not a legal-record substitute under 6 Del. C. § 18-215(b))
- **Financial Segregation Layer** — Per-series bank sub-accounts via partner bank (DIBS does not custody)
- **Compliance & Filing Layer** — Form D clock, blue-sky notices, EIN (SS-4) rotation. EDGAR upload is not in this dump.
- **Investor Experience Layer** — KYC/AML batching, e-signature envelopes, capital calls, first-sale timestamps

## Platform

Built on [Base44](https://base44.com):

- Deal-model app — Sponsor, Spv, Investor, Subscription, KycSession, ComplianceRecord, FormationStage
- Factory ops app — entity schemas, backend functions, workflows
- Cross-app reads for covenant monitoring and investor onboarding
- Factory functions cannot write deal-model entities

## Key design decisions

| Decision | Choice | Rationale |
|---|---|---|
| Default series type | Protected | No incremental state filing lag. 72-hour funding-readiness still subject to EIN, banking, eligibility, state processing, and counsel review. |
| Ledger model | Hash-chained append-only *convention* | Detective hash chain. Isolation still requires statutory notice, LLC-agreement authority, and separate books, records, and accounts. |
| KYC/AML | Intended Sumsub | Not wired in this repo |
| Alert channels | Slack + WhatsApp + Telegram (intended) | Not wired in this repo |
| EIN rotation | Pooled responsible parties | IRS online 1 EIN / responsible party / day |
| First-sale tracking | Irrevocable contractual commitment only | Soft circle ≠ first sale. Bank receipt ≠ first sale. E-sign SIGNED ≠ first sale. |

## Repo structure
