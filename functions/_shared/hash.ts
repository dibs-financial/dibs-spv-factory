import { LEDGER_GENESIS_HASH } from "../../schemas/constants.ts";

/**
 * Deterministic JSON: object keys sorted lexicographically at every depth,
 * arrays preserved in order, `undefined` members dropped, non-finite numbers
 * serialised as null (matching JSON.stringify). Two objects with the same
 * content always produce the same string regardless of insertion order, so the
 * ledger hash can be recomputed from stored data.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeysDeep(v);
    }
    return out;
  }
  return value;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface LedgerHashInput {
  previousHash: string | null | undefined;
  spvId: string;
  eventType: string;
  timestamp: string;
  eventData: unknown;
}

/** See LEDGER_HASH_PREIMAGE in schemas/constants.ts for the documented format. */
export function ledgerPreimage(input: LedgerHashInput): string {
  const previous = input.previousHash || LEDGER_GENESIS_HASH;
  return `${previous}|${input.spvId}|${input.eventType}|${input.timestamp}|${canonicalJson(input.eventData ?? {})}`;
}

export function computeLedgerHash(input: LedgerHashInput): Promise<string> {
  return sha256Hex(ledgerPreimage(input));
}

/**
 * Preimage used by the original implementation (plain JSON.stringify, no key
 * sorting). Kept only so verifySeriesLedger can recognise legacy entries.
 */
export function legacyLedgerPreimage(input: LedgerHashInput): string {
  const previous = input.previousHash || LEDGER_GENESIS_HASH;
  return `${previous}|${input.spvId}|${input.eventType}|${input.timestamp}|${JSON.stringify(input.eventData ?? {})}`;
}
