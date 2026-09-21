import { HttpError } from "./errors.ts";
import { isPlainObject } from "./records.ts";

type Body = Record<string, unknown>;

export function requireString(body: Body, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, "MISSING_REQUIRED_FIELDS", `${key} is required and must be a non-empty string.`);
  }
  return value.trim();
}

export function optionalString(body: Body, key: string): string | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new HttpError(400, "INVALID_FIELD", `${key} must be a string.`);
  }
  return value.trim() === "" ? undefined : value.trim();
}

export function requireEnum<T extends readonly string[]>(body: Body, key: string, list: T): T[number] {
  const value = requireString(body, key);
  if (!(list as readonly string[]).includes(value)) {
    throw new HttpError(400, `INVALID_${key.toUpperCase()}`, `${key} must be one of: ${list.join(", ")}`);
  }
  return value as T[number];
}

export function optionalObject(body: Body, key: string): Record<string, unknown> | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (!isPlainObject(value)) {
    throw new HttpError(400, "INVALID_FIELD", `${key} must be a JSON object.`);
  }
  return value;
}

export function optionalStringArray(body: Body, key: string): string[] | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
    throw new HttpError(400, "INVALID_FIELD", `${key} must be an array of strings.`);
  }
  return value;
}

/**
 * Numeric option with an explicit default. Unlike `value || default`, a
 * supplied 0 is validated against the range rather than silently replaced.
 */
export function numberOption(
  body: Body,
  key: string,
  opts: { default: number; min?: number; exclusiveMin?: number; max?: number; integer?: boolean },
): number {
  const raw = body[key];
  if (raw === undefined || raw === null) return opts.default;
  const value = typeof raw === "number" ? raw : Number.NaN;
  if (!Number.isFinite(value)) {
    throw new HttpError(400, "INVALID_FIELD", `${key} must be a finite number.`);
  }
  if (opts.integer && !Number.isInteger(value)) {
    throw new HttpError(400, "INVALID_FIELD", `${key} must be an integer.`);
  }
  if (opts.exclusiveMin !== undefined && value <= opts.exclusiveMin) {
    throw new HttpError(400, "INVALID_FIELD", `${key} must be > ${opts.exclusiveMin}.`);
  }
  if (opts.min !== undefined && value < opts.min) {
    throw new HttpError(400, "INVALID_FIELD", `${key} must be >= ${opts.min}.`);
  }
  if (opts.max !== undefined && value > opts.max) {
    throw new HttpError(400, "INVALID_FIELD", `${key} must be <= ${opts.max}.`);
  }
  return value;
}

/** Parses an optional ISO-8601 timestamp; rejects unparseable or far-future values. */
export function optionalPastTimestamp(body: Body, key: string, now = new Date()): Date | undefined {
  const raw = optionalString(body, key);
  if (raw === undefined) return undefined;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) {
    throw new HttpError(400, "INVALID_FIELD", `${key} must be an ISO-8601 timestamp.`);
  }
  const skewMs = 5 * 60 * 1000;
  if (parsed.getTime() > now.getTime() + skewMs) {
    throw new HttpError(400, "INVALID_FIELD", `${key} may not be in the future.`);
  }
  return parsed;
}
