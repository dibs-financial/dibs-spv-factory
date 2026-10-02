# Workflow Definitions

The four schedules run as pg_cron jobs in Lovable Cloud (Supabase). Each job calls a runner edge function with the service-role key; the runners accept nothing else (a user JWT gets `403 SERVICE_TOKEN_REQUIRED`). Each returns a run summary for the cron log.

## One-time setup

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- keep the key out of the job definitions
alter database postgres set app.settings.service_role_key = '<service-role-key>';
alter database postgres set app.settings.functions_url = 'https://<project-ref>.supabase.co/functions/v1';

create or replace function public.invoke_factory_runner(runner text)
returns bigint language sql as $$
  select net.http_post(
    url := current_setting('app.settings.functions_url', true) || '/' || runner,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
$$;

select cron.schedule('dibs-covenant-monitor',            '0 * * * *',   $$select public.invoke_factory_runner('dibs-covenant-monitor')$$);
select cron.schedule('dibs-form-d-deadline-tracker',     '0 8 * * *',   $$select public.invoke_factory_runner('dibs-form-d-deadline-tracker')$$);
select cron.schedule('dibs-spv-formation-pipeline',      '*/15 * * * *', $$select public.invoke_factory_runner('dibs-spv-formation-pipeline')$$);
select cron.schedule('dibs-investor-onboarding-monitor', '0 * * * *',   $$select public.invoke_factory_runner('dibs-investor-onboarding-monitor')$$);
select cron.schedule('dibs-billing',                     '30 1 * * *',  $$select public.invoke_factory_runner('dibs-billing')$$);
```

Check runs with `select * from cron.job_run_details order by start_time desc limit 20;`.

## dibs-covenant-monitor — hourly
Read-only on every table except `alert_log`. Never approves, waives, or modifies covenant status.

| Check | Source | Alert |
|---|---|---|
| Statutory gate: zero, several, or notice-less ACTIVE master | `master_entities` | CRITICAL `ESCALATION` (spv_id `MASTER`) |
| Form D deadline passed since the daily tracker | `form_d_filings` PENDING | CRITICAL `FORM_D_OVERDUE` |
| Blue-sky notice marked OVERDUE | `blue_sky_filings` | WARNING `BLUE_SKY_OVERDUE` |
| EIN request FAILED / THROTTLED / MANUAL_REQUIRED | `ein_requests` | WARNING `EIN_FAILURE` |
| LTV, milestones, OFAC | deal-model tables, not in this repo | reported under `skipped` |

Alerts are deduplicated against an unacknowledged alert of the same type and severity for the SPV. A run with no findings writes one INFO `COMPLIANCE_CHECK_PASS`.

## dibs-form-d-deadline-tracker — daily 08:00 UTC
Operational 15-calendar-day clock, not counsel's Rule 503 calendar. Never files anything.

- Day 10 or later: WARNING `FORM_D_OVERDUE` (approaching).
- Past the deadline: `form_d_filings.status` PENDING → OVERDUE, `STATE_CHANGE` ledger event, CRITICAL `FORM_D_OVERDUE` escalated to counsel.

## dibs-spv-formation-pipeline — every 15 minutes
Keeps the factory-side stage in `spv_pipeline` (migration `20260921010000_spv_pipeline.sql`). An SPV is enrolled at INTAKE the first time a ledger event is written for it.

Before every evaluation the formation gate runs (`_shared/gate.ts`: exactly one ACTIVE master with the § 18-215(b) notice, no unresolved escalation). A failing gate moves the SPV to BLOCKED, remembers its stage, and raises a CRITICAL `ESCALATION`; when the gate passes again the SPV returns to that stage. An escalation is cleared only by appending `ESCALATION_RESOLVED`.

Stage transitions (`_shared/pipeline.ts`), each recorded as a `STATE_CHANGE` ledger event:

| From | To | When |
|---|---|---|
| INTAKE | SERIES_CREATED | `SERIES_CREATED` ledger event exists |
| SERIES_CREATED | EIN_PENDING | an `ein_requests` row exists (from `getNextResponsibleParty`) |
| EIN_PENDING | EIN_RECEIVED | request ISSUED with an EIN |
| EIN_PENDING | EIN_PENDING_MANUAL (hold) | request FAILED or MANUAL_REQUIRED |
| EIN_PENDING_MANUAL | EIN_RECEIVED | request later ISSUED |
| EIN_RECEIVED | BANK_PENDING | automatic |
| BANK_PENDING | BANK_READY | `bank_sub_accounts` ACTIVE or PROVISIONAL |
| BANK_READY | DOCS_PENDING | automatic |
| DOCS_PENDING | DOCS_EXECUTED | SERIES_SCHEDULE and SUBSCRIPTION_AGREEMENT both EXECUTED |
| DOCS_EXECUTED | KYC_BATCH_PENDING | automatic |
| KYC_BATCH_PENDING | KYC_COMPLETE | latest KYC ledger event is `KYC_PASS` (`KYC_FAIL` waits for human review) |
| KYC_COMPLETE | CAPITAL_CALL_PENDING | automatic |
| CAPITAL_CALL_PENDING | CAPITAL_RECEIVED | at least one capital call and all RECEIVED |
| CAPITAL_RECEIVED | REGULATORY_PENDING | automatic |
| REGULATORY_PENDING | INVESTOR_READY | Form D FILED or NOT_REQUIRED and no PENDING/OVERDUE blue-sky filing |

The runner observes; it never creates series, EINs, bank accounts, documents, or capital calls. The reason an SPV is waiting is stored in `spv_pipeline.wait_reason`. Up to five transitions are applied per run so the automatic stages do not take an hour to cross.

## dibs-investor-onboarding-monitor — hourly

| Check | Action |
|---|---|
| Capital call ISSUED/PENDING past `due_date` | `wire_status` → OVERDUE, `STATE_CHANGE` ledger event, WARNING `WIRE_FAILURE` |
| `KYC_FAIL` ledger event with no later `KYC_PASS` for the same `investor_id` | WARNING `KYC_EXCEPTION` escalated to compliance review |
| `funds_received_at` set but no `irrevocable_commitment_at` | WARNING `ESCALATION`: bank receipt is never inferred to be a first sale; a human must call `triggerFirstSaleClock` with the real `committed_at` |
| OFAC, KYC sessions | deal-model tables / connectors not in this repo; reported under `skipped` |

## dibs-billing — daily 01:30 UTC
Turns recorded facts into `billing_events` rows (migration `20260921020000_billing.sql`). Fee schedule per SPV comes from `deal_configurations.fee_schedule`, falling back to the tier default (SPONSOR) and flagged in the run summary under `default_tier_spvs`.

| Charge | Source | Idempotency key |
|---|---|---|
| FORMATION or RUSH_FORMATION | first `SERIES_CREATED` ledger event per SPV | `ledger:<entry id>` |
| ONBOARDING | first `KYC_PASS` per `event_data.investor_id` (a re-verification is not billed again); every `KYC_PASS` without an investor_id | `ledger:<entry id>` |
| FORM_D | `FORM_D_FILED` ledger event | `ledger:<entry id>` |
| BLUE_SKY | `BLUE_SKY_FILED` ledger event | `ledger:<entry id>` |
| ADMINISTRATION | year 0 at formation, each anniversary that has arrived, none after `WIND_DOWN` | `admin:<spv>:<year n>` |
| LATE_FILING_REMEDIATION | `FORM_D_FILED` after a `STATE_CHANGE` to OVERDUE | `late:<filed event id>` |
| EIN_MANUAL_FILING | `ein_requests` ISSUED with a non-ONLINE submission channel | `ein_manual:<request id>` |
| REGISTERED_SERIES_CONVERSION | `deal_configurations.series_type` is REGISTERED, once per SPV, dated from the row's `updated_at` | `registered:<spv>` |
| PLATFORM_LICENSE | each `platform_licenses` row: the annual fee when each license year starts (`start_date` + n years), none starting on or after `end_date` | `license:<license>:<year n>` |
| PLATFORM_ADDITIONAL_SERIES | per license year, one charge for each series beyond `included_series` that was active in that year (linked by `deal_configurations.platform_license_id`, formed before the year or license ended, not wound down before it started) | `license_series:<license>:<year n>:<k>` |

The runner reads the whole billable ledger history on every run, paging past PostgREST's 1,000-row cap, so a formation event keeps earning anniversary fees however old it is and a missed run is caught up on the next. `source_ref` is unique, so re-running never double charges. New rows are PENDING; the view `billing_invoice_feed` is the export for Stripe or any invoicing tool. Marking rows INVOICED or PAID is done by that integration or by hand; the runner never does it and never writes the ledger. License charges carry `platform_license_id` and no `spv_id`. The run summary lists `platform_tier_spvs_without_license` and `licensed_spvs_not_on_platform_tier`: deals configured inconsistently, which ops should fix. AUDIT_PACKAGE is not raised here: `verifySeriesLedger` bills it when called with `audit_package: true` (see `docs/api.md`).

## Guardrails common to all runners
- Only an irrevocable commitment starts the Form D clock; runners never call `triggerFirstSaleClock`.
- Every state change a runner makes is a ledger event with the runner's name as `actor`.
- Runners raise alerts through the same `raiseAlert` path as `logAlert`; nothing else writes `alert_log`.
- Cross-series data is never exposed; runners return counts, not rows.
