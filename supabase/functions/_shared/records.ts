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
