import type { FormationStage, FormDStatus } from "../../../schemas/constants.ts";

/** Facts the pipeline runner gathers from factory tables for one SPV. */
export interface PipelineFacts {
  /** A SERIES_CREATED ledger event exists. */
  seriesCreated: boolean;
  /** The SPV's open EIN request, if any. */
  einRequest: { status: "PENDING" | "ISSUED" | "FAILED" | "THROTTLED" | "MANUAL_REQUIRED"; ein: string | null } | null;
  bankStatus: "PENDING" | "PROVISIONAL" | "ACTIVE" | "FROZEN" | "CLOSED" | null;
  /** document_types with status EXECUTED. */
  executedDocTypes: string[];
  /** Latest KYC signal from ledger events. */
  kyc: "NONE" | "STARTED" | "PASS" | "FAIL";
  capitalCalls: { total: number; received: number };
  formDStatus: FormDStatus | null;
  /** blue_sky_filings rows still PENDING or OVERDUE. */
  blueSkyOpen: number;
}

export const REQUIRED_EXECUTED_DOCS = ["SERIES_SCHEDULE", "SUBSCRIPTION_AGREEMENT"] as const;

export type TransitionDecision =
  | { action: "advance"; to: FormationStage; reason: string }
  | { action: "hold"; to: "EIN_PENDING_MANUAL"; reason: string }
  | { action: "wait"; reason: string }
  | { action: "done" };

/**
 * Pure stage logic. Given the current stage and the facts, decide whether the
 * SPV advances, enters a hold state, waits, or is finished. External signals
 * the factory cannot observe directly (series designation, KYC results) are
 * read from ledger events written by the process that performed them.
 */
export function decideTransition(stage: FormationStage, f: PipelineFacts): TransitionDecision {
  switch (stage) {
    case "INTAKE":
      return f.seriesCreated
        ? { action: "advance", to: "SERIES_CREATED", reason: "SERIES_CREATED ledger event present" }
        : { action: "wait", reason: "awaiting SERIES_CREATED ledger event (series designation)" };

    case "SERIES_CREATED":
      return f.einRequest
        ? { action: "advance", to: "EIN_PENDING", reason: "EIN request opened" }
        : { action: "wait", reason: "no EIN request; call getNextResponsibleParty with spv_id" };

    case "EIN_PENDING":
    case "EIN_PENDING_MANUAL": {
      if (!f.einRequest) return { action: "wait", reason: "EIN request row missing" };
      if (f.einRequest.status === "ISSUED" && f.einRequest.ein) {
        return { action: "advance", to: "EIN_RECEIVED", reason: "EIN issued" };
      }
      if (stage === "EIN_PENDING" && (f.einRequest.status === "FAILED" || f.einRequest.status === "MANUAL_REQUIRED")) {
        return {
          action: "hold",
          to: "EIN_PENDING_MANUAL",
          reason: `EIN request ${f.einRequest.status}; file paper SS-4`,
        };
      }
      return { action: "wait", reason: `EIN request ${f.einRequest.status}` };
    }

    case "EIN_RECEIVED":
      return { action: "advance", to: "BANK_PENDING", reason: "request bank sub-account" };

    case "BANK_PENDING":
      if (f.bankStatus === "ACTIVE" || f.bankStatus === "PROVISIONAL") {
        return { action: "advance", to: "BANK_READY", reason: `bank sub-account ${f.bankStatus}` };
      }
      return { action: "wait", reason: f.bankStatus ? `bank sub-account ${f.bankStatus}` : "no bank sub-account row" };

    case "BANK_READY":
      return { action: "advance", to: "DOCS_PENDING", reason: "generate document set" };

    case "DOCS_PENDING": {
      const missing = REQUIRED_EXECUTED_DOCS.filter((d) => !f.executedDocTypes.includes(d));
      return missing.length === 0
        ? { action: "advance", to: "DOCS_EXECUTED", reason: "required documents executed" }
        : { action: "wait", reason: `awaiting executed: ${missing.join(", ")}` };
    }

    case "DOCS_EXECUTED":
      return { action: "advance", to: "KYC_BATCH_PENDING", reason: "start KYC batch" };

    case "KYC_BATCH_PENDING":
      if (f.kyc === "PASS") return { action: "advance", to: "KYC_COMPLETE", reason: "KYC_PASS ledger event" };
      if (f.kyc === "FAIL") return { action: "wait", reason: "KYC_FAIL recorded; human review required" };
      return { action: "wait", reason: f.kyc === "STARTED" ? "KYC batch in progress" : "KYC batch not started" };

    case "KYC_COMPLETE":
      return { action: "advance", to: "CAPITAL_CALL_PENDING", reason: "issue capital calls" };

    case "CAPITAL_CALL_PENDING":
      if (f.capitalCalls.total === 0) {
        return { action: "wait", reason: "no capital calls issued; call processCapitalCall" };
      }
      return f.capitalCalls.received === f.capitalCalls.total
        ? { action: "advance", to: "CAPITAL_RECEIVED", reason: "all capital calls received" }
        : { action: "wait", reason: `${f.capitalCalls.received}/${f.capitalCalls.total} capital calls received` };

    case "CAPITAL_RECEIVED":
      return { action: "advance", to: "REGULATORY_PENDING", reason: "regulatory filings" };

    case "REGULATORY_PENDING": {
      const formDOk = f.formDStatus === "FILED" || f.formDStatus === "NOT_REQUIRED";
      if (formDOk && f.blueSkyOpen === 0) {
        return { action: "advance", to: "INVESTOR_READY", reason: "Form D and blue-sky filings complete" };
      }
      const parts = [];
      if (!formDOk) parts.push(`Form D ${f.formDStatus ?? "not started"}`);
      if (f.blueSkyOpen > 0) parts.push(`${f.blueSkyOpen} blue-sky filing(s) open`);
      return { action: "wait", reason: parts.join("; ") };
    }

    case "INVESTOR_READY":
      return { action: "done" };

    case "BLOCKED":
      return { action: "wait", reason: "blocked by formation gate" };

    case "PENDING_STATE_FILING":
      return { action: "wait", reason: "registered-series state filing pending (manual)" };
  }
}
