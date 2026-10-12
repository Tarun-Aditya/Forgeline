"use client";
import { usePoll } from "@/components/use-poll";

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

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Table({ title, rows }: { title: string; rows: [string, Bucket][] }) {
  const max = Math.max(1, ...rows.map(([, b]) => b.costUsd));
  return (
    <section>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No runs yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr><th className="py-1 font-normal">Name</th><th className="font-normal">Runs</th><th className="font-normal">In / out</th><th className="font-normal">Cache</th><th className="w-1/3 text-right font-normal">Cost</th></tr>
          </thead>
          <tbody>
            {rows.map(([name, b]) => (
              <tr key={name} className="border-t">
                <td className="py-1.5 pr-2 font-mono text-xs">{name}</td>
                <td className="tabular-nums">{b.runs}</td>
                <td className="tabular-nums">{compact(b.input)} / {compact(b.output)}</td>
                <td className="tabular-nums">{compact(b.cacheRead + b.cacheWrite)}</td>
                <td className="text-right">
                  <span className="inline-block h-1.5 rounded bg-primary/60 align-middle" style={{ width: `${(b.costUsd / max) * 60}%` }} />
                  <span className="ml-2 tabular-nums">{money(b.costUsd)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function MetricsView({ repo }: { repo: string }) {
  const { data, error } = usePoll<Data>(`/api/metrics?repo=${encodeURIComponent(repo)}`, 5000);
  if (error) return <p className="p-6 text-sm text-destructive">{error}</p>;
  if (!data) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  const { factory: f, usage: u } = data;
  const sorted = (o: Record<string, Bucket>) => Object.entries(o).sort((a, b) => b[1].costUsd - a[1].costUsd);
  return (
    <div className="space-y-8 p-1">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Jobs merged" value={f ? `${f.merged} / ${f.jobs}` : "n/a"} sub={f ? `${f.in_flight} in flight · ${f.needs_human} need a human` : undefined} />
        <Stat label="First-pass rate" value={pct(f?.first_pass_rate_pct)} sub={`${f?.avg_review_rounds ?? "n/a"} avg review rounds`} />
        <Stat label="Escalation rate" value={pct(f?.escalation_rate_pct)} sub={`median cycle ${dur(f?.median_cycle_seconds)}`} />
        <Stat label="Total cost" value={money(u.total.costUsd)} sub={`${u.total.runs} runs · ${u.failed} failed · ${compact(tok(u.total))} tokens`} />
      </div>
      <p className="text-xs text-muted-foreground">Cost and tokens cover runs started from this web app. On a subscription login these are API-equivalent figures, not a bill.</p>
      <div className="grid gap-8 xl:grid-cols-2">
        <Table title="By model" rows={sorted(u.byModel)} />
        <Table title="By job" rows={sorted(u.byJob)} />
      </div>
      <Table title="By day" rows={Object.entries(u.byDay).sort((a, b) => b[0].localeCompare(a[0]))} />
    </div>
  );
}
