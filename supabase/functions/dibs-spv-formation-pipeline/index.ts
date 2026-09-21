import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { FormationStage } from "../../../schemas/constants.ts";
import type {
  BankSubAccountRow,
  BlueSkyFilingRow,
  CapitalCallRow,
  DocumentSetRow,
  EINRequestRow,
  FormDFilingRow,
  SpvPipelineRow,
} from "../../../schemas/types.ts";
import { raiseAlert } from "../_shared/alerts.ts";
import { evaluateFormationGate } from "../_shared/gate.ts";
import { appendLedgerEntry, type LedgerRow } from "../_shared/ledger.ts";
import { decideTransition, type PipelineFacts } from "../_shared/pipeline.ts";
import { unwrap } from "../_shared/records.ts";
import { serveRunner } from "../_shared/runner.ts";

/**
 * SPV Formation Pipeline — every 15 minutes (pg_cron "0,15,30,45 * * * *").
 *
 * 1. Enrol: any spv_id with ledger events but no spv_pipeline row starts at INTAKE.
 * 2. For each SPV not yet INVESTOR_READY:
 *    - evaluate the formation gate; a failure moves the SPV to BLOCKED
 *      (remembering its stage) and raises a CRITICAL ESCALATION alert; a
 *      BLOCKED SPV whose gate passes again returns to that stage.
 *    - otherwise apply decideTransition() up to MAX_HOPS times so the
 *      pass-through stages do not take an hour to cross. Every transition is
 *      a STATE_CHANGE ledger event; every wait reason is stored on the row.
 * The runner never creates series, EINs, documents or calls itself; it
 * observes what other functions and processes have recorded.
 */
const MAX_HOPS = 5;

serveRunner("dibs-spv-formation-pipeline", async ({ db, now }) => {
  const summary = {
    enrolled: 0,
    evaluated: 0,
    transitions: 0,
    blocked: 0,
    unblocked: 0,
    waiting: 0,
    done: 0,
    alerts_created: 0,
  };

  summary.enrolled = await enrolNewSpvs(db);

  const rows = unwrap(
    await db.from("spv_pipeline").select("*").neq("stage", "INVESTOR_READY").order("created_at"),
  ) as SpvPipelineRow[];

  for (const row of rows) {
    summary.evaluated += 1;
    const gate = await evaluateFormationGate(db, row.spv_id);

    if (!gate.passed) {
      if (row.stage !== "BLOCKED") {
        await transition(db, row, "BLOCKED", `gate: ${gate.code} — ${gate.message}`, now, {
          stage_before_hold: row.stage,
          hold_reason: gate.message,
        });
        summary.blocked += 1;
        const r = await raiseAlert(db, {
          spv_id: row.spv_id,
          alert_type: "ESCALATION",
          severity: "CRITICAL",
          covenant_type: "FORMATION_GATE",
          evidence: { code: gate.code, stage_before_hold: row.stage, ...gate.extra },
          recommended_action: gate.message,
          escalated_to: gate.code === "STATUTORY_BLOCK" ? "counsel" : "compliance_reviewer",
        }, { dedupe: true });
        if (r.created) summary.alerts_created += 1;
      } else {
        await touch(db, row.spv_id, now, `still blocked: ${gate.code}`);
      }
      continue;
    }

    let current = row;
    if (row.stage === "BLOCKED") {
      const back = row.stage_before_hold ?? "INTAKE";
      current = await transition(db, row, back, "formation gate passed; hold cleared", now, {
        stage_before_hold: null,
        hold_reason: null,
      });
      summary.unblocked += 1;
    }

    for (let hop = 0; hop < MAX_HOPS; hop++) {
      const facts = await gatherFacts(db, current.spv_id);
      const decision = decideTransition(current.stage, facts);
      if (decision.action === "advance" || decision.action === "hold") {
        current = await transition(
          db,
          current,
          decision.to,
          decision.reason,
          now,
          decision.action === "hold"
            ? { stage_before_hold: current.stage, hold_reason: decision.reason }
            : { stage_before_hold: null, hold_reason: null },
        );
        summary.transitions += 1;
        if (decision.to === "INVESTOR_READY") {
          summary.done += 1;
          break;
        }
        continue;
      }
      if (decision.action === "done") {
        summary.done += 1;
      } else {
        summary.waiting += 1;
        await touch(db, current.spv_id, now, decision.reason);
      }
      break;
    }
  }

  return summary;
});

