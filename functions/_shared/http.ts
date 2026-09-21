import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
import type { Base44Client, User } from "npm:@base44/sdk@0.8.31";
import { HttpError } from "./errors.ts";
import { isPlainObject } from "./records.ts";

export { HttpError };

export function fail(
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): Response {
  return Response.json({ success: false, error: code, message, ...extra }, { status });
}

export function ok(body: Record<string, unknown>, status = 200): Response {
  return Response.json({ success: true, ...body }, { status });
}

export async function parseJsonBody(req: Request): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Request body must be a JSON object.");
  }
  if (!isPlainObject(parsed)) {
    throw new HttpError(400, "INVALID_JSON", "Request body must be a JSON object.");
  }
  return parsed;
}

/**
 * Roles allowed to invoke factory functions. Service-role callers (Base44
 * workflows and agents) are always allowed. Human callers must hold one of the
 * roles in DIBS_FUNCTION_ALLOWED_ROLES (comma-separated, default "admin").
 */
export function allowedRoles(): string[] {
  const raw = Deno.env.get("DIBS_FUNCTION_ALLOWED_ROLES") ?? "admin";
  return raw.split(",").map((r) => r.trim()).filter(Boolean);
}

export async function requireCaller(base44: Base44Client): Promise<User> {
  let user: User | null = null;
  try {
    user = await base44.auth.me();
  } catch {
    user = null;
  }
  if (!user) {
    throw new HttpError(401, "UNAUTHENTICATED", "A valid Base44 user or service token is required.");
  }
  if (user.is_service) return user;
  const roles = allowedRoles();
  if (roles.includes(user.role) || roles.includes(user._app_role)) return user;
  throw new HttpError(
    403,
    "FORBIDDEN",
    `Caller role "${user.role}" is not permitted to invoke factory functions.`,
  );
}

export interface FunctionContext {
  base44: Base44Client;
  req: Request;
  body: Record<string, unknown>;
  caller: User;
}

export type FunctionHandler = (ctx: FunctionContext) => Promise<Response>;

/**
 * Wraps a handler with client creation, caller authorisation, JSON-body
 * parsing and uniform error responses. Every factory function goes through
 * this so behaviour is identical across the fleet.
 */
export function serveFunction(
  handler: FunctionHandler,
  options: { parseBody?: boolean } = {},
): void {
  Deno.serve(async (req: Request) => {
    try {
      const base44 = createClientFromRequest(req);
      const caller = await requireCaller(base44);
      const body = options.parseBody === false ? {} : await parseJsonBody(req);
      return await handler({ base44, req, body, caller });
    } catch (error) {
      if (error instanceof HttpError) {
        return fail(error.status, error.code, error.message, error.extra);
      }
      console.error(error);
      const message = error instanceof Error ? error.message : "Unexpected error.";
      return fail(500, "SYSTEM_ERROR", message);
    }
  });
}
