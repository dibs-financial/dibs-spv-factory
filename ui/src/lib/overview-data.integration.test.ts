/**
 * Integration test against a real PostgREST over the factory migrations.
 * Skipped unless DIBS_IT_URL (a Supabase-style URL serving /rest/v1) and
 * DIBS_IT_JWT_SECRET are set; see ui/README.md "Testing against a database"
 * for the seed it expects. Unit tests for the rules are in factory.test.ts.
 */
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { fetchNavCounts, fetchOverview } from "./overview-data";

const url = process.env.DIBS_IT_URL;
const secret = process.env.DIBS_IT_JWT_SECRET;
const ADMIN = "11111111-1111-1111-1111-111111111111";
const NO_ROLE = "22222222-2222-2222-2222-222222222222";

function jwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ exp: Math.floor(Date.now() / 1000) + 600, ...claims })}`;
  return `${body}.${createHmac("sha256", secret!).update(body).digest("base64url")}`;
}

function clientFor(sub: string) {
  const anon = jwt({ role: "anon" });
  return createClient(url!, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt({ role: "authenticated", sub })}` } },
  });
}

describe.skipIf(!url || !secret)("overview against PostgREST", () => {
  it("assembles the admin's overview from every table, paging past 1,000 rows", async () => {
    const o = await fetchOverview(clientFor(ADMIN));
    const kpi = Object.fromEntries(o.kpis.map((k) => [k.label, k]));

    expect(kpi["Series in formation"].value).toBe("4");
    expect(kpi["Series in formation"].note).toBe("1 on the 72-hour track");
    expect(kpi["Investor-ready this month"].value).toBe("1");
    expect(kpi["Investor-ready this month"].note).toBe("1,001 investor-ready in total");
    expect(kpi["Form D windows ≤ 5 days"].value).toBe("1");
    expect(kpi["Form D windows ≤ 5 days"].note).toBe("1 overdue");
    expect(kpi["Form D windows ≤ 5 days"].tone).toBe("critical");
    expect(kpi["Pending invoices"].value).toBe("$3,595");
    expect(kpi["Pending invoices"].note).toBe("2 charges in the invoice feed");

    expect(o.pipelineTotal).toBe(1005);
    expect(o.pipeline.slice(0, 5).map((r) => r.spvId)).toEqual(["SPV-A", "SPV-B", "SPV-D", "SPV-C", "SPV-E"]);
    expect(o.pipeline[0]).toMatchObject({ stageTone: "critical", step: 7, status: "Blocked · gate: ESCALATION_OPEN" });
    expect(o.pipeline[1]).toMatchObject({ stageTone: "warning", step: 3, status: "Held · SS-4 by fax" });
    expect(o.pipeline.find((r) => r.spvId === "SPV-C")).toMatchObject({ rush: true, sublabel: "DEAL-C", step: 9 });
    expect(o.pipeline.find((r) => r.spvId === "SPV-E")?.status).toBe("Waiting · awaiting SUBSCRIPTION_AGREEMENT");

    expect(o.alertsOpen).toBe(3);
    expect(o.alerts[0]).toMatchObject({ severity: "CRITICAL", title: "Form D overdue · SPV-X", detail: "Counsel to file now." });

    expect(o.pool).toEqual({ available: 3, total: 4 });
    expect(o.ledger.entries).toBe(2);
    expect(o.ledger.spvId).toBe("SPV-C");
    expect(o.ledger.sequence).toBe(2);
  });

  it("counts the navigation badges", async () => {
    expect(await fetchNavCounts(clientFor(ADMIN))).toEqual({ pipeline: 4, alerts: 3, billing: 2 });
  });

  it("shows nothing to a signed-in user without a factory role (RLS)", async () => {
    const o = await fetchOverview(clientFor(NO_ROLE));
    expect(o.pipelineTotal).toBe(0);
    expect(o.alertsOpen).toBe(0);
    expect(o.pool.total).toBe(0);
  });
});
