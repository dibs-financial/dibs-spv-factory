import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { MasterEntityRow } from "../../../schemas/types.ts";
import { HttpError } from "./errors.ts";
import { unwrap } from "./records.ts";

/**
 * Resolves the single ACTIVE master Delaware Series LLC record. The database
 * enforces at most one ACTIVE row (partial unique index); this also reports
 * the zero case with a distinct error code.
 */
export async function getActiveMasterEntity(db: SupabaseClient): Promise<MasterEntityRow> {
  const active = unwrap(
    await db.from("master_entities").select("*").eq("status", "ACTIVE"),
  ) as MasterEntityRow[];
  if (active.length === 1) return active[0];
  if (active.length > 1) {
    throw new HttpError(
      422,
      "MULTIPLE_ACTIVE_MASTERS",
      `Found ${active.length} ACTIVE master entities; exactly one is permitted. Formation is blocked until resolved.`,
      { has_notice: false, master_entity_ids: active.map((m) => m.id) },
    );
  }
  const { count, error } = await db.from("master_entities").select("id", { count: "exact", head: true });
  if (error) throw error;
  if (!count) {
    throw new HttpError(
      422,
      "NO_MASTER_ENTITY",
      "No master entity record found. The Delaware Series LLC master must be configured before any SPV formation.",
      { has_notice: false },
    );
  }
  throw new HttpError(
    422,
    "NO_ACTIVE_MASTER",
    "No active master entity found. Formation is blocked until a master entity with ACTIVE status exists.",
    { has_notice: false },
  );
}

export function masterHasLiabilityNotice(master: MasterEntityRow): boolean {
  return master.has_liability_notice === true;
}
