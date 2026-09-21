-- DIBS SPV Factory — pipeline state for the SPV Formation Pipeline runner.
--
-- The deal-model app that previously held each SPV's stage is not part of this
-- repository, so the factory keeps its own stage record. An SPV is enrolled at
-- INTAKE automatically the first time a ledger event is written for it.

create type public.formation_stage as enum (
  'INTAKE', 'SERIES_CREATED', 'EIN_PENDING', 'EIN_RECEIVED', 'BANK_PENDING', 'BANK_READY',
  'DOCS_PENDING', 'DOCS_EXECUTED', 'KYC_BATCH_PENDING', 'KYC_COMPLETE', 'CAPITAL_CALL_PENDING',
  'CAPITAL_RECEIVED', 'REGULATORY_PENDING', 'INVESTOR_READY',
  'BLOCKED', 'EIN_PENDING_MANUAL', 'PENDING_STATE_FILING'
);

create table public.spv_pipeline (
  spv_id text primary key,
  stage public.formation_stage not null default 'INTAKE',
  -- stage to return to when a BLOCKED / hold state clears
  stage_before_hold public.formation_stage,
  hold_reason text,
  wait_reason text,
  last_transition_at timestamptz,
  last_evaluated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.spv_pipeline is 'Factory-side formation stage per SPV, advanced by the dibs-spv-formation-pipeline runner behind the formation gate.';
create index spv_pipeline_stage on public.spv_pipeline (stage);
create trigger spv_pipeline_updated_at before update on public.spv_pipeline
  for each row execute function public.set_updated_at();

alter table public.spv_pipeline enable row level security;
create policy "admins full access" on public.spv_pipeline for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "reviewers read pipeline" on public.spv_pipeline for select to authenticated
  using (public.has_role(auth.uid(), 'compliance_reviewer') or public.has_role(auth.uid(), 'counsel'));
