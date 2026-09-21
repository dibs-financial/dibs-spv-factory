/** Server-managed fields present on every Base44 entity record. */
export interface ServerFields {
  id: string;
  created_date: string;
  updated_date?: string;
  created_by?: string | null;
}

export type Rec<T> = T & ServerFields;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toMillis(iso: string | undefined | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}
