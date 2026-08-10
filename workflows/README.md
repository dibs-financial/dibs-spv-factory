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
