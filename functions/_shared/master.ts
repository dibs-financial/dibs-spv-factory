import type { Base44Client } from "npm:@base44/sdk@0.8.31";
import { HttpError } from "./errors.ts";
import type { Rec } from "./records.ts";

export interface MasterEntity {
  legal_name: string;
  has_liability_notice: boolean;
  status: "ACTIVE" | "AMENDMENT_PENDING" | "INACTIVE";
  delaware_entity_id?: string;
}

export type MasterRecord = Rec<MasterEntity>;

/**
 * Resolves the single ACTIVE master Delaware Series LLC record. Exactly one
 * must exist: none blocks formation, and more than one is a configuration
 * fault that also blocks formation until an operator fixes it.
 */
export async function getActiveMasterEntity(base44: Base44Client): Promise<MasterRecord> {
  const active = (await base44.entities.MasterEntity.filter({ status: "ACTIVE" })) as MasterRecord[];
  if (active.length === 1) return active[0];
  if (active.length > 1) {
    throw new HttpError(
      422,
      "MULTIPLE_ACTIVE_MASTERS",
      `Found ${active.length} ACTIVE master entities; exactly one is permitted. Formation is blocked until resolved.`,
      { has_notice: false, master_entity_ids: active.map((m) => m.id) },
    );
  }
  const any = await base44.entities.MasterEntity.list(undefined, 1);
  if (any.length === 0) {
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

export function masterHasLiabilityNotice(master: MasterRecord): boolean {
  return master.has_liability_notice === true;
}
