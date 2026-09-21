import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { HttpError } from "./errors.ts";
import { isPlainObject, unwrap } from "./records.ts";

export { HttpError };

/**
 * Origins allowed to call the functions from a browser. DIBS_CORS_ORIGINS is a
 * comma-separated allowlist; unset means "*" (Lovable preview). Set it in
 * production, e.g. "https://your-app.lovable.app,https://app.dibs.financial".
 */
export function allowedOrigins(): string[] | "*" {
  const raw = Deno.env.get("DIBS_CORS_ORIGINS")?.trim();
  if (!raw) return "*";
  return raw.split(",").map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean);
}

export function corsHeadersFor(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  };
  const allowed = allowedOrigins();
  if (allowed === "*") {
    headers["Access-Control-Allow-Origin"] = "*";
    return headers;
  }
  const origin = req.headers.get("Origin")?.replace(/\/+$/, "");
  headers["Vary"] = "Origin";
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export function withCors(req: Request, response: Response): Response {
  for (const [name, value] of Object.entries(corsHeadersFor(req))) {
    response.headers.set(name, value);
  }
  return response;
}

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
  const text = await req.text();
  if (text.trim() === "") return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Request body must be a JSON object.");
  }
  if (!isPlainObject(parsed)) {
    throw new HttpError(400, "INVALID_JSON", "Request body must be a JSON object.");
  }
  return parsed;
}

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/**
 * Service-role client. Edge functions authorise the caller themselves (see
 * requireCaller) and then read/write as the service role, which bypasses RLS.
 */
export function serviceClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Roles allowed to invoke factory functions. Service-role callers (pg_cron
 * jobs, other edge functions) are always allowed. Human callers must hold one
 * of the roles in DIBS_FUNCTION_ALLOWED_ROLES (comma-separated, default
 * "admin") in public.user_roles.
 */
export function allowedRoles(): string[] {
  const raw = Deno.env.get("DIBS_FUNCTION_ALLOWED_ROLES") ?? "admin";
  return raw.split(",").map((r) => r.trim()).filter(Boolean);
}

export interface Caller {
  id: string | null;
  email: string | null;
  is_service: boolean;
  roles: string[];
}

export async function requireCaller(
  req: Request,
  db: SupabaseClient,
  options: { requireRole?: boolean } = {},
): Promise<Caller> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) {
    throw new HttpError(401, "UNAUTHENTICATED", "A Supabase user JWT or the service-role key is required.");
  }
  if (token === env("SUPABASE_SERVICE_ROLE_KEY")) {
    return { id: null, email: null, is_service: true, roles: ["service_role"] };
  }

  const anon = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data.user) {
    throw new HttpError(401, "UNAUTHENTICATED", "Invalid or expired token.");
  }

  const roleRows = unwrap(
    await db.from("user_roles").select("role").eq("user_id", data.user.id),
  ) as Array<{ role: string }>;
  const roles = roleRows.map((r) => r.role);
  const allowed = allowedRoles();
  if (options.requireRole !== false && !roles.some((r) => allowed.includes(r))) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      `Caller roles [${roles.join(", ")}] are not permitted to invoke factory functions.`,
    );
  }
  return { id: data.user.id, email: data.user.email ?? null, is_service: false, roles };
}

export interface FunctionContext {
  db: SupabaseClient;
  req: Request;
  body: Record<string, unknown>;
  caller: Caller;
}

export type FunctionHandler = (ctx: FunctionContext) => Promise<Response>;

/**
 * Wraps a handler with CORS, caller authorisation, JSON-body parsing and
 * uniform error responses. Every factory function goes through this so
 * behaviour is identical across the fleet. `requireRole: false` admits any
 * authenticated user (used only by read-only, non-sensitive endpoints).
 */
/**
 * Factory-wide settings supplied as Lovable Cloud secrets (see
 * supabase/functions/.env.example). All optional; factoryInfo reports them.
 */
export function factorySettings(): {
  base_url: string | null;
  tenant_id: string | null;
  env: string;
  allowed_roles: string[];
} {
  const url = Deno.env.get("SUPABASE_URL");
  return {
    base_url: Deno.env.get("SPVFACTORY_BASE_URL") ?? (url ? `${url}/functions/v1` : null),
    tenant_id: Deno.env.get("SPVFACTORY_TENANT_ID") ?? null,
    env: Deno.env.get("SPVFACTORY_ENV") ?? "production",
    allowed_roles: allowedRoles(),
  };
}

export function serveFunction(
  handler: FunctionHandler,
  options: { parseBody?: boolean; requireRole?: boolean } = {},
): void {
  Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
      return withCors(req, new Response("ok"));
    }
    try {
      const db = serviceClient();
      const caller = await requireCaller(req, db, { requireRole: options.requireRole });
      const body = options.parseBody === false ? {} : await parseJsonBody(req);
      return withCors(req, await handler({ db, req, body, caller }));
    } catch (error) {
      if (error instanceof HttpError) {
        return withCors(req, fail(error.status, error.code, error.message, error.extra));
      }
      // Log the real cause; never return it to the client (see SECURITY.md).
      console.error(error);
      return withCors(req, fail(500, "SYSTEM_ERROR", "Unexpected error."));
    }
  });
}
