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
schemas/constants.ts          (shared enums — imported by schemas and functions)
schemas/entity-definitions.ts
functions/                    (operational engine — LICENSE-PROPRIETARY)
functions/_shared/            (auth, validation, hash chain, first-sale rules, tests)
workflows/README.md
deno.json                     (fmt / lint / check / test tasks)

## Status

Formation gate, ledger append and verification, EIN rotation, Form D timestamps, and capital-call create exist as source in this dump. Runtime lives on Base44.

Controls in source:

- Every function requires a Base44 service token or a user whose role is in `DIBS_FUNCTION_ALLOWED_ROLES` (default `admin`).
- Only `IRREVOCABLE_COMMITMENT` starts the Form D clock, measured from the caller-supplied `committed_at`.
- Ledger entries carry a `sequence` and a documented hash preimage; concurrent appends onto the same head are detected and reported as `LEDGER_FORK`. `verifySeriesLedger` recomputes a whole chain.
- Escalations are cleared by appending `ESCALATION_RESOLVED`, never by editing the ledger.
- Responsible-party claims use the IRS Eastern calendar day, an optimistic claim token, and are idempotent per SPV through `EINRequest`.

Control gaps that remain: Base44 has no transactions, so fork and claim detection is post-write rather than preventive; RLS is platform configuration and is not enforced here.

## Local checks

Requires Deno 2.x. The same tasks run in CI (`.github/workflows/deno.yml`).

```
deno task ci        # fmt --check, lint, type check, unit tests
deno task test      # unit tests only
```

Functions import shared code from `functions/_shared/` and `schemas/constants.ts`. If the Base44 deployment target only accepts single-file functions, bundle before upload rather than copying the shared code into each file.

Phase 3 pack (document generate + e-sign) is not in this repository. All Rights Reserved.

Connectors (IRS, EDGAR, Sumsub, bank, e-sign vendor) are specified, not shipped here.

## Active workflows (documented)

DIBS Covenant Monitor — Hourly — LTV, milestones, KYC, OFAC, Form D — writes AlertLog

Form D Deadline Tracker — Daily 8am UTC — Operational +15 calendar-day clock. Not counsel's Rule 503 calendar.

SPV Formation Pipeline — Every 15 min — Stage hops behind checkFormationGate (statutory gate + unresolved escalations)

Investor Onboarding Monitor — Hourly — KYC escalation, capital calls, first-sale

## License

Dual license. See NOTICE.md, LICENSE-MIT, and LICENSE-PROPRIETARY.

Docs and published demonstration UI: MIT.

functions/, schemas/, Phase 3 pack, legal templates, private services: All Rights Reserved, DIBS Financial.
