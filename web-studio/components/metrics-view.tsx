"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { usePoll } from "@/components/use-poll";
import { CHART_LABEL_FONT_SIZE, CHART_TICK_FONT_SIZE } from "@/lib/ds/fonts.ts";
import { cn } from "@/lib/utils";

type Bucket = { runs: number; costUsd: number; input: number; output: number; cacheRead: number; cacheWrite: number };
type Data = {
  factory: null | {
    jobs: number; merged: number; needs_human: number; in_flight: number;
    first_pass_rate_pct: number | null; avg_review_rounds: number | null;
    escalation_rate_pct: number | null; median_cycle_seconds: number | null;
  };
  usage: { total: Bucket; failed: number; durationMs: number; byModel: Record<string, Bucket>; byDay: Record<string, Bucket>; byJob: Record<string, Bucket> };
};

const money = (n: number) => `$${n.toFixed(2)}`;
const tok = (b: Bucket) => b.input + b.output + b.cacheRead + b.cacheWrite;
const compact = (n: number) => Intl.NumberFormat("en", { notation: "compact" }).format(n);
const pct = (n: number | null | undefined) => (n == null ? "n/a" : `${Math.round(n)}%`);
const dur = (s: number | null | undefined) => (s == null ? "n/a" : s < 3600 ? `${Math.round(s / 60)}m` : `${(s / 3600).toFixed(1)}h`);

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-xl bg-card shadow-raised [--field:var(--field-on-surface)]", className)}>{children}</div>;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="grid min-w-0 gap-1.5 px-4 py-3">
      <span className="text-subheading text-foreground">{label}</span>
      <strong className="text-title tabular-nums text-foreground">{value}</strong>
      {sub && <span className="mt-1 border-t border-border pt-2 text-body-sm text-muted-foreground">{sub}</span>}
    </Card>
  );
}

function CostByDay({ rows }: { rows: [string, Bucket][] }) {
  const data = [...rows].sort((a, b) => a[0].localeCompare(b[0])).map(([day, b]) => ({ day: day.slice(5), cost: Number(b.costUsd.toFixed(3)) }));
  return (
    <Card className="px-4 py-3">
      <h3 className="mb-3 text-body text-foreground">Cost by day</h3>
      {data.length === 0 ? (
        <p className="py-10 text-center text-body-sm text-muted-foreground">No runs yet.</p>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: CHART_TICK_FONT_SIZE }} />
              <YAxis tickLine={false} axisLine={false} width={40} tickFormatter={(v: number) => `$${v}`} tick={{ fill: "var(--muted-foreground)", fontSize: CHART_TICK_FONT_SIZE }} />
              <Tooltip cursor={{ fill: "var(--fill-subtle)" }} contentStyle={{ background: "var(--card)", border: "none", borderRadius: 12, boxShadow: "var(--elevation-overlay)", fontSize: CHART_LABEL_FONT_SIZE }} formatter={(v) => [`$${Number(v).toFixed(2)}`, "Cost"]} />
              <Bar dataKey="cost" fill="var(--chart-blue)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function Table({ title, rows, highlight }: { title: string; rows: [string, Bucket][]; highlight?: string | null }) {
  const max = Math.max(1, ...rows.map(([, b]) => b.costUsd));
  return (
    <Card className="overflow-hidden">
      <h3 className="px-4 pt-3 pb-2 text-body text-foreground">{title}</h3>
      {rows.length === 0 ? (
        <p className="px-4 pb-4 text-body-sm text-muted-foreground">No runs yet.</p>
      ) : (
        <table className="w-full text-body-sm">
          <thead className="text-left text-column text-muted-foreground">
            <tr className="h-table-header border-y border-border"><th className="pl-4 font-medium">Name</th><th className="font-medium">Runs</th><th className="font-medium">In / out</th><th className="font-medium">Cache</th><th className="w-1/3 pr-4 text-right font-medium">Cost</th></tr>
          </thead>
          <tbody>
            {rows.map(([name, b]) => (
              <tr key={name} className={cn("h-table-row-small border-b border-border last:border-b-0 hover:bg-fill-subtle", name === highlight && "bg-fill")}>
                <td className="max-w-48 truncate pl-4 font-mono text-caption">{name}</td>
                <td className="tabular-nums">{b.runs}</td>
                <td className="tabular-nums">{compact(b.input)} / {compact(b.output)}</td>
                <td className="tabular-nums">{compact(b.cacheRead + b.cacheWrite)}</td>
                <td className="pr-4 text-right">
                  <span className="inline-block h-1.5 rounded-full bg-chart-blue align-middle" style={{ width: `${(b.costUsd / max) * 60}%` }} />
                  <span className="ml-2 tabular-nums">{money(b.costUsd)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export function MetricsView({ repo, job }: { repo: string; job?: string | null }) {
  const { data, error } = usePoll<Data>(`/api/metrics?repo=${encodeURIComponent(repo)}`, 5000);
  if (error) return <p className="text-body-sm text-destructive-foreground">{error}</p>;
  if (!data) return <p className="text-body-sm text-muted-foreground">Loading…</p>;
  const { factory: f, usage: u } = data;
  const sorted = (o: Record<string, Bucket>) => Object.entries(o).sort((a, b) => b[1].costUsd - a[1].costUsd);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Jobs merged" value={f ? `${f.merged} / ${f.jobs}` : "n/a"} sub={f ? `${f.in_flight} in flight · ${f.needs_human} need a human` : undefined} />
        <Stat label="First-pass rate" value={pct(f?.first_pass_rate_pct)} sub={`${f?.avg_review_rounds ?? "n/a"} avg review rounds`} />
        <Stat label="Escalation rate" value={pct(f?.escalation_rate_pct)} sub={`median cycle ${dur(f?.median_cycle_seconds)}`} />
        {job ? (
          <Stat label={`Cost · ${job}`} value={money(u.byJob[job]?.costUsd ?? 0)} sub={`${u.byJob[job]?.runs ?? 0} runs · ${compact(u.byJob[job] ? tok(u.byJob[job]) : 0)} tokens`} />
        ) : (
          <Stat label="Total cost" value={money(u.total.costUsd)} sub={`${u.total.runs} runs · ${u.failed} failed · ${compact(tok(u.total))} tokens`} />
        )}
      </div>
      <p className="text-caption text-muted-foreground">Cost and tokens cover runs started from this web app. On a subscription login these are API-equivalent figures, not a bill.</p>
      <CostByDay rows={Object.entries(u.byDay)} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Table title="By model" rows={sorted(u.byModel)} />
        <Table title="By job" rows={sorted(u.byJob)} highlight={job} />
      </div>
    </div>
  );
}
