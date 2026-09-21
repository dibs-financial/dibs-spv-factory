-- DIBS SPV Factory — billing events written by the dibs-billing runner.
--
-- One row per chargeable occurrence, derived from ledger events, the
-- administration anniversary, EIN requests and Form D history. source_ref is
-- the idempotency key (e.g. ledger:<entry id>, admin:<spv>:<year n>), so the
-- runner can be re-run at any time without double charging. Every amount is a
-- flat fee; nothing here is a percentage of capital raised.

create type public.billing_charge_type as enum (
  'FORMATION', 'RUSH_FORMATION', 'ADMINISTRATION', 'ONBOARDING', 'FORM_D', 'BLUE_SKY',
  'LATE_FILING_REMEDIATION', 'EIN_MANUAL_FILING', 'REGISTERED_SERIES_CONVERSION', 'AUDIT_PACKAGE'
);
create type public.billing_status as enum ('PENDING', 'INVOICED', 'PAID', 'VOID');
create type public.pricing_tier as enum ('SPONSOR', 'FUND', 'PLATFORM');

create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  spv_id text not null,
  deal_id text,
  charge_type public.billing_charge_type not null,
  tier public.pricing_tier not null,
  -- 'deal' when taken from deal_configurations.fee_schedule, 'default' when the tier default was used
  tier_source text not null check (tier_source in ('deal', 'default')),
  quantity integer not null default 1 check (quantity > 0),
  unit_amount numeric(18, 2) not null check (unit_amount >= 0),
  amount numeric(18, 2) not null check (amount >= 0),
  currency text not null default 'USD',
  description text not null,
  -- idempotency key; see runner for the formats
  source_ref text not null unique,
  source_event_id uuid references public.series_registry_log (id),
  period_start date,
  period_end date,
  occurred_at timestamptz not null,
  status public.billing_status not null default 'PENDING',
  invoice_ref text,
  invoiced_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.billing_events is 'Chargeable occurrences derived by dibs-billing; PENDING rows are the invoice feed. source_ref makes every charge idempotent.';
create index billing_events_spv on public.billing_events (spv_id, occurred_at desc);
create index billing_events_status on public.billing_events (status) where status = 'PENDING';
create trigger billing_events_updated_at before update on public.billing_events
  for each row execute function public.set_updated_at();

alter table public.billing_events enable row level security;
create policy "admins full access" on public.billing_events for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- The invoice feed: one row per PENDING charge, oldest first.
create or replace view public.billing_invoice_feed as
  select id, spv_id, deal_id, charge_type, tier, quantity, unit_amount, amount, currency, description,
         period_start, period_end, occurred_at, source_ref
  from public.billing_events
  where status = 'PENDING'
  order by occurred_at, spv_id;
