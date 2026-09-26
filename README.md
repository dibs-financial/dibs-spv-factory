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

Built on Lovable (Lovable Cloud, which runs on Supabase):

- Postgres schema — `supabase/migrations/` is the canonical data model (tables, enums, constraints, RLS)
- Edge Functions — `supabase/functions/<name>/index.ts` (Deno) are the operational engine
- Frontend — the Lovable app calls the functions with `supabase.functions.invoke(...)`
- Schedules — pg_cron jobs call the functions with the service-role key (see `workflows/README.md`)
- Deal-model tables (Sponsor, Spv, Investor, Subscription, KycSession, ComplianceRecord, FormationStage) live in the same database but are not defined in this repository; factory functions never write them

Integrity that used to be approximated in application code is now enforced by the database: the ledger is append-only by trigger, has one head per SPV by unique constraint, exactly one ACTIVE master entity, one Form D filing per SPV, one open EIN request per SPV, one capital call per subscription, and no deal put on the 72-hour track while fewer than three EIN signatories are available.

## Key design decisions

Default series type: Protected. No incremental state filing lag. 72-hour funding-readiness still subject to EIN, banking, eligibility, state processing, and counsel review.

Ledger model: Hash-chained append-only convention. Detective hash chain. Isolation still requires statutory notice, LLC-agreement authority, and separate books, records, and accounts.

KYC/AML: Intended Sumsub. Not wired in this repo.

Alert channels: Slack + WhatsApp + Telegram (intended). Not wired in this repo.

EIN rotation: Pooled responsible parties. IRS online 1 EIN / responsible party / day.

First-sale tracking: Irrevocable contractual commitment only. Soft circle is not a first sale. Bank receipt is not a first sale. E-sign SIGNED is not a first sale.

## Repo structure

NOTICE.md, LICENSE, LICENSE-MIT, LICENSE-PROPRIETARY, CONTRIBUTING.md, SECURITY.md
docs/                                   (docs/api.md endpoint reference; docs/pricing.md revenue streams)
schemas/constants.ts                    (shared enums — imported by functions; mirrored by the migration)
schemas/types.ts                        (row types for the tables, FeeSchedule shape)
schemas/pricing.ts                      (tier defaults for deal_configurations.fee_schedule)
supabase/migrations/                    (canonical schema — LICENSE-PROPRIETARY)
supabase/functions/<name>/index.ts      (operational engine — LICENSE-PROPRIETARY)
supabase/functions/dibs-*/index.ts      (the five scheduled runners; see workflows/README.md)
supabase/functions/_shared/             (auth, validation, hash chain, first-sale rules, tests)
supabase/functions/.env.example         (Lovable Cloud secrets manifest)
scripts/lovable-secrets.sh              (sets the secrets with the Supabase CLI)
workflows/README.md
deno.json                               (fmt / lint / check / test tasks)

## Status

Formation gate, ledger append and verification, EIN rotation, Form D timestamps, capital-call create, and the four scheduled runners (covenant monitor, Form D tracker, formation pipeline, investor onboarding monitor) exist as source in this dump. Runtime is Lovable Cloud (Supabase).

Controls in source:

- Every function requires the Supabase service-role key or a user JWT whose `user_roles` row is in `DIBS_FUNCTION_ALLOWED_ROLES` (default `admin`).
- Only `IRREVOCABLE_COMMITMENT` starts the Form D clock, measured from the caller-supplied `committed_at`.
- Ledger entries carry a `sequence` and a documented hash preimage. Unique constraints make a fork impossible; a losing writer retries behind the winner. A trigger rejects UPDATE and DELETE. `verifySeriesLedger` recomputes a whole chain.
- Escalations are cleared by appending `ESCALATION_RESOLVED`, never by editing the ledger.
- Responsible-party claims are a single conditional UPDATE on the IRS Eastern calendar day and are idempotent per SPV through `ein_requests`.
- RLS is enabled on every table: admins have full access, compliance reviewers and counsel can read the evidence tables, and edge functions write as the service role after authorising the caller.

## Local checks

Requires Deno 2.x. The same tasks run in CI (`.github/workflows/deno.yml`).

```
deno task ci        # fmt --check, lint, type check, unit tests
deno task test      # unit tests only
```

## Deploying on Lovable

1. Apply `supabase/migrations/20260921000000_dibs_spv_factory.sql` (Lovable Cloud applies migrations from `supabase/migrations/` automatically; with the CLI use `supabase db push`).
2. Deploy the functions: `supabase functions deploy` deploys every folder under `supabase/functions/`. `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.
3. Set the factory secrets listed in `supabase/functions/.env.example` (`SPVFACTORY_BASE_URL`, `SPVFACTORY_API_KEY`, `SPVFACTORY_TENANT_ID`, `SPVFACTORY_ENV`, `DIBS_FUNCTION_ALLOWED_ROLES`, and in production `DIBS_CORS_ORIGINS`) under Cloud → Secrets in Lovable, or run `scripts/lovable-secrets.sh <project-ref>` with a Supabase access token. Confirm with a call to `factoryInfo`.
4. Grant operators a role: insert into `public.user_roles (user_id, role)`.
5. Create the five pg_cron schedules with the SQL in `workflows/README.md`; they call the `dibs-*` runner functions with the service-role key.

Functions share code through `supabase/functions/_shared/`, which the Supabase bundler includes automatically.

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

supabase/, schemas/, Phase 3 pack, legal templates, private services: All Rights Reserved, DIBS Financial.
