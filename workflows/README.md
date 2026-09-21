# Workflow Definitions

The four schedules below run as pg_cron jobs in Lovable Cloud (Supabase) and call the edge functions with the service-role key. The orchestration steps themselves (reading SPVs, deciding which function to call) were agent steps on the previous platform and are not in this repository; each schedule needs a runner function or an external agent that calls the endpoints listed.

Template (run once per schedule in the SQL editor, with the extensions `pg_cron` and `pg_net` enabled):

```sql
select cron.schedule(
  'dibs-covenant-monitor',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/<runner-function>',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Store the service-role key with `alter database postgres set app.settings.service_role_key = '<key>'` rather than pasting it into the job.

## DIBS Covenant Monitor
- **Trigger:** every hour (cron: `0 * * * *`, UTC)
- **Calls:** `logAlert`
- **Scope:** LTV thresholds, milestone deadlines, KYC/AML exceptions, OFAC flags, Form D deadlines
- **Guardrails:** Read-only on all tables except `alert_log`. Never approves, waives, or modifies covenant status.

## Form D Deadline Tracker
- **Trigger:** daily at 8am UTC (cron: `0 8 * * *`)
- **Calls:** `logAlert` after reading `form_d_filings`
- **Escalation:** WARNING at day 10, CRITICAL at day 15+ (overdue). Operational 15-calendar-day clock, not counsel's Rule 503 calendar.

## SPV Formation Pipeline
- **Trigger:** every 15 minutes (cron: `*/15 * * * *`, UTC)
- **Calls:** `checkFormationGate` before every transition, then `getNextResponsibleParty`, `createSeriesLedgerEntry`, `processCapitalCall` as stages require
- **Pipeline stages (14):** INTAKE → SERIES_CREATED → EIN_PENDING → EIN_RECEIVED → BANK_PENDING → BANK_READY → DOCS_PENDING → DOCS_EXECUTED → KYC_BATCH_PENDING → KYC_COMPLETE → CAPITAL_CALL_PENDING → CAPITAL_RECEIVED → REGULATORY_PENDING → INVESTOR_READY, plus hold states BLOCKED, EIN_PENDING_MANUAL, PENDING_STATE_FILING
- **Guardrails:** `checkFormationGate` runs before every transition (statutory gate, exactly one ACTIVE master, no unresolved escalation). Every transition logged to the hash-chain ledger. Escalates on any gate failure; an escalation is cleared only by appending `ESCALATION_RESOLVED`.

## Investor Onboarding Monitor
- **Trigger:** every hour (cron: `0 * * * *`, UTC)
- **Calls:** `triggerFirstSaleClock`, `processCapitalCall`, `logAlert`
- **Guardrails:** KYC/AML hits escalated to human review. Only an irrevocable commitment starts the Form D clock — soft circles, signed subscriptions and bank receipts are recorded as timestamps only. Pass `committed_at` to `triggerFirstSaleClock` so the clock starts at the commitment, not at the monitor run. Cross-series data never exposed.
