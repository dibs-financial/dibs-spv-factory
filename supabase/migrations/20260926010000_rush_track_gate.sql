-- DIBS SPV Factory — the 72-hour track may only be sold while the EIN pool can deliver it.
--
-- docs/pricing.md: offer the rush track only while at least three signatories
-- are AVAILABLE (RUSH_TRACK_MIN_AVAILABLE_SIGNATORIES in schemas/pricing.ts;
-- keep the 3 below in sync). A deal is put on the rush track by setting
-- deal_configurations.fee_schedule.rush_track to true, so the gate is a
-- trigger on that transition: it applies to every writer (Lovable app,
-- service role, SQL console). Deals already on the rush track are not touched
-- by later edits, and turning it off is always allowed.
--
-- Availability matches getNextResponsibleParty, which returns parties to the
-- pool lazily: a party is available if it is AVAILABLE, or USED_TODAY from an
-- earlier IRS (Eastern) day, or EXHAUSTED from an earlier IRS month. INACTIVE
-- parties never count.

create or replace function public.rush_track_available_signatories()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with irs as (select (now() at time zone 'America/New_York')::date as today)
  select count(*)::integer
  from public.responsible_parties p, irs
  where p.status = 'AVAILABLE'
     or (p.status = 'USED_TODAY' and coalesce(p.last_used_date, '-infinity'::date) < irs.today)
     or (p.status = 'EXHAUSTED'
         and coalesce(date_trunc('month', p.last_used_date), '-infinity'::timestamp) < date_trunc('month', irs.today));
$$;
comment on function public.rush_track_available_signatories() is
  'Responsible parties able to sign an SS-4 on the current IRS (Eastern) day. Returns a count only.';

create or replace function public.rush_track_open()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.rush_track_available_signatories() >= 3;
$$;
comment on function public.rush_track_open() is
  'True while the 72-hour track may be offered (at least 3 available signatories; RUSH_TRACK_MIN_AVAILABLE_SIGNATORIES).';

revoke all on function public.rush_track_available_signatories() from public, anon;
revoke all on function public.rush_track_open() from public, anon;
grant execute on function public.rush_track_available_signatories() to authenticated, service_role;
grant execute on function public.rush_track_open() to authenticated, service_role;

create or replace function public.enforce_rush_track_gate()
returns trigger
language plpgsql
as $$
begin
  if new.fee_schedule -> 'rush_track' = 'true'::jsonb
     and (tg_op = 'INSERT' or old.fee_schedule -> 'rush_track' is distinct from 'true'::jsonb)
     and not public.rush_track_open() then
    raise exception using
      errcode = 'check_violation',
      message = 'RUSH_TRACK_UNAVAILABLE: the 72-hour track needs at least 3 available EIN signatories',
      detail = format('available signatories: %s; spv_id: %s', public.rush_track_available_signatories(), new.spv_id),
      hint = 'Offer the standard track, or add or reactivate responsible parties before offering the rush track.';
  end if;
  return new;
end;
$$;

create trigger deal_configurations_rush_track_gate
  before insert or update of fee_schedule on public.deal_configurations
  for each row execute function public.enforce_rush_track_gate();
