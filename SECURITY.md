# Security Policy

## Reporting

Email security findings to dibsonprivatebanking@gmail.com. Do not open a public
issue for a live control-plane, auth, or PII defect.

This repository is an open-core dump. Runtime lives on Lovable Cloud (Supabase).
A report against source here is not a report against a production project
unless you say so.

## What this dump does enforce

- Factory functions run through `serveFunction`: CORS, JSON-body parse, uniform
  errors, and `requireCaller`. Callers must present the Supabase service-role
  key or a user JWT whose `user_roles` row is in `DIBS_FUNCTION_ALLOWED_ROLES`
  (default `admin`). `factoryInfo` admits any signed-in user and returns no keys.
- Functions read and write as the service role only after the caller is
  authorised. Row-level security is enabled on every table in
  `supabase/migrations/`: admins have full access; compliance reviewers and
  counsel can read the ledger, alerts, and Form D filings; nobody else has
  direct table access.
- Unexpected errors return a generic `SYSTEM_ERROR` / "Unexpected error." The
  underlying message is logged, not sent to the client.
- Browser access is limited to the origins in `DIBS_CORS_ORIGINS`. Unset keeps
  `*` for Lovable preview; production must set it.
- `committed_at` on the first-sale clock is rejected when older than the 15-day
  Form D window unless `acknowledge_late: true` is sent, in which case the
  filing is created already `OVERDUE`.
- Series registry events are allowlisted (`LEDGER_EVENT_TYPES`). Human callers
  cannot set `actor` / `actor_role`; those fields come from the authenticated
  user and their roles. Service tokens may label the workflow.
- The ledger is append-only by database trigger (UPDATE and DELETE are
  rejected). Unique constraints on `(spv_id, sequence)` and
  `(spv_id, previous_hash)` make a fork impossible; a losing concurrent writer
  retries behind the winner or receives `409 LEDGER_CONTENTION`.
  `verifySeriesLedger` recomputes the chain. The hash chain is detective
  evidence. It is not a legal-record substitute under 6 Del. C. § 18-215(b).
- Only `IRREVOCABLE_COMMITMENT` starts the Form D clock.
- Escalations clear only by appending `ESCALATION_RESOLVED`.
- `OFAC_FLAG` and `CRITICAL` AlertLog rows require a service token. The five
  scheduled runners (`dibs-*`) accept only the service-role token and act on
  every SPV; every state change they make is a ledger event under their own
  name, and they raise alerts through the same path as `logAlert`.
- Billing is derived, never authored: `dibs-billing` writes `billing_events`
  only from recorded facts, every row carries a unique `source_ref`, amounts
  are flat fees from the fee schedule, and the runner never marks anything
  invoiced or paid. `billing_events` is admin-only under RLS.
- Responsible-party claims are a single conditional UPDATE, so two callers can
  never take the same SS-4 signatory. EIN assignment responses return
  `responsible_party_id` and `name`, not email.

## What this dump does not enforce

- Factory functions do not read deal-model tables (Sponsor / Spv / Investor /
  Subscription); those tables are not defined in this repository. Capital-call
  amounts and KYC/subscription eligibility are supplied by the calling
  workflow, which must apply those checks itself.
- Per-tenant or per-sponsor isolation. Access is by role, not by SPV or
  organisation; `SPVFACTORY_TENANT_ID` is a label, not a boundary.
- The runners can only observe factory tables. LTV, milestone, OFAC and
  KYC-session checks need deal-model rows or connectors and are reported as
  `skipped` in every run summary rather than silently omitted.
- Connectors (IRS, EDGAR, Sumsub, bank, e-sign) are specified, not shipped.
- Phase 3 (document generate + e-sign) is not in this repository.

## Secrets and PII

Do not commit `.env`, the service-role key, SS-4 payloads, investor KYC
packages, or counsel templates. See `.gitignore` and CONTRIBUTING.md.
`supabase/functions/.env.example` lists secret names only.

The service-role key must never reach a browser or client app. Frontends use
the anon key plus the user's JWT.

Responsible-party email is stored on `responsible_parties` for EIN rotation.
It is not returned by `getNextResponsibleParty`.
