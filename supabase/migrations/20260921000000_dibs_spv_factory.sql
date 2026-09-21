-- DIBS SPV Factory — canonical schema for Lovable Cloud (Supabase / Postgres).
--
-- Enumerations mirror schemas/constants.ts. Keep both in sync.
-- Integrity that the application previously had to approximate is enforced here:
--   * series_registry_log is append-only (trigger rejects UPDATE/DELETE)
--   * one ledger head per SPV: unique (spv_id, previous_hash) and (spv_id, sequence)
--   * exactly one ACTIVE master entity
--   * one form_d_filings row per SPV
--   * one open ein_requests row per SPV
--   * one capital call per (spv_id, investor_id, subscription_id)

-- ---------------------------------------------------------------------------
-- Roles (Lovable convention: user_roles table + has_role() security definer)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'operator', 'compliance_reviewer', 'counsel');
  end if;
end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

drop policy if exists "users read own roles" on public.user_roles;
create policy "users read own roles" on public.user_roles
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "admins manage roles" on public.user_roles;
create policy "admins manage roles" on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.master_entity_status as enum ('ACTIVE', 'AMENDMENT_PENDING', 'INACTIVE');

create type public.ledger_event_type as enum (
  'SERIES_CREATED', 'EIN_REQUESTED', 'EIN_RECEIVED', 'BANK_PROVISIONED',
  'DOCS_GENERATED', 'DOCS_EXECUTED', 'KYC_BATCH_STARTED', 'KYC_PASS', 'KYC_FAIL',
  'CAPITAL_CALL_ISSUED', 'CAPITAL_RECEIVED', 'FORM_D_FILED', 'BLUE_SKY_FILED',
  'STATE_CHANGE', 'ESCALATION', 'ESCALATION_RESOLVED', 'INVESTOR_INVITED',
  'SUBSCRIPTION_SENT', 'SUBSCRIPTION_EXECUTED', 'FIRST_SALE_RECORDED', 'AMENDMENT', 'WIND_DOWN'
);

create type public.alert_type as enum (
  'LTV_BREACH', 'MILESTONE_OVERDUE', 'KYC_EXCEPTION', 'OFAC_FLAG', 'FORM_D_OVERDUE',
  'BLUE_SKY_OVERDUE', 'EIN_FAILURE', 'WIRE_FAILURE', 'LEDGER_FORK',
  'COMPLIANCE_CHECK_PASS', 'ESCALATION'
);
create type public.alert_severity as enum ('INFO', 'WARNING', 'CRITICAL');

create type public.ein_request_status as enum ('PENDING', 'ISSUED', 'FAILED', 'THROTTLED', 'MANUAL_REQUIRED');
create type public.ein_submission_channel as enum ('ONLINE', 'PHONE', 'FAX', 'MAIL');
create type public.responsible_party_status as enum ('AVAILABLE', 'USED_TODAY', 'EXHAUSTED', 'INACTIVE');

create type public.bank_account_status as enum ('PENDING', 'PROVISIONAL', 'ACTIVE', 'FROZEN', 'CLOSED');
create type public.capital_call_wire_status as enum ('ISSUED', 'PENDING', 'RECEIVED', 'OVERDUE', 'FAILED');

create type public.form_d_status as enum ('NOT_REQUIRED', 'PENDING', 'FILED', 'OVERDUE', 'REJECTED');
create type public.blue_sky_status as enum ('PENDING', 'FILED', 'OVERDUE', 'NOT_REQUIRED');

