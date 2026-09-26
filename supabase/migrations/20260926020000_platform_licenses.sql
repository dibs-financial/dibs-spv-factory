-- DIBS SPV Factory — platform license billing (white-label / API operators).
--
-- docs/pricing.md: 60,000 per year with 25 series included, 2,000 per
-- additional series, one published price, no introductory discounts, and a
-- 24-month price lock for every operator. PLATFORM_LICENSE in
-- schemas/pricing.ts holds the same numbers; keep the two in sync.
--
-- What the database enforces:
--   * a new license is signed at the published price, never below or above it
--     (no introductory discounts, one price for everyone)
--   * price_locked_until is set from start_date (+24 months) and cannot be
--     moved; the price cannot change before that date
--   * each series (deal_configurations row) belongs to at most one license
-- The dibs-billing runner turns licenses into billing_events: the annual fee
-- per license year, and one charge per series beyond the included count.

-- ---------------------------------------------------------------------------
-- Published price
-- ---------------------------------------------------------------------------
create or replace function public.platform_license_published_price(
  out annual_fee numeric,
  out included_series integer,
  out additional_series_fee numeric,
  out price_lock_months integer
)
language sql
immutable
as $$
  select 60000::numeric, 25, 2000::numeric, 24;
$$;
comment on function public.platform_license_published_price() is
  'The one published platform license price (PLATFORM_LICENSE in schemas/pricing.ts).';

-- ---------------------------------------------------------------------------
-- Licenses
-- ---------------------------------------------------------------------------
create type public.platform_license_status as enum ('ACTIVE', 'TERMINATED');

create table public.platform_licenses (
  id uuid primary key default gen_random_uuid(),
  operator_id text not null unique,
  operator_name text not null,
  -- first day of license year 0; each anniversary starts the next year
  start_date date not null,
  -- set when the license ends; no license year starting on or after it is billed
  end_date date,
  annual_fee numeric(18, 2) not null default (public.platform_license_published_price()).annual_fee,
  included_series integer not null default (public.platform_license_published_price()).included_series,
  additional_series_fee numeric(18, 2) not null
    default (public.platform_license_published_price()).additional_series_fee,
  -- start_date + 24 months, set by trigger; price columns are frozen until then
  price_locked_until date not null,
  status public.platform_license_status not null default 'ACTIVE',
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (annual_fee >= 0 and additional_series_fee >= 0 and included_series >= 0),
  check (end_date is null or end_date > start_date),
  check (status = 'ACTIVE' or end_date is not null)
);
comment on table public.platform_licenses is
  'White-label / API operators of the engine. Billed by dibs-billing: annual fee per license year plus overage per series beyond included_series.';
create trigger platform_licenses_updated_at before update on public.platform_licenses
  for each row execute function public.set_updated_at();

create or replace function public.enforce_platform_license_price()
returns trigger
language plpgsql
as $$
declare
  published record;
begin
  published := public.platform_license_published_price();
  if tg_op = 'INSERT' then
    if new.annual_fee <> published.annual_fee
       or new.included_series <> published.included_series
       or new.additional_series_fee <> published.additional_series_fee then
      raise exception using
        errcode = 'check_violation',
        message = 'PLATFORM_LICENSE_PRICE: a license is signed at the published price only',
        detail = format('published: %s per year, %s series included, %s per additional series',
          published.annual_fee, published.included_series, published.additional_series_fee),
        hint = 'One published price, no introductory discounts (docs/pricing.md, Decisions).';
    end if;
    new.price_locked_until := (new.start_date + make_interval(months => published.price_lock_months))::date;
    return new;
  end if;

  if new.start_date is distinct from old.start_date then
    raise exception using errcode = 'check_violation',
      message = 'PLATFORM_LICENSE_START_FIXED: start_date anchors the billing years and the price lock; it cannot change';
  end if;
  if new.price_locked_until is distinct from old.price_locked_until then
    raise exception using errcode = 'check_violation',
      message = 'PLATFORM_LICENSE_LOCK_FIXED: price_locked_until cannot be changed';
  end if;
  if (new.annual_fee, new.included_series, new.additional_series_fee)
       is distinct from (old.annual_fee, old.included_series, old.additional_series_fee)
     and current_date < old.price_locked_until then
    raise exception using
      errcode = 'check_violation',
      message = 'PLATFORM_LICENSE_PRICE_LOCKED: the price cannot change before price_locked_until',
      detail = format('locked until %s', old.price_locked_until);
  end if;
  return new;
end;
$$;

create trigger platform_licenses_price
  before insert or update on public.platform_licenses
  for each row execute function public.enforce_platform_license_price();

alter table public.platform_licenses enable row level security;
create policy "admins full access" on public.platform_licenses for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- Series → license
-- ---------------------------------------------------------------------------
alter table public.deal_configurations
  add column platform_license_id uuid references public.platform_licenses (id);
comment on column public.deal_configurations.platform_license_id is
  'The platform license this series is run under; it counts toward that license''s included series.';
create index deal_configurations_platform_license on public.deal_configurations (platform_license_id)
  where platform_license_id is not null;

-- ---------------------------------------------------------------------------
-- Billing: license charges belong to a license, not an SPV
-- ---------------------------------------------------------------------------
alter type public.billing_charge_type add value if not exists 'PLATFORM_LICENSE';
alter type public.billing_charge_type add value if not exists 'PLATFORM_ADDITIONAL_SERIES';

alter table public.billing_events
  add column platform_license_id uuid references public.platform_licenses (id),
  alter column spv_id drop not null,
  add constraint billing_events_has_subject check (spv_id is not null or platform_license_id is not null);
alter table public.billing_events drop constraint billing_events_tier_source_check;
alter table public.billing_events add constraint billing_events_tier_source_check
  check (tier_source in ('deal', 'default', 'license'));
create index billing_events_platform_license on public.billing_events (platform_license_id, occurred_at desc)
  where platform_license_id is not null;

create or replace view public.billing_invoice_feed with (security_invoker = true) as
  select id, spv_id, deal_id, charge_type, tier, quantity, unit_amount, amount, currency, description,
         period_start, period_end, occurred_at, source_ref, platform_license_id
  from public.billing_events
  where status = 'PENDING'
  order by occurred_at, spv_id;
revoke all on public.billing_invoice_feed from anon;
