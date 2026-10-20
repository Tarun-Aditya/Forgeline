"use client";
import { useMemo, useState } from "react";
import { usePoll } from "@/components/use-poll";
import { buildLanes, fmtDur, jobStats, ORDER, type JobStats } from "@/lib/agents";
import type { ActivityEvent, SessionState } from "@/lib/activity";
import type { Job } from "@/lib/jobs";
import { cn } from "@/lib/utils";

function useStats(repo: string, id: string | null) {
  const q = id ? `repo=${encodeURIComponent(repo)}` : "";
  const { data: act } = usePoll<{ events: ActivityEvent[]; sessions: SessionState[] }>(id ? `/api/activity?${q}&job=${encodeURIComponent(id)}&limit=2000` : null, 5000, "activity");
  const { data: cost } = usePoll<{ cost: Record<string, { costUsd: number; tokens: number }> }>(id ? `/api/jobs/${encodeURIComponent(id)}?${q}&cost=1` : null, 15000, "runs");
  return useMemo<JobStats | null>(() => (act ? jobStats(buildLanes(act.events, Date.now(), new Set()), cost?.cost) : null), [act, cost]);
}

const money = (n: number) => (n >= 0.005 ? `$${n.toFixed(2)}` : "–");

/** Lower is better for every row here, so the smaller number is marked. */
function Row({ label, a, b, fmt }: { label: string; a: number; b: number; fmt: (n: number) => string }) {
  const better = a === b ? null : a < b ? "a" : "b";
  return (
    <tr className="border-t">
      <td className="py-1.5 pr-3 text-muted-foreground">{label}</td>
      <td className={cn("tabular-nums", better === "a" && "font-medium text-ok")}>{fmt(a)}</td>
      <td className={cn("tabular-nums", better === "b" && "font-medium text-ok")}>{fmt(b)}</td>
    </tr>
  );
}

/** Two jobs side by side: which agents took the time and the money. */
export function CompareView({ repo, jobs, first }: { repo: string; jobs: Job[]; first: string | null }) {
  const ids = [...jobs].reverse().map((j) => j.id);
  const [a, setA] = useState<string | null>(first ?? ids[0] ?? null);
  const [b, setB] = useState<string | null>(ids.find((i) => i !== (first ?? ids[0])) ?? null);
  const sa = useStats(repo, a);
  const sb = useStats(repo, b);
  const ja = jobs.find((j) => j.id === a);
  const jb = jobs.find((j) => j.id === b);

  if (jobs.length < 2) return <p className="p-6 text-sm text-muted-foreground">Comparing needs at least two jobs.</p>;
  const agents = [...new Set([...Object.keys(sa?.perAgent ?? {}), ...Object.keys(sb?.perAgent ?? {})])].sort((x, y) => (ORDER.includes(x) ? ORDER.indexOf(x) : 99) - (ORDER.includes(y) ? ORDER.indexOf(y) : 99));
  const maxMs = Math.max(1, ...agents.filter((x) => x !== "orchestrator").flatMap((x) => [sa?.perAgent[x]?.ms ?? 0, sb?.perAgent[x]?.ms ?? 0]));
  const maxCost = Math.max(0.01, ...agents.flatMap((x) => [sa?.perAgent[x]?.costUsd ?? 0, sb?.perAgent[x]?.costUsd ?? 0]));
  const select = (value: string | null, set: (v: string) => void, label: string) => (
    <select className="min-w-0 max-w-full rounded-md border bg-background px-2 py-1 text-sm" value={value ?? ""} onChange={(e) => set(e.target.value)} aria-label={label}>
      {ids.map((id) => <option key={id} value={id}>{id}</option>)}
    </select>
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><div className="text-xs text-claude">Job A</div>{select(a, setA, "Job A")}<p className="line-clamp-2 text-xs text-muted-foreground">{ja?.feature}</p></div>
        <div className="space-y-1"><div className="text-xs text-muted-foreground">Job B</div>{select(b, setB, "Job B")}<p className="line-clamp-2 text-xs text-muted-foreground">{jb?.feature}</p></div>
      </div>

      {!sa || !sb ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <table className="w-full max-w-xl text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1 font-normal" /><th className="font-normal">A</th><th className="font-normal">B</th></tr></thead>
            <tbody>
              <Row label="Elapsed (waits included)" a={sa.elapsed} b={sb.elapsed} fmt={fmtDur} />
              <Row label="Agents working" a={sa.agentTime} b={sb.agentTime} fmt={fmtDur} />
              <Row label="Review rounds" a={ja?.round ?? 0} b={jb?.round ?? 0} fmt={String} />
              <Row label="Tool calls" a={sa.toolCalls} b={sb.toolCalls} fmt={(n) => n.toLocaleString()} />
              <Row label="Estimated cost" a={sa.costUsd} b={sb.costUsd} fmt={money} />
            </tbody>
          </table>

          <section>
            <h3 className="mb-2 text-sm font-medium">By agent <span className="font-normal text-muted-foreground">(time working · estimated cost)</span></h3>
            <ul className="space-y-2">
              {agents.filter((x) => x !== "orchestrator").map((agent) => {
                const x = sa.perAgent[agent];
                const y = sb.perAgent[agent];
                return (
                  <li key={agent} className="grid grid-cols-[110px_1fr] items-center gap-3 text-xs">
                    <span className="truncate font-mono">{agent}</span>
                    <div className="space-y-1">
                      {[[x, "bg-claude/80"], [y, "bg-muted-foreground/60"]].map(([v, color], i) => {
                        const d = v as typeof x | undefined;
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <div className="h-2 flex-1 rounded bg-muted"><div className={cn("h-2 rounded", color as string)} style={{ width: `${((d?.ms ?? 0) / maxMs) * 100}%` }} /></div>
                            <span className="w-28 shrink-0 text-right tabular-nums text-muted-foreground">{d ? fmtDur(d.ms) : "–"} · {money(d?.costUsd ?? 0)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground">Orange is job A, grey is job B. Bars share one scale (max {fmtDur(maxMs)}; most expensive agent {money(maxCost)}).</p>
          </section>
        </>
      )}
    </div>
  );
}