async function enrolNewSpvs(db: SupabaseClient): Promise<number> {
  const ledgerSpvs = unwrap(await db.from("series_registry_log").select("spv_id")) as Array<{ spv_id: string }>;
  const known = unwrap(await db.from("spv_pipeline").select("spv_id")) as Array<{ spv_id: string }>;
  const knownSet = new Set(known.map((k) => k.spv_id));
  const fresh = [...new Set(ledgerSpvs.map((l) => l.spv_id))].filter((id) => !knownSet.has(id));
  if (fresh.length === 0) return 0;
  const { error } = await db.from("spv_pipeline").upsert(
    fresh.map((spv_id) => ({ spv_id, stage: "INTAKE" })),
    { onConflict: "spv_id", ignoreDuplicates: true },
  );
  if (error) throw error;
  return fresh.length;
}

async function gatherFacts(db: SupabaseClient, spvId: string): Promise<PipelineFacts> {
  const [events, ein, bank, docs, calls, formD, blueSky] = await Promise.all([
    db.from("series_registry_log").select("event_type,sequence").eq("spv_id", spvId).in("event_type", [
      "SERIES_CREATED",
      "KYC_BATCH_STARTED",
      "KYC_PASS",
      "KYC_FAIL",
    ]).order("sequence", { ascending: false }),
    db.from("ein_requests").select("*").eq("spv_id", spvId).order("created_at", { ascending: false }).limit(1)
      .maybeSingle(),
    db.from("bank_sub_accounts").select("*").eq("spv_id", spvId).order("created_at", { ascending: false }).limit(1)
      .maybeSingle(),
    db.from("document_sets").select("*").eq("spv_id", spvId).eq("status", "EXECUTED"),
    db.from("capital_calls").select("wire_status").eq("spv_id", spvId),
    db.from("form_d_filings").select("*").eq("spv_id", spvId).maybeSingle(),
    db.from("blue_sky_filings").select("*").eq("spv_id", spvId).in("status", ["PENDING", "OVERDUE"]),
  ]);

  const ledger = unwrap(events) as Pick<LedgerRow, "event_type" | "sequence">[];
  const latestKyc = ledger.find((e) => e.event_type.startsWith("KYC_"));
  const kyc = !latestKyc
    ? "NONE"
    : latestKyc.event_type === "KYC_PASS"
    ? "PASS"
    : latestKyc.event_type === "KYC_FAIL"
    ? "FAIL"
    : "STARTED";

  const einRow = unwrap(ein) as EINRequestRow | null;
  const bankRow = unwrap(bank) as BankSubAccountRow | null;
  const callRows = unwrap(calls) as Pick<CapitalCallRow, "wire_status">[];

  return {
    seriesCreated: ledger.some((e) => e.event_type === "SERIES_CREATED"),
    einRequest: einRow ? { status: einRow.status, ein: einRow.ein } : null,
    bankStatus: bankRow?.account_status ?? null,
    executedDocTypes: (unwrap(docs) as DocumentSetRow[]).map((d) => d.document_type),
    kyc,
    capitalCalls: { total: callRows.length, received: callRows.filter((c) => c.wire_status === "RECEIVED").length },
    formDStatus: (unwrap(formD) as FormDFilingRow | null)?.status ?? null,
    blueSkyOpen: (unwrap(blueSky) as BlueSkyFilingRow[]).length,
  };
}

async function transition(
  db: SupabaseClient,
  row: SpvPipelineRow,
  to: FormationStage,
  reason: string,
  now: Date,
  hold: { stage_before_hold: FormationStage | null; hold_reason: string | null },
): Promise<SpvPipelineRow> {
  const updated = unwrap(
    await db.from("spv_pipeline").update({
      stage: to,
      stage_before_hold: hold.stage_before_hold,
      hold_reason: hold.hold_reason,
      wait_reason: null,
      last_transition_at: now.toISOString(),
      last_evaluated_at: now.toISOString(),
    }).eq("spv_id", row.spv_id).eq("stage", row.stage).select("*").maybeSingle(),
  ) as SpvPipelineRow | null;
  if (!updated) throw new Error(`pipeline row for ${row.spv_id} changed underneath the runner`);

  await appendLedgerEntry(db, {
    spv_id: row.spv_id,
    event_type: "STATE_CHANGE",
    event_data: { entity: "spv_pipeline", from: row.stage, to, reason },
    actor: "dibs-spv-formation-pipeline",
  });
  return updated;
}

async function touch(db: SupabaseClient, spvId: string, now: Date, waitReason: string): Promise<void> {
  unwrap(
    await db.from("spv_pipeline").update({ wait_reason: waitReason, last_evaluated_at: now.toISOString() }).eq(
      "spv_id",
      spvId,
    ),
  );
}
