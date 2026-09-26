import type { PostgrestError } from "npm:@supabase/supabase-js@2";

export type { ServerFields } from "../../../schemas/types.ts";

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toMillis(iso: string | undefined | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Unwraps a PostgREST result, throwing on error so callers stay linear. */
export function unwrap<T>(result: { data: T | null; error: PostgrestError | null }): T {
  if (result.error) throw new DatabaseError(result.error);
  return result.data as T;
}

export class DatabaseError extends Error {
  readonly code: string;
  readonly details: string | null;
  constructor(readonly source: PostgrestError) {
    super(source.message);
    this.name = "DatabaseError";
    this.code = source.code;
    this.details = source.details ?? null;
  }
}

/** Postgres unique_violation. */
export function isUniqueViolation(error: unknown): boolean {
  return (error instanceof DatabaseError && error.code === "23505") ||
    (isPlainObject(error) && error.code === "23505");
}

/** PostgREST's default max-rows; a single select never returns more than this. */
export const PAGE_SIZE = 1000;

/**
 * Every row a query matches, paging through PostgREST's row limit. `page`
 * must build a fresh, stably ordered query for the given inclusive range.
 * Rows inserted concurrently can shift a page boundary and be returned twice
 * but never skipped, so callers that need uniqueness should dedupe.
 */
export async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  pageSize = PAGE_SIZE,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0;; from += pageSize) {
    const rows = unwrap(await page(from, from + pageSize - 1)) ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}
