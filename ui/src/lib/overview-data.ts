import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import {
  ageLabel,
  alertOrder,
  alertTitle,
  FORM_D_SOON_DAYS,
  formatUsd,
  isRushTrack,
  monthStartUtc,
  pipelineOrder,
  pipelineStatus,
  shortHash,
  signatoryPool,
  severityTone,
  stageStep,
  stageTone,
  type Tone,
} from "@/lib/factory";
import * as sample from "@/lib/sample-data";

export interface Kpi {
  label: string;
  value: string;
  note: string;
  tone: Tone;
}

export interface PipelineRowView {
  spvId: string;
  label: string;
  sublabel: string;
  stage: string;
  stageTone: Tone;
  step: number;
  status: string;
  statusTone: Tone;
  age: string;
  rush: boolean;
}

export interface AlertView {
  id: string;
  severity: string;
  tone: Tone;
  title: string;
  detail: string;
}

export interface OverviewData {
  kpis: Kpi[];
  pipeline: PipelineRowView[];
  pipelineTotal: number;
  alerts: AlertView[];
  alertsOpen: number;
  pool: { available: number; total: number };
  ledger: { head: string | null; sequence: number | null; spvId: string | null; entries: number };
}

export interface NavCounts {
  pipeline: number;
  alerts: number;
  billing: number;
}

const PAGE = 1000;
const n = (x: number) => x.toLocaleString("en-US");
/** Rows the overview table shows; the rest are on the pipeline page. */
const PIPELINE_ROWS_SHOWN = 12;
const ALERTS_SHOWN = 5;

