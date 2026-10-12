"use client";
import { useCallback, useEffect, useState } from "react";
import { AgentsView } from "@/components/agents-view";
import { ActivityView, type ActivityData } from "@/components/activity-view";
import { Board } from "@/components/board";
import { JobDrawer } from "@/components/job-drawer";
import { MetricsView } from "@/components/metrics-view";
import type { Options } from "@/components/run-panel";
import { RunsPanel } from "@/components/runs-panel";
import { RunsView, type Run } from "@/components/runs-view";
import { Button } from "@/components/ui/button";
import { usePoll } from "@/components/use-poll";
import type { Job } from "@/lib/jobs";
import type { McpServer } from "@/lib/mcp";
import type { Repo } from "@/lib/repos";

export function AppShell() {
  const { data: repoData } = usePoll<{ repos: Repo[] }>("/api/repos", 30000);
  const repos = repoData?.repos ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const repo = picked ?? repos.find((r) => r.ready)?.path ?? repos[0]?.path ?? null;
  const q = repo ? encodeURIComponent(repo) : null;

  const { data: jobData, error: jobError } = usePoll<{ jobs: Job[]; stages: { key: string; label: string; who: string }[]; active: { jobKey: string | null }[] }>(q && `/api/jobs?repo=${q}`);
  const { data: mcpData } = usePoll<{ servers: McpServer[] }>(q && `/api/mcp?repo=${q}`, 60000);

  const { data: activity, error: activityError } = usePoll<ActivityData>(q && `/api/activity?repo=${q}`, 2000);
  const [tab, setTab] = useState<"board" | "agents" | "activity" | "runs" | "metrics">("board");
  const [open, setOpen] = useState<string | null>(null);
  const [options, setOptions] = useState<Options>({ type: "feature", ticket: "", mcpOff: [] });

  const servers = mcpData?.servers ?? [];
  const jobs = jobData?.jobs ?? [];

  // Runs are independent processes, so any number can go at once. This panel just follows one of them.
  const { data: runData } = usePoll<{ runs: Run[] }>("/api/runs", 2000);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Run | null>(null); // a run just started, before the next poll lists it
  const [posting, setPosting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const polled = (runData?.runs ?? []).filter((r) => r.repo === repo);
  const runs = fresh && !polled.some((r) => r.runId === fresh.runId) ? [fresh, ...polled] : polled;
  useEffect(() => { if (fresh && polled.some((r) => r.runId === fresh.runId)) setFresh(null); }, [fresh, polled]);

  const submit = useCallback(
    async (text: string) => {
      if (!repo) return;
      setPosting(true);
      setSubmitError(null);
      try {
        const mcp = options.mcpOff.length ? servers.map((s) => s.name).filter((n) => !options.mcpOff.includes(n)) : undefined;
        const res = await fetch("/api/runs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ repo, text, type: options.type, ticket: options.ticket.trim() || undefined, mcp }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setFresh({ runId: body.runId, repo, prompt: text.trim().startsWith("/factory") ? text.trim() : `/factory ${text.trim()}`, startedAt: new Date().toISOString(), status: "running", jobIds: [] });
        setSelectedRun(body.runId);
      } catch (e) {
        setSubmitError(e instanceof Error ? e.message : "Could not start the run.");
      } finally {
        setPosting(false);
      }
    },
    [repo, options, servers],
  );
  const stop = useCallback((id: string) => { fetch(`/api/runs/${id}/stop`, { method: "POST" }); }, []);

  // The latest finished run's closing message per job, so a refused merge or a question shows on the card.
  const notes = new Map<string, string>();
  for (const r of runs) if (r.status !== "running" && r.message) for (const id of r.jobIds) if (!notes.has(id)) notes.set(id, r.message);

  // A new task has no job card until its agent creates one; each such run shows a "starting" card.
  const NOT_A_NEW_JOB = /^\/factory\s+(accept|approve|approve-spec|respec|rework|resume|stop|next|metrics|review|doctor|init)\b/i;
  const starting = runs.filter((r) => r.status === "running" && r.jobIds.length === 0 && !NOT_A_NEW_JOB.test(r.prompt)).map((r) => r.prompt.replace(/^\/factory\s+/, ""));
  // "Running" comes from the shared activity log, so it is true for jobs driven from any surface.
  const sessions = activity?.sessions ?? [];
  const running = new Set([
    ...(jobData?.active ?? []).map((a) => a.jobKey).filter((k): k is string => !!k),
    ...runs.filter((r) => r.status === "running").flatMap((r) => r.jobIds),
    ...sessions.filter((s) => s.state === "running" && s.job).map((s) => s.job as string),
  ]);
  const trouble = new Map<string, "stalled" | "crashed">(
    sessions.flatMap((s) => (s.job && (s.state === "stalled" || s.state === "crashed") ? [[s.job, s.state] as [string, "stalled" | "crashed"]] : [])),
  );
  const needMe = jobs.filter((j) => j.stage === "spec-approval" || j.stage === "needs-human").length;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-2">
        <h1 className="text-sm font-semibold tracking-tight">Forgeline</h1>
        <select className="rounded-md border bg-background px-2 py-1 text-sm" value={repo ?? ""} onChange={(e) => setPicked(e.target.value)} aria-label="Repository">
          {repos.map((r) => (
            <option key={r.path} value={r.path} disabled={!r.ready}>{r.name}{r.ready ? "" : " (no factory)"}</option>
          ))}
        </select>
        <nav className="ml-2 flex gap-1">
          <Button size="sm" variant={tab === "board" ? "secondary" : "ghost"} onClick={() => setTab("board")}>
            Board{needMe > 0 && <span className="ml-1.5 rounded-full bg-call px-1.5 text-[10px] text-white">{needMe}</span>}
          </Button>
          <Button size="sm" variant={tab === "agents" ? "secondary" : "ghost"} onClick={() => setTab("agents")}>Agents</Button>
          <Button size="sm" variant={tab === "activity" ? "secondary" : "ghost"} onClick={() => setTab("activity")}>
            Activity{trouble.size > 0 && <span className="ml-1.5 rounded-full bg-destructive px-1.5 text-[10px] text-white">{trouble.size}</span>}
          </Button>
          <Button size="sm" variant={tab === "runs" ? "secondary" : "ghost"} onClick={() => setTab("runs")}>Runs</Button>
          <Button size="sm" variant={tab === "metrics" ? "secondary" : "ghost"} onClick={() => setTab("metrics")}>Metrics</Button>
        </nav>
        <span className="ml-auto text-xs text-muted-foreground">{jobError ? <span className="text-destructive">{jobError}</span> : "live · 2s"}</span>
      </header>
      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-auto p-4">
          {!repo ? (
            <p className="text-sm text-muted-foreground">No repository with the factory installed. Set FORGELINE_REPOS to a path list.</p>
          ) : tab === "board" ? (
            <Board starting={starting} jobs={jobs} stages={jobData?.stages ?? []} running={running} trouble={trouble} onOpen={setOpen} />
          ) : tab === "agents" ? (
            <AgentsView notes={notes} starting={starting} repo={repo} jobs={jobs} stages={jobData?.stages ?? []} busy={posting} running={running} trouble={trouble} onCommand={submit} onOpen={setOpen} />
          ) : tab === "activity" ? (
            <ActivityView data={activity} error={activityError} />
          ) : tab === "runs" ? (
            <RunsView />
          ) : (
            <MetricsView repo={repo} />
          )}
        </main>
        <aside className="hidden w-[400px] shrink-0 border-l md:block">
          <RunsPanel runs={runs} selected={selectedRun} onSelect={setSelectedRun} error={submitError} posting={posting} servers={servers} options={options} onOptions={setOptions} onSubmit={submit} onStop={stop} />
        </aside>
      </div>
      {repo && <JobDrawer job={jobs.find((j) => j.id === open)} repo={repo} busy={posting} working={!!open && running.has(open)} note={open ? notes.get(open) : undefined} onClose={() => setOpen(null)} onCommand={submit} />}
    </div>
  );
}
