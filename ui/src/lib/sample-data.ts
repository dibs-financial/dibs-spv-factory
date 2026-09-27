/**
 * SAMPLE DATA for the operator console. Every value here is illustrative;
 * the top bar shows a "Sample data" badge while pages read from this file.
 * Replace with calls to the factory (supabase.functions.invoke or table reads
 * on spv_pipeline, alert_log, responsible_parties, billing_invoice_feed).
 * Stage codes, alert types and the signatory minimum are the real ones from
 * schemas/constants.ts and schemas/pricing.ts.
 */
export type Tone = "success" | "info" | "warning" | "critical" | "neutral";

export const PIPELINE_STAGE_COUNT = 14;
export const RUSH_TRACK_MIN_AVAILABLE_SIGNATORIES = 3;

export const kpis = [
  { label: "Series in formation", value: "18", note: "6 on the 72-hour track", tone: "neutral" as Tone },
  { label: "Investor-ready this month", value: "7", note: "Median 4.1 days from intake", tone: "neutral" as Tone },
  { label: "Form D windows ≤ 5 days", value: "2", note: "Operational clock, not counsel’s calendar", tone: "warning" as Tone },
  { label: "Pending invoices", value: "$148,300", note: "41 charges in the invoice feed", tone: "neutral" as Tone },
];

export interface PipelineRow {
  name: string;
  id: string;
  stage: string;
  stageTone: Tone;
  step: number;
  gate: string;
  gateTone: Tone;
  age: string;
  rush?: boolean;
}

export const pipeline: PipelineRow[] = [
  { name: "Harbor Point Multifamily", id: "SPV-0231", stage: "KYC_BATCH_PENDING", stageTone: "info", step: 9, gate: "Passed", gateTone: "success", age: "3d", rush: true },
  { name: "Meridian Cold Storage II", id: "SPV-0229", stage: "CAPITAL_CALL_PENDING", stageTone: "info", step: 11, gate: "Passed", gateTone: "success", age: "6d" },
  { name: "Ashford Solar Portfolio", id: "SPV-0227", stage: "EIN_PENDING_MANUAL", stageTone: "warning", step: 3, gate: "Held · SS-4 by fax", gateTone: "warning", age: "2d" },
  { name: "Northgate Industrial", id: "SPV-0226", stage: "REGULATORY_PENDING", stageTone: "info", step: 13, gate: "Passed", gateTone: "success", age: "9d" },
  { name: "Lakeview Senior Living", id: "SPV-0224", stage: "BLOCKED", stageTone: "critical", step: 6, gate: "Escalation open", gateTone: "critical", age: "4d" },
  { name: "Canal Street Retail", id: "SPV-0221", stage: "DOCS_PENDING", stageTone: "info", step: 7, gate: "Passed", gateTone: "success", age: "1d", rush: true },
  { name: "Summit Data Center", id: "SPV-0219", stage: "INVESTOR_READY", stageTone: "success", step: 14, gate: "Complete", gateTone: "success", age: "12d" },
];

export const alerts = [
  { severity: "CRITICAL", tone: "critical" as Tone, title: "Form D overdue · SPV-0214", detail: "First sale +16 days. Counsel notified; remediation fee applies." },
  { severity: "WARNING", tone: "warning" as Tone, title: "KYC exception · inv_8841", detail: "Lakeview Senior Living. Human review required." },
  { severity: "WARNING", tone: "warning" as Tone, title: "EIN manual filing · SPV-0227", detail: "Online channel failed; SS-4 sent by fax." },
  { severity: "INFO", tone: "info" as Tone, title: "Capital call past due · 2 investors", detail: "Meridian Cold Storage II. Wires marked OVERDUE." },
];

export const signatoryPool = { available: 4, total: 6 };

export const ledger = { verified: true, head: "9f2c…a41e", sequence: 1284 };