create type public.document_type as enum (
  'SERIES_SCHEDULE', 'SUBSCRIPTION_AGREEMENT', 'AMENDMENT', 'CERTIFICATE', 'SIDE_LETTER',
  'INVESTOR_QUESTIONNAIRE', 'ACCREDITATION_PACKAGE', 'RISK_DISCLOSURE', 'FEE_WATERFALL_SCHEDULE',
  'CAPITAL_CALL_NOTICE', 'SIGNATURE_PACKET', 'COMPLIANCE_FILING'
);
create type public.document_status as enum ('GENERATED', 'SENT_FOR_SIGNATURE', 'EXECUTED', 'EXPIRED', 'BLOCKED');
create type public.structure_type as enum ('SINGLE_ASSET', 'ROLLING_FUND', 'MULTI_CLOSE');
create type public.series_type as enum ('PROTECTED', 'REGISTERED');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- LAYER 1 — Master entity
-- ---------------------------------------------------------------------------
create table public.master_entities (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  delaware_entity_id text,
  formation_date timestamptz,
  -- § 18-215(b) statutory notice present in Certificate of Formation
  has_liability_notice boolean not null default false,
  certificate_file_uri text,
  certificate_of_formation_hash text,
  liability_notice_verified_at timestamptz,
  registered_agent_id text,
  operating_agreement_version text,
  amendment_count integer not null default 0,
  last_amendment_date timestamptz,
  status public.master_entity_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.master_entities is 'Single Delaware Series LLC master record. Exactly one ACTIVE row may exist.';
create unique index master_entities_one_active on public.master_entities ((true)) where status = 'ACTIVE';
create trigger master_entities_updated_at before update on public.master_entities
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- LAYER 2 — Series registry log (append-only, hash-chained)
-- ---------------------------------------------------------------------------
create table public.series_registry_log (
  id uuid primary key default gen_random_uuid(),
  spv_id text not null,
  series_id text,
  event_type public.ledger_event_type not null,
  event_data jsonb not null default '{}'::jsonb,
  -- SHA-256(previous_hash|spv_id|event_type|event_timestamp|canonical_json(event_data))
  hash text not null,
  previous_hash text not null,
  -- exact ISO-8601 string used in the hash preimage; kept as text so it round-trips byte-for-byte
  event_timestamp text not null,
  sequence integer not null check (sequence > 0),
  actor text not null default 'system',
  actor_role text,
  source_system text not null default 'factory',
  correlation_id text,
  created_at timestamptz not null default now(),
  unique (spv_id, sequence),
  unique (spv_id, previous_hash),
  unique (spv_id, hash)
);
comment on table public.series_registry_log is
  'Tamper-evident append-only operational event log (detective evidence). Not a substitute for the separate books, records and accounts required under 6 Del. C. § 18-215(b).';
create index series_registry_log_spv_seq on public.series_registry_log (spv_id, sequence desc);

create or replace function public.forbid_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'series_registry_log is append-only; % is not permitted', tg_op
    using errcode = 'restrict_violation';
end;
$$;
create trigger series_registry_log_append_only
  before update or delete on public.series_registry_log
  for each row execute function public.forbid_ledger_mutation();

-- ---------------------------------------------------------------------------
-- MONITORING — Alert log (write-only for the covenant monitor)
-- ---------------------------------------------------------------------------
create table public.alert_log (
  id uuid primary key default gen_random_uuid(),
  spv_id text not null,
  alert_type public.alert_type not null,
  severity public.alert_severity not null,
  covenant_type text,
  evidence jsonb not null default '{}'::jsonb,
  deal_id text,
  recommended_action text,
  escalated_to text,
  channels_sent text[] not null default '{}',
  acknowledged boolean not null default false,
  acknowledged_at timestamptz,
  acknowledged_by text,
  created_at timestamptz not null default now()
);
create index alert_log_spv_created on public.alert_log (spv_id, created_at desc);

-- ---------------------------------------------------------------------------
-- LAYER 2/4 — EIN requests and responsible-party pool
-- ---------------------------------------------------------------------------
create table public.responsible_parties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  ein_used_today boolean not null default false,
  -- IRS (America/New_York) calendar date of last use
  last_used_date date,
  ein_count_this_month integer not null default 0,
  status public.responsible_party_status not null default 'AVAILABLE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.responsible_parties is 'Pooled SS-4 signatories. IRS online limit: 1 EIN per responsible party per Eastern calendar day.';
create trigger responsible_parties_updated_at before update on public.responsible_parties
  for each row execute function public.set_updated_at();

create table public.ein_requests (
  id uuid primary key default gen_random_uuid(),
  spv_id text not null,
  responsible_party text not null,
  responsible_party_id uuid references public.responsible_parties (id),
  request_date timestamptz,
  ein text,
  status public.ein_request_status not null default 'PENDING',
  irs_confirmation_ref text,
  ss4_payload_version text,
  submission_channel public.ein_submission_channel,
  submission_at timestamptz,
  exception_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- at most one open request per SPV: makes getNextResponsibleParty idempotent per SPV
create unique index ein_requests_one_open_per_spv on public.ein_requests (spv_id) where status in ('PENDING', 'ISSUED');
create trigger ein_requests_updated_at before update on public.ein_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- LAYER 3 — Financial segregation
-- ---------------------------------------------------------------------------
create table public.bank_sub_accounts (
  id uuid primary key default gen_random_uuid(),
  spv_id text not null,
  bank_partner text,
  account_number_masked text,
  routing_number text,
  account_status public.bank_account_status not null default 'PENDING',
  fdic_insured boolean not null default true,
  sweep_network_id text,
  provisioned_at timestamptz,
  current_balance numeric(18, 2) not null default 0,
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bank_sub_accounts_spv on public.bank_sub_accounts (spv_id);
create trigger bank_sub_accounts_updated_at before update on public.bank_sub_accounts
  for each row execute function public.set_updated_at();

create table public.capital_calls (
  id uuid primary key default gen_random_uuid(),
  spv_id text not null,
  subscription_id text not null,
  investor_id text not null,
  call_amount numeric(18, 2) not null check (call_amount >= 0),
  call_date timestamptz not null default now(),
  due_date timestamptz,
  wire_status public.capital_call_wire_status not null default 'ISSUED',
  wire_confirmation_ref text,
  received_amount numeric(18, 2) not null default 0,
  received_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (spv_id, investor_id, subscription_id)
);
create trigger capital_calls_updated_at before update on public.capital_calls
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- LAYER 4 — Compliance and filing
-- ---------------------------------------------------------------------------
create table public.form_d_filings (
  id uuid primary key default gen_random_uuid(),
  spv_id text not null unique,
  cik text,
  offering_amount numeric(18, 2),
  -- equals irrevocable_commitment_at; the only event that starts the clock
  first_sale_date timestamptz,
  -- first_sale_date + 15 calendar days (operational clock, not counsel's Rule 503 calendar)
  filing_deadline timestamptz,
  filed_date timestamptz,
  edgar_accession_number text,
  status public.form_d_status not null default 'NOT_REQUIRED',
  soft_circle_at timestamptz,            -- NOT a first sale
  subscription_sent_at timestamptz,
  subscription_signed_at timestamptz,    -- NOT a first sale
  irrevocable_commitment_at timestamptz,
  funds_received_at timestamptz,         -- NOT a first sale
  funds_cleared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger form_d_filings_updated_at before update on public.form_d_filings
  for each row execute function public.set_updated_at();

create table public.blue_sky_filings (
  id uuid primary key default gen_random_uuid(),
  spv_id text not null,
  jurisdiction text not null,
  investor_id text,
  filing_type text,
  status public.blue_sky_status not null default 'PENDING',
  filed_date timestamptz,
  fee_amount numeric(18, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index blue_sky_filings_spv on public.blue_sky_filings (spv_id);
create trigger blue_sky_filings_updated_at before update on public.blue_sky_filings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- LAYER 5 — Documents and deal configuration
-- ---------------------------------------------------------------------------
create table public.document_sets (
  id uuid primary key default gen_random_uuid(),
  spv_id text not null,
  document_type public.document_type not null,
  template_id text,
  template_version text,
  generated_hash text,
  storage_uri text,
  status public.document_status not null default 'GENERATED',
  executed_at timestamptz,
  structure_type public.structure_type,
  formation_event_id uuid references public.series_registry_log (id),
  external_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index document_sets_spv on public.document_sets (spv_id);
create trigger document_sets_updated_at before update on public.document_sets
  for each row execute function public.set_updated_at();

create table public.deal_configurations (
  id uuid primary key default gen_random_uuid(),
  spv_id text not null unique,
  deal_id text,
  sponsor_id text,
  asset_type text,
  asset_location text,
  purchase_price numeric(18, 2),
  target_raise numeric(18, 2),
  minimum_raise numeric(18, 2),
  maximum_raise numeric(18, 2),
  offering_exemption text,
  investor_type text,
  fee_schedule jsonb not null default '{}'::jsonb,
  waterfall_configuration jsonb not null default '{}'::jsonb,
  closing_conditions jsonb not null default '{}'::jsonb,
  structure_type public.structure_type,
  series_type public.series_type not null default 'PROTECTED',
  close_target_date timestamptz,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger deal_configurations_updated_at before update on public.deal_configurations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
-- Edge functions write with the service role (bypasses RLS) after authorising
-- the caller themselves. Direct client access is admin-only for now; per-SPV
-- sponsor access can be layered on with policies keyed on spv_id.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'master_entities', 'series_registry_log', 'alert_log', 'responsible_parties', 'ein_requests',
    'bank_sub_accounts', 'capital_calls', 'form_d_filings', 'blue_sky_filings', 'document_sets',
    'deal_configurations'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "admins full access" on public.%I for all to authenticated using (public.has_role(auth.uid(), ''admin'')) with check (public.has_role(auth.uid(), ''admin''))',
      t
    );
  end loop;
end $$;

-- Read access for compliance reviewers and counsel on the evidence tables.
create policy "reviewers read ledger" on public.series_registry_log for select to authenticated
  using (public.has_role(auth.uid(), 'compliance_reviewer') or public.has_role(auth.uid(), 'counsel'));
create policy "reviewers read alerts" on public.alert_log for select to authenticated
  using (public.has_role(auth.uid(), 'compliance_reviewer') or public.has_role(auth.uid(), 'counsel'));
create policy "reviewers read form d" on public.form_d_filings for select to authenticated
  using (public.has_role(auth.uid(), 'compliance_reviewer') or public.has_role(auth.uid(), 'counsel'));
