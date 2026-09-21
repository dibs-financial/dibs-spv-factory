import type { CapitalCallRow } from "../../../schemas/types.ts";
import { HttpError, ok, serveFunction } from "../_shared/http.ts";
import { appendLedgerEntry } from "../_shared/ledger.ts";
import { computeCallAmount } from "../_shared/money.ts";
import { isPlainObject, isUniqueViolation, unwrap } from "../_shared/records.ts";
import { addCalendarDays } from "../_shared/time.ts";
import { numberOption, requireString } from "../_shared/validate.ts";

/**
 * Capital Call Processor
 *
 * Creates capital_calls rows for the supplied investors, calculating each
 * call amount from the subscription amount and call percentage (rounded to
 * cents), and sets the wire due date.
 *
 * This function does NOT check KYC or subscription execution. The deal-model
 * tables are not part of this repository; the pipeline step that calls this
 * function is responsible for passing only investors whose KYC has passed and
 * whose subscription is executed.
 *
 * Body:
 *   spv_id          required
 *   investor_list   required, [{ investor_id, subscription_id, amount }]
 *   call_percentage optional, (0, 100], default 100
 *   due_date_days   optional integer >= 1, default 10
 *
 * Idempotent per (spv_id, investor_id, subscription_id) via the table's unique
 * constraint. Per-investor failures are reported individually and never abort
 * the batch. One CAPITAL_CALL_ISSUED ledger event summarises the batch.
 */
interface InvestorCall {
  investor_id: string;
  subscription_id: string;
  amount: number;
}

interface CallResult {
  investor_id: string;
  subscription_id: string;
  status: "CREATED" | "SKIPPED" | "FAILED";
  call_id?: string;
  call_amount?: number;
  due_date?: string;
  message?: string;
}

serveFunction(async ({ db, body }) => {
  const spv_id = requireString(body, "spv_id");
  const callPct = numberOption(body, "call_percentage", { default: 100, exclusiveMin: 0, max: 100 });
  const dueDays = numberOption(body, "due_date_days", { default: 10, min: 1, integer: true });
  const investors = parseInvestorList(body.investor_list);

  const now = new Date();
  const dueDate = addCalendarDays(now, dueDays).toISOString();
  const results: CallResult[] = [];
  let totalCalled = 0;

  for (const inv of investors) {
    const base = { investor_id: inv.investor_id, subscription_id: inv.subscription_id };
    try {
      const callAmount = computeCallAmount(inv.amount, callPct);
      const { data, error } = await db.from("capital_calls").insert({
        spv_id,
        subscription_id: inv.subscription_id,
        investor_id: inv.investor_id,
        call_amount: callAmount,
        call_date: now.toISOString(),
        due_date: dueDate,
        wire_status: "ISSUED",
        received_amount: 0,
      }).select("id").single();

      if (error) {
        if (!isUniqueViolation(error)) throw error;
        const existing = unwrap(
          await db.from("capital_calls").select("id").match({ spv_id, ...base }).maybeSingle(),
        ) as Pick<CapitalCallRow, "id"> | null;
        results.push({
          ...base,
          status: "SKIPPED",
          call_id: existing?.id,
          message: "Capital call already exists for this investor/subscription.",
        });
        continue;
      }

      totalCalled += callAmount;
      results.push({ ...base, status: "CREATED", call_id: data.id, call_amount: callAmount, due_date: dueDate });
    } catch (error) {
      console.error(`capital call failed for investor ${inv.investor_id}`, error);
      results.push({
        ...base,
        status: "FAILED",
        message: error instanceof Error ? error.message : "Unexpected error.",
      });
    }
  }

  const created = results.filter((r) => r.status === "CREATED");
  let ledger: { entry_id: string; hash: string } | { error: string } | null = null;
  if (created.length > 0) {
    try {
      const appended = await appendLedgerEntry(db, {
        spv_id,
        event_type: "CAPITAL_CALL_ISSUED",
        event_data: {
          call_percentage: callPct,
          due_date: dueDate,
          calls_created: created.length,
          total_called: totalCalled,
          call_ids: created.map((r) => r.call_id),
        },
      });
      ledger = { entry_id: appended.entry.id, hash: appended.entry.hash };
    } catch (error) {
      console.error("CAPITAL_CALL_ISSUED ledger append failed", error);
      ledger = { error: error instanceof Error ? error.message : "Unexpected error." };
    }
  }

  const failed = results.filter((r) => r.status === "FAILED").length;
  const ledgerFailed = ledger !== null && "error" in ledger;
  return ok({
    success: failed === 0 && !ledgerFailed,
    spv_id,
    calls_created: created.length,
    calls_skipped: results.filter((r) => r.status === "SKIPPED").length,
    calls_failed: failed,
    total_called: totalCalled,
    call_percentage: callPct,
    due_date: dueDate,
    ledger,
    results,
  });
});

function parseInvestorList(raw: unknown): InvestorCall[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new HttpError(
      400,
      "INVESTOR_LIST_REQUIRED",
      "investor_list must be a non-empty array of executed, KYC-passed subscriptions.",
      { expected_format: [{ investor_id: "...", subscription_id: "...", amount: 50000 }] },
    );
  }
  return raw.map((item, index) => {
    if (!isPlainObject(item)) {
      throw new HttpError(400, "INVALID_INVESTOR", `investor_list[${index}] must be an object.`);
    }
    const { investor_id, subscription_id, amount } = item;
    if (typeof investor_id !== "string" || investor_id.trim() === "") {
      throw new HttpError(400, "INVALID_INVESTOR", `investor_list[${index}].investor_id is required.`);
    }
    if (typeof subscription_id !== "string" || subscription_id.trim() === "") {
      throw new HttpError(400, "INVALID_INVESTOR", `investor_list[${index}].subscription_id is required.`);
    }
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      throw new HttpError(400, "INVALID_INVESTOR", `investor_list[${index}].amount must be a positive number.`);
    }
    return { investor_id: investor_id.trim(), subscription_id: subscription_id.trim(), amount };
  });
}
