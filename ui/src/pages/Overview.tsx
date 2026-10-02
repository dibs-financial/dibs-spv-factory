import { type HTMLAttributes, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/page-tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/hooks/useAuth";
import { useOverview, useVerifyChains } from "@/hooks/useFactory";
import { PIPELINE_STAGE_COUNT, RUSH_TRACK_MIN_AVAILABLE_SIGNATORIES, type Tone } from "@/lib/factory";
import { cn } from "@/lib/utils";

const toneText: Record<Tone, string> = {
  success: "text-success",
  info: "text-info",
  warning: "text-warning",
  critical: "text-critical",
  neutral: "text-muted-foreground",
};
const toneBar: Record<Tone, string> = {
  success: "bg-success",
  info: "bg-primary",
  warning: "bg-[hsl(38_76%_45%)]",
  critical: "bg-critical",
  neutral: "bg-primary",
};

type Filter = "all" | "blocked" | "held" | "rush";

function Card({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("rounded-lg border bg-card", className)} {...props}>
      {children}
    </section>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

export default function Overview() {
  const { live } = useAuth();
  const overview = useOverview();
  const verify = useVerifyChains();
  const [filter, setFilter] = useState<Filter>("all");
  const data = overview.data;

  const rows = useMemo(
    () =>
      (data?.pipeline ?? []).filter((r) =>
        filter === "all"
          ? true
          : filter === "blocked"
          ? r.stageTone === "critical"
          : filter === "held"
          ? r.stageTone === "warning"
          : r.rush
      ),
    [data, filter],
  );
  const rushOpen = (data?.pool.available ?? 0) >= RUSH_TRACK_MIN_AVAILABLE_SIGNATORIES;

  return (
    <div className="mx-auto flex max-w-[1360px] flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-[0.14em] text-subtle">Formation desk</span>
          <h1 className="font-display text-3xl font-medium tracking-[-0.01em] lg:text-[40px] lg:leading-tight">
            Every series, from designation to investor-ready.
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary">
            <Download />
            Export ledger
          </Button>
          <Button variant="secondary" aria-haspopup="listbox">
            Last 30 days
            <ChevronDown />
          </Button>
        </div>
      </div>

      {overview.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg bg-critical-tint px-4 py-3 text-sm text-critical">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          <span className="grow">Could not load the overview: {(overview.error as Error).message}</span>
          <Button variant="secondary" size="sm" onClick={() => overview.refetch()}>
            <RefreshCw />
            Try again
          </Button>
        </div>
      )}

      <section aria-label="Key figures" aria-busy={overview.isPending} className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {data
          ? data.kpis.map((k) => (
            <div key={k.label} className="flex flex-col gap-2.5 rounded-lg border bg-card px-5 py-5">
              <span className="text-[13px] text-muted-foreground">{k.label}</span>
              <span className="font-display text-[34px] font-medium leading-none lg:text-[38px]">{k.value}</span>
              <span className={cn("text-xs", toneText[k.tone])}>{k.note}</span>
            </div>
          ))
          : Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[124px]" />)}
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card aria-labelledby="pipeline-h" className="min-w-0 overflow-hidden xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-3.5 pt-5">
            <h2 id="pipeline-h" className="text-base font-semibold">Formation pipeline</h2>
            <SegmentedControl
              label="Filter pipeline"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "blocked", label: "Blocked" },
                { value: "held", label: "Held" },
                { value: "rush", label: "72-hour" },
              ]}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <caption className="sr-only">Series in formation, holds first</caption>
              <thead>
                <tr className="border-y border-[hsl(42_24%_90%)] bg-topbar text-left text-[11px] uppercase tracking-[0.1em] text-subtle">
                  <th scope="col" className="px-6 py-2.5 font-normal">Series</th>
                  <th scope="col" className="px-3 py-2.5 font-normal">Stage</th>
                  <th scope="col" className="px-3 py-2.5 font-normal">Progress</th>
                  <th scope="col" className="px-3 py-2.5 font-normal">Status</th>
                  <th scope="col" className="px-6 py-2.5 text-right font-normal">Age</th>
                </tr>
              </thead>
              <tbody>
                {!data && Array.from({ length: 5 }, (_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="px-6 py-3"><Skeleton className="h-9" /></td>
                  </tr>
                ))}
                {rows.map((r) => {
                  const pct = Math.round((r.step / PIPELINE_STAGE_COUNT) * 100);
                  return (
                    <tr key={r.spvId} className="border-b border-[hsl(42_24%_93%)] last:border-0 hover:bg-topbar">
                      <td className="px-6 py-3.5">
                        <Link to={`/pipeline/${encodeURIComponent(r.spvId)}`} className="flex flex-col gap-0.5 rounded-sm">
                          <span className={cn("font-medium text-foreground", live && "font-mono text-[13px]")}>{r.label}</span>
                          {r.sublabel && <span className="font-mono text-xs text-subtle">{r.sublabel}</span>}
                        </Link>
                      </td>
                      <td className="px-3 py-3.5">
                        <StatusBadge tone={r.stageTone} code>{r.stage}</StatusBadge>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex min-w-[120px] items-center gap-2.5">
                          <div
                            className="h-1.5 grow overflow-hidden rounded-full bg-muted"
                            role="progressbar"
                            aria-label={`${r.label} progress`}
                            aria-valuemin={0}
                            aria-valuemax={PIPELINE_STAGE_COUNT}
                            aria-valuenow={r.step}
                          >
                            <div className={cn("h-full rounded-full", toneBar[r.stageTone])} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-10 text-right text-xs text-muted-foreground">
                            {r.step}/{PIPELINE_STAGE_COUNT}
                          </span>
                        </div>
                      </td>
                      <td className={cn("max-w-[200px] truncate px-3 py-3.5 text-[13px] font-medium", toneText[r.statusTone])} title={r.status}>
                        {r.status}
                      </td>
                      <td className="px-6 py-3.5 text-right text-[13px] text-muted-foreground">{r.age}</td>
                    </tr>
                  );
                })}
                {data && rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-sm text-muted-foreground">
                      {data.pipeline.length === 0
                        ? "No series in the pipeline yet. A series enters at INTAKE with its first ledger event."
                        : "No series match this filter."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t px-6 py-1">
            <span className="text-xs text-subtle">
              {data && data.pipelineTotal > data.pipeline.length
                ? `Showing ${data.pipeline.length} of ${data.pipelineTotal}`
                : ""}
            </span>
            <Button asChild variant="link">
              <Link to="/pipeline" className="min-h-11">
                View all {PIPELINE_STAGE_COUNT} stages
                <ChevronRight />
              </Link>
            </Button>
          </div>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card aria-labelledby="attn-h" className="flex flex-col gap-3.5 px-5 py-5">
            <div className="flex items-center justify-between">
              <h2 id="attn-h" className="text-base font-semibold">Needs attention</h2>
              <Button asChild variant="ghost" size="sm">
                <Link to="/alerts">{data?.alertsOpen ?? 0} open</Link>
              </Button>
            </div>
            {!data && <Skeleton className="h-32" />}
            {data && data.alerts.length === 0 && (
              <p className="flex items-center gap-2 text-sm text-success">
                <Check className="size-4" aria-hidden="true" />
                No unacknowledged alerts.
              </p>
            )}
            <ul className="flex flex-col gap-3.5">
              {data?.alerts.map((a) => (
                <li key={a.id} className="flex items-start gap-3">
                  <StatusBadge tone={a.tone} className="mt-0.5 shrink-0 text-[10px]">{a.severity}</StatusBadge>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium">{a.title}</span>
                    {a.detail && <span className="text-xs text-muted-foreground">{a.detail}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <section aria-labelledby="ein-h" className="flex flex-col gap-3.5 rounded-lg bg-sidebar px-5 py-5 text-sidebar-foreground">
            <div className="flex items-center justify-between gap-3">
              <h2 id="ein-h" className="text-base font-semibold text-sidebar-primary">EIN signatory pool</h2>
              {data && (
                <span
                  className={cn(
                    "shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium",
                    rushOpen ? "bg-[hsl(166_45%_16%)] text-[hsl(152_42%_74%)]" : "bg-[hsl(4_50%_18%)] text-[hsl(4_80%_78%)]",
                  )}
                >
                  {rushOpen ? "72-hour track open" : "72-hour track closed"}
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-4xl leading-none text-sidebar-primary">{data?.pool.available ?? "–"}</span>
              <span className="text-[13px] text-[hsl(220_16%_72%)]">
                of {data?.pool.total ?? "–"} can sign today · minimum {RUSH_TRACK_MIN_AVAILABLE_SIGNATORIES}
              </span>
            </div>
            {data && data.pool.total > 0 && (
              <div
                className="grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${Math.min(data.pool.total, 12)}, minmax(0, 1fr))` }}
                aria-hidden="true"
              >
                {Array.from({ length: Math.min(data.pool.total, 12) }, (_, i) => (
                  <div
                    key={i}
                    className={cn("h-2 rounded-[4px]", i < data.pool.available ? "bg-[hsl(155_44%_44%)]" : "bg-sidebar-border")}
                  />
                ))}
              </div>
            )}
            <span className="text-xs text-[hsl(220_16%_72%)]">
              IRS online limit: one EIN per responsible party per Eastern day.
            </span>
          </section>

          <Card aria-labelledby="ledger-h" className="flex flex-col gap-2.5 px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <h2 id="ledger-h" className="text-base font-semibold">Ledger integrity</h2>
              {verify.data && verify.data.invalid.length === 0 && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-success">
                  <Check className="size-3.5" strokeWidth={2.2} aria-hidden="true" />
                  {verify.data.checked} recent {verify.data.checked === 1 ? "chain" : "chains"} verified
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              Hash-chained, append-only. Detective evidence, not a books-and-records substitute.
            </span>
            <span className="rounded-md bg-background px-2.5 py-2 font-mono text-xs">
              {data?.ledger.head
                ? `head ${data.ledger.head} · ${data.ledger.spvId} seq ${data.ledger.sequence?.toLocaleString("en-US")} · ${data.ledger.entries.toLocaleString("en-US")} entries`
                : data
                ? "No ledger entries yet"
                : "…"}
            </span>
            {verify.data && verify.data.invalid.length > 0 && (
              <p role="alert" className="rounded-md bg-critical-tint px-3 py-2 text-xs text-critical">
                Chain problems in {verify.data.invalid.map((i) => `${i.spvId} (${i.problems})`).join(", ")}. Open the
                series ledger to see each entry.
              </p>
            )}
            {verify.isError && (
              <p role="alert" className="rounded-md bg-critical-tint px-3 py-2 text-xs text-critical">
                {(verify.error as Error).message}
              </p>
            )}
            {live && (
              <Button
                variant="secondary"
                size="sm"
                className="self-start"
                loading={verify.isPending}
                loadingText="Verifying…"
                disabled={!data?.ledger.head}
                onClick={() => verify.mutate()}
              >
                Verify recent chains
              </Button>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