function check<T>(result: { data: T | null; error: PostgrestError | null; count?: number | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

function count(result: { error: PostgrestError | null; count: number | null }): number {
  if (result.error) throw new Error(result.error.message);
  return result.count ?? 0;
}

/** Every row of a query, paging past PostgREST's 1,000-row cap. */
async function selectAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>) {
  const rows: T[] = [];
  for (let from = 0;; from += PAGE) {
    const batch = check(await page(from, from + PAGE - 1)) ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

interface PipelineDbRow {
  spv_id: string;
  stage: string;
  stage_before_hold: string | null;
  hold_reason: string | null;
  wait_reason: string | null;
  last_transition_at: string | null;
  created_at: string;
}

/**
 * Everything the overview shows, read under the signed-in user's RLS
 * (admins see all of it; other roles see what their policies allow).
 */
export async function fetchOverview(db: SupabaseClient, now = new Date()): Promise<OverviewData> {
  const soon = new Date(now.getTime() + FORM_D_SOON_DAYS * 24 * 60 * 60 * 1000);
  const [pipeline, deals, alerts, formDSoon, formDOverdue, invoices, parties, head, entries] = await Promise.all([
    selectAll<PipelineDbRow>((f, t) =>
      db.from("spv_pipeline")
        .select("spv_id,stage,stage_before_hold,hold_reason,wait_reason,last_transition_at,created_at")
        .order("spv_id")
        .range(f, t)
    ),
    selectAll<{ spv_id: string; deal_id: string | null; fee_schedule: unknown }>((f, t) =>
      db.from("deal_configurations").select("spv_id,deal_id,fee_schedule").order("spv_id").range(f, t)
    ),
    db.from("alert_log")
      .select("id,spv_id,alert_type,severity,recommended_action,created_at", { count: "exact" })
      .eq("acknowledged", false)
      .order("created_at", { ascending: false })
      .limit(50),
    db.from("form_d_filings").select("id", { count: "exact", head: true })
      .eq("status", "PENDING")
      .gte("filing_deadline", now.toISOString())
      .lte("filing_deadline", soon.toISOString()),
    db.from("form_d_filings").select("id", { count: "exact", head: true }).eq("status", "OVERDUE"),
    selectAll<{ amount: number | string }>((f, t) =>
      db.from("billing_invoice_feed").select("amount").order("id").range(f, t)
    ),
    selectAll<{ status: string; last_used_date: string | null }>((f, t) =>
      db.from("responsible_parties").select("status,last_used_date").order("id").range(f, t)
    ),
    db.from("series_registry_log").select("spv_id,hash,sequence").order("created_at", { ascending: false })
      .order("sequence", { ascending: false }).limit(1)
      .maybeSingle(),
    db.from("series_registry_log").select("id", { count: "exact", head: true }),
  ]);

  const dealBySpv = new Map(deals.map((d) => [d.spv_id, d]));
  const active = pipeline.filter((p) => p.stage !== "INVESTOR_READY");
  const monthStart = monthStartUtc(now).getTime();
  const readyThisMonth = pipeline.filter((p) =>
    p.stage === "INVESTOR_READY" && p.last_transition_at && new Date(p.last_transition_at).getTime() >= monthStart
  ).length;
  const readyTotal = pipeline.length - active.length;
  const rushActive = active.filter((p) => isRushTrack(dealBySpv.get(p.spv_id)?.fee_schedule)).length;
  const soonCount = count(formDSoon);
  const overdueCount = count(formDOverdue);
  const invoiceTotal = invoices.reduce((sum, r) => sum + Number(r.amount), 0);

  const rows: PipelineRowView[] = pipeline
    .map((p) => ({ p, movedAt: new Date(p.last_transition_at ?? p.created_at).getTime(), stage: p.stage }))
    .sort(pipelineOrder)
    .slice(0, PIPELINE_ROWS_SHOWN)
    .map(({ p }) => {
      const deal = dealBySpv.get(p.spv_id);
      const status = pipelineStatus(p);
      return {
        spvId: p.spv_id,
        label: p.spv_id,
        sublabel: deal?.deal_id ?? "",
        stage: p.stage,
        stageTone: stageTone(p.stage),
        step: stageStep(p.stage, p.stage_before_hold),
        status: status.text,
        statusTone: status.tone,
        age: ageLabel(p.last_transition_at ?? p.created_at, now),
        rush: isRushTrack(deal?.fee_schedule),
      };
    });

  const alertRows = (check(alerts) ?? []) as {
    id: string;
    spv_id: string;
    alert_type: string;
    severity: string;
    recommended_action: string | null;
    created_at: string;
  }[];
  const headRow = check(head) as { spv_id: string; hash: string; sequence: number } | null;

  return {
    kpis: [
      {
        label: "Series in formation",
        value: n(active.length),
        note: `${n(rushActive)} on the 72-hour track`,
        tone: "neutral",
      },
      {
        label: "Investor-ready this month",
        value: n(readyThisMonth),
        note: `${n(readyTotal)} investor-ready in total`,
        tone: "neutral",
      },
      {
        label: `Form D windows ≤ ${FORM_D_SOON_DAYS} days`,
        value: n(soonCount),
        note: overdueCount > 0 ? `${n(overdueCount)} overdue` : "Operational clock, not counsel’s calendar",
        tone: overdueCount > 0 ? "critical" : soonCount > 0 ? "warning" : "neutral",
      },
      {
        label: "Pending invoices",
        value: formatUsd(invoiceTotal),
        note: `${n(invoices.length)} charges in the invoice feed`,
        tone: "neutral",
      },
    ],
    pipeline: rows,
    pipelineTotal: pipeline.length,
    alerts: [...alertRows].sort(alertOrder).slice(0, ALERTS_SHOWN).map((a) => ({
      id: a.id,
      severity: a.severity,
      tone: severityTone(a.severity),
      title: alertTitle(a.alert_type, a.spv_id),
      detail: a.recommended_action ?? "",
    })),
    alertsOpen: alerts.count ?? alertRows.length,
    pool: signatoryPool(parties, now),
    ledger: {
      head: headRow ? shortHash(headRow.hash) : null,
      sequence: headRow?.sequence ?? null,
      spvId: headRow?.spv_id ?? null,
      entries: count(entries),
    },
  };
}

export async function fetchNavCounts(db: SupabaseClient): Promise<NavCounts> {
  const [pipeline, alerts, billing] = await Promise.all([
    db.from("spv_pipeline").select("spv_id", { count: "exact", head: true }).neq("stage", "INVESTOR_READY"),
    db.from("alert_log").select("id", { count: "exact", head: true }).eq("acknowledged", false),
    db.from("billing_invoice_feed").select("id", { count: "exact", head: true }),
  ]);
  return { pipeline: count(pipeline), alerts: count(alerts), billing: count(billing) };
}

export interface LedgerCheck {
  checked: number;
  invalid: { spvId: string; problems: number }[];
}

/**
 * Runs verifySeriesLedger on the most recently active SPVs (read-only; the
 * function recomputes every hash). The caller needs a role the factory
 * functions allow (DIBS_FUNCTION_ALLOWED_ROLES, admin by default).
 */
export async function verifyRecentChains(db: SupabaseClient, limit = 5): Promise<LedgerCheck> {
  const recent = check(
    await db.from("series_registry_log").select("spv_id").order("created_at", { ascending: false }).limit(200),
  ) as { spv_id: string }[];
  const spvIds = [...new Set(recent.map((r) => r.spv_id))].slice(0, limit);
  const results = await Promise.all(spvIds.map(async (spvId) => {
    const { data, error } = await db.functions.invoke("verifySeriesLedger", { body: { spv_id: spvId } });
    if (error) throw new Error(`verifySeriesLedger ${spvId}: ${error.message}`);
    const body = data as { valid: boolean; problems: unknown[] };
    return { spvId, valid: body.valid, problems: body.problems?.length ?? 0 };
  }));
  return {
    checked: results.length,
    invalid: results.filter((r) => !r.valid).map((r) => ({ spvId: r.spvId, problems: r.problems })),
  };
}

/** The same shape from sample-data.ts, for demo mode (no Supabase configured). */
export function sampleOverview(): OverviewData {
  return {
    kpis: sample.kpis,
    pipeline: sample.pipeline.map((r) => ({
      spvId: r.id,
      label: r.name,
      sublabel: r.id,
      stage: r.stage,
      stageTone: r.stageTone,
      step: r.step,
      status: r.gate,
      statusTone: r.gateTone,
      age: r.age,
      rush: !!r.rush,
    })),
    pipelineTotal: 18,
    alerts: sample.alerts.map((a) => ({ id: a.title, severity: a.severity, tone: a.tone, title: a.title, detail: a.detail })),
    alertsOpen: sample.alerts.length,
    pool: sample.signatoryPool,
    ledger: { head: sample.ledger.head, sequence: sample.ledger.sequence, spvId: "SPV-0231", entries: 1284 },
  };
}

export const SAMPLE_NAV_COUNTS: NavCounts = { pipeline: 18, alerts: 4, billing: 41 };
