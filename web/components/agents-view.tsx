"use client";
import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AgentFlow } from "@/components/agent-flow";
import { ReviewChips } from "@/components/board";
import { Actions, isStuck, useJobCommand, WorkingBanner } from "@/components/job-drawer";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePoll } from "@/components/use-poll";
import { buildLanes, fmtDur } from "@/lib/agents";
import type { ActivityEvent } from "@/lib/activity";
import type { Job } from "@/lib/jobs";
import { cn } from "@/lib/utils";

const ROW = 44;
const LABEL = 150;

/** How each agent worked on one job: who ran when, who ran together, and what each one did. */
type Props = {
  starting: string[]; repo: string; jobs: Job[]; stages: { key: string; label: string }[]; busy: boolean; running: Set<string>;
  trouble: Map<string, "stalled" | "crashed">; onCommand: (text: string) => void; onOpen: (id: string) => void;
};

export function AgentsView({ starting, repo, jobs, stages, busy, running, trouble, onCommand, onOpen }: Props) {
  const [picked, setPicked] = useState<string | null>(null);
  const [agent, setAgent] = useState<string | null>(null);
  const [mode, setMode] = useState<"flow" | "timeline">("flow");
  // A job that appears after the page loaded (you just started it) becomes the selected one.
  const known = useRef<Set<string> | null>(null);
  const jobKey = jobs.map((j) => j.id).join("|");
  useEffect(() => {
    const ids = jobs.map((j) => j.id);
    if (known.current && jobs.length > 0) {
      const fresh = ids.filter((id) => !known.current!.has(id));
      if (fresh.length) setPicked(fresh.at(-1)!);
    }
    if (jobs.length > 0) known.current = new Set(ids);
  }, [jobKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const job = picked && jobs.some((j) => j.id === picked) ? picked : (jobs.at(-1)?.id ?? null);
  useEffect(() => setAgent(null), [job]);
  const { data, error } = usePoll<{ events: ActivityEvent[] }>(job ? `/api/activity?repo=${encodeURIComponent(repo)}&job=${encodeURIComponent(job)}&limit=1000` : null, 2000);
  const current = jobs.find((j) => j.id === job);
  const { locked, mine, send, reset } = useJobCommand(current, busy, !!job && running.has(job), onCommand);
  useEffect(reset, [job]);
  const view = useMemo(() => (data ? buildLanes(data.events) : null), [data]);

  if (starting.length > 0 && jobs.length === 0) return <div className="space-y-2">{starting.map((t, i) => <Starting key={i} text={t} />)}</div>;
  if (jobs.length === 0) return <p className="p-8 text-center text-sm text-muted-foreground">No jobs yet. Start one from the panel on the right and its agents will show up here.</p>;
  const span = view ? view.t1 - view.t0 : 1;
  const pct = (t: number) => `${((t - (view?.t0 ?? 0)) / span) * 100}%`;
  const orchestrator = view?.lanes.findIndex((l) => l.agent === "orchestrator") ?? -1;
  const selected = view?.lanes.find((l) => l.agent === agent);
  const events = (data?.events ?? []).filter((e) => e.agent === agent && e.ev !== "tool_done").reverse();

  return (
    <div className="space-y-4">
      {starting.map((t, i) => <Starting key={i} text={t} />)}
      <div className="flex flex-wrap items-center gap-3">
        <select className="rounded-md border bg-background px-2 py-1 text-sm" value={job ?? ""} onChange={(e) => setPicked(e.target.value)} aria-label="Job">
          {[...jobs].reverse().map((j) => <option key={j.id} value={j.id}>{j.id} · {j.stage}</option>)}
        </select>
        <div className="flex rounded-md border p-0.5 text-sm" role="group" aria-label="View">
          {(["flow", "timeline"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m} className={cn("rounded px-3 py-0.5 capitalize", mode === m ? "bg-secondary" : "text-muted-foreground hover:text-foreground")}>{m}</button>
          ))}
        </div>
        {view && view.lanes.length > 0 && <span className="text-xs text-muted-foreground">{view.lanes.length} agents · {fmtDur(span)}</span>}
      </div>
      {current && (
        <section className={cn("space-y-2 rounded-lg border bg-card p-3", (current.stage === "spec-approval" || current.stage === "needs-human") && "border-call/60")}>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {(mine || running.has(current.id)) && <span className="size-2 animate-pulse rounded-full bg-ok" aria-label="agent running" />}
            <span className="font-mono text-muted-foreground">{current.id}</span>
            <Badge variant="secondary">{stages.find((s) => s.key === current.stage)?.label ?? current.stage}</Badge>
            {(current.stage === "spec-approval" || current.stage === "needs-human") && <Badge className="bg-call text-white">your call</Badge>}
            {trouble.get(current.id) && <Badge className="bg-destructive text-white">{trouble.get(current.id)}</Badge>}
            <Badge variant="secondary">{current.type}</Badge>
            {current.ticket && <Badge variant="secondary">{current.ticket}</Badge>}
            {current.paused && <Badge className="bg-warn/20 text-warn">paused</Badge>}
            <span className="ml-auto"><ReviewChips job={current} /></span>
            <Button size="sm" variant="ghost" onClick={() => onOpen(current.id)}>Open files</Button>
          </div>
          <p className="text-sm">{current.feature}</p>
          {mine && <WorkingBanner />}
          <Actions job={current} busy={locked} stuck={isStuck(current, running.has(current.id))} onCommand={send} />
        </section>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {data && view && view.lanes.length === 0 && <p className="text-sm text-muted-foreground">No agent activity recorded for this job yet.</p>}
      {view && view.lanes.length > 0 && mode === "flow" && <AgentFlow view={view} events={data?.events ?? []} jobKey={job ?? ""} selected={agent} onSelect={setAgent} />}
      {view && view.lanes.length > 0 && mode === "timeline" && (
        <div className="rounded-lg border bg-card p-3">
          <div className="flex">
            <div className="shrink-0" style={{ width: LABEL }}>
              {view.lanes.map((l) => (
                <button key={l.agent} onClick={() => setAgent(l.agent)} className={cn("flex w-full flex-col justify-center rounded px-1 text-left hover:bg-accent", agent === l.agent && "bg-accent")} style={{ height: ROW }}>
                  <span className="truncate text-sm">{l.agent}</span>
                  <span className="text-[11px] text-muted-foreground">{l.tools} tool calls · {fmtDur(l.spans.reduce((n, s) => n + s.end - s.start, 0))}</span>
                </button>
              ))}
            </div>
            <div className="relative min-w-0 flex-1" style={{ height: view.lanes.length * ROW }}>
              {view.lanes.map((l, i) => <div key={l.agent} className="absolute inset-x-0 border-t" style={{ top: i * ROW, height: ROW }} />)}
              {/* hand-offs: a line from the orchestrator to each agent it started */}
              {orchestrator >= 0 && view.lanes.flatMap((l, i) => (l.agent === "orchestrator" ? [] : l.spans.map((s, k) => (
                <div key={`${l.agent}-${k}`} className="absolute w-px bg-muted-foreground/40" style={{ left: pct(s.start), top: Math.min(i, orchestrator) * ROW + ROW / 2, height: Math.abs(i - orchestrator) * ROW }} />
              ))))}
              {view.lanes.map((l, i) => l.spans.map((s, k) => (
                <button
                  key={`${l.agent}-b${k}`}
                  onClick={() => setAgent(l.agent)}
                  title={`${l.agent}: ${fmtDur(s.end - s.start)}${s.open ? " (still running)" : ""}`}
                  className={cn("absolute h-6 min-w-1.5 rounded-sm", l.agent === "orchestrator" ? "bg-muted-foreground/40" : "bg-primary/70", s.open && "animate-pulse bg-ok", agent === l.agent && "ring-2 ring-ring")}
                  style={{ left: pct(s.start), width: `${Math.max(((s.end - s.start) / span) * 100, 0.4)}%`, top: i * ROW + (ROW - 24) / 2 }}
                />
              )))}
            </div>
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-muted-foreground" style={{ marginLeft: LABEL }}>
            <span>{new Date(view.t0).toLocaleTimeString()}</span><span>{new Date(view.t1).toLocaleTimeString()}</span>
          </div>
        </div>
      )}
      {selected && (
        <section className="rounded-lg border bg-card p-3">
          <h3 className="mb-2 text-sm font-medium">{selected.agent}</h3>
          <ol className="space-y-0.5 font-mono text-xs">
            {events.length === 0 && <li className="text-muted-foreground">No messages from this agent.</li>}
            {events.map((e, i) => (
              <li key={`${e.ts}-${i}`} className="flex gap-2">
                <span className="shrink-0 text-muted-foreground">{e.ts.slice(11, 19)}</span>
                <span className="w-24 shrink-0 truncate text-muted-foreground">{e.ev === "tool" ? e.tool : e.ev}</span>
                <span className="min-w-0 flex-1 truncate" title={e.text}>{e.text}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

/** Shown between pressing Enter and the job card existing: the orchestrator is reading the request. */
function Starting({ text }: { text: string }) {
  return (
    <section role="status" className="flex items-center gap-4 rounded-lg border border-dashed border-claude/60 bg-claude/5 p-3">
      <span className="agent-active grid size-12 shrink-0 place-items-center rounded-full border-2 border-claude text-claude" style={{ animation: "agent-ring 1.4s ease-out infinite" }}>
        <Sparkles className="size-6" />
      </span>
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 text-sm text-claude"><Spinner className="size-3.5" /> Starting a new job…</div>
        <p className="truncate text-sm" title={text}>{text}</p>
        <p className="text-xs text-muted-foreground">The orchestrator is reading your request. The job card and its agents appear here in a few seconds.</p>
      </div>
    </section>
  );
}
