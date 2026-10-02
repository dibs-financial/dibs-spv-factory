-- Seed for src/lib/overview-data.integration.test.ts. Admin user 1111…, no-role user 2222…
insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
insert into public.user_roles (user_id, role) values ('11111111-1111-1111-1111-111111111111', 'admin');
insert into public.master_entities (legal_name, has_liability_notice, status) values ('DIBS Test Master LLC', true, 'ACTIVE');
-- 1,005 pipeline rows so paging past 1,000 is exercised
insert into public.spv_pipeline (spv_id, stage, last_transition_at)
  select 'SPV-' || lpad(g::text, 4, '0'), 'INVESTOR_READY', now() - interval '400 days' from generate_series(1, 1000) g;
insert into public.spv_pipeline (spv_id, stage, stage_before_hold, hold_reason, wait_reason, last_transition_at) values
  ('SPV-A', 'BLOCKED', 'DOCS_PENDING', 'gate: ESCALATION_OPEN', null, now() - interval '4 days'),
  ('SPV-B', 'EIN_PENDING_MANUAL', 'EIN_PENDING', 'SS-4 by fax', null, now() - interval '2 days'),
  ('SPV-C', 'KYC_BATCH_PENDING', null, null, null, now() - interval '3 hours'),
  ('SPV-D', 'INVESTOR_READY', null, null, null, now() - interval '1 hour'),
  ('SPV-E', 'DOCS_PENDING', null, null, 'awaiting SUBSCRIPTION_AGREEMENT', now() - interval '1 day');
insert into public.deal_configurations (spv_id, deal_id, fee_schedule) values
  ('SPV-C', 'DEAL-C', '{"rush_track": true}'), ('SPV-A', 'DEAL-A', '{}');
insert into public.alert_log (spv_id, alert_type, severity, recommended_action, acknowledged) values
  ('SPV-X', 'FORM_D_OVERDUE', 'CRITICAL', 'Counsel to file now.', false),
  ('SPV-A', 'KYC_EXCEPTION', 'WARNING', 'Human review.', false),
  ('SPV-B', 'EIN_FAILURE', 'WARNING', null, false),
  ('SPV-C', 'WIRE_FAILURE', 'INFO', null, true);
insert into public.form_d_filings (spv_id, status, filing_deadline) values
  ('SPV-C', 'PENDING', now() + interval '3 days'), ('SPV-E', 'PENDING', now() + interval '10 days'), ('SPV-X', 'OVERDUE', now() - interval '1 day');
insert into public.responsible_parties (name, status, last_used_date) values
  ('a', 'AVAILABLE', null), ('b', 'AVAILABLE', null), ('c', 'USED_TODAY', (now() at time zone 'America/New_York')::date - 1),
  ('d', 'USED_TODAY', (now() at time zone 'America/New_York')::date), ('e', 'INACTIVE', null);
insert into public.billing_events (spv_id, charge_type, tier, tier_source, unit_amount, amount, description, source_ref, occurred_at) values
  ('SPV-C', 'FORMATION', 'SPONSOR', 'deal', 3500, 3500, 'Series formation', 'ledger:x1', now()),
  ('SPV-C', 'ONBOARDING', 'SPONSOR', 'deal', 95, 95, 'Investor onboarding', 'ledger:x2', now());
insert into public.series_registry_log (spv_id, event_type, hash, previous_hash, event_timestamp, sequence) values
  ('SPV-C', 'SERIES_CREATED', 'aaaa000000000000000000000000000000000000000000000000000000001111', 'GENESIS', '2026-09-20T00:00:00.000Z', 1),
  ('SPV-C', 'KYC_PASS', 'bbbb00000000000000000000000000000000000000000000000000000000beef', 'aaaa000000000000000000000000000000000000000000000000000000001111', '2026-09-21T00:00:00.000Z', 2);
