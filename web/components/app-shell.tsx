"use client";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentsView } from "@/components/agents-view";
import { ActivityView, type ActivityData } from "@/components/activity-view";
import { Board } from "@/components/board";
import { JobDrawer } from "@/components/job-drawer";
import { MetricsView } from "@/components/metrics-view";
import { RunPanel, type Options } from "@/components/run-panel";
import { RunsView } from "@/components/runs-view";
import { Button } from "@/components/ui/button";
import { usePoll } from "@/components/use-poll";
import type { Job } from "@/lib/jobs";
import type { McpServer } from "@/lib/mcp";
import type { Question } from "@/lib/questions";
import type { Repo } from "@/lib/repos";

export function AppShell() {
  const { data: repoData } = usePoll<{ repos: Repo[] }>("/api/repos", 30000);
  const repos = repoData?.repos ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const repo = picked ?? repos.find((r) => r.ready)?.path ?? repos[0]?.path ?? null;
  const q = repo ? encodeURIComponent(repo) : null;

  const { data: jobData, error: jobError } = usePoll<{ jobs: Job[]; stages: { key: string; label: string; who: string }[]; active: { jobKey: string | null }[]; questions: Record<string, Question> }>(q && `/api/jobs?repo=${q}`);
  const { data: mcpData } = usePoll<{ servers: McpServer[] }>(q && `/api/mcp?repo=${q}`, 60000);

  const { data: activity, error: activityError } = usePoll<ActivityData>(q && `/api/activity?repo=${q}`, 2000);
  const [tab, setTab] = useState<"board" | "agents" | "activity" | "runs" | "metrics">("board");
  const [open, setOpen] = useState<string | null>(null);
  const [options, setOptions] = useState<Options>({ type: "feature", ticket: "", mcpOff: [] });
  const runId = useRef<string | null>(null);

  const servers = mcpData?.servers ?? [];
  const mcp = useMemo(
    () => (options.mcpOff.length ? servers.map((s) => s.name).filter((n) => !options.mcpOff.includes(n)) : undefined),
    [options.mcpOff, servers],
  );
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const { messages, sendMessage, status, error } = useChat({
    transport,
    onData: (part) => {
      if (part.type === "data-run") runId.current = (part.data as { runId: string }).runId;
    },
  });
  const busy = status === "submitted" || status === "streaming";

  // A new task has no job card until the agent creates one; show "starting" in the meantime.
  const [starting, setStarting] = useState<string | null>(null);
  const jobCount = useRef(0);
  const before = useRef(0);
  const sawBusy = useRef(false);

  const submit = useCallback(
    (text: string) => {
      if (!repo) return;
      if (!/^\/factory\s+(accept|approve|approve-spec|respec|rework|resume|next|metrics|doctor|init)\b/i.test(text.trim())) {
        before.current = jobCount.current;
        sawBusy.current = false;
        setStarting(text.trim());
      }
      sendMessage({ text }, { body: { repo, type: options.type, ticket: options.ticket.trim() || undefined, mcp } });
    },
    [repo, options, mcp, sendMessage],
  );
  // An answer continues the session that stopped on the job, so no new job card is expected.
  const answer = useCallback(
    (jobId: string, text: string) => {
      if (!repo) return;
      sendMessage({ text }, { body: { repo, answer: jobId, mcp } });
    },
    [repo, mcp, sendMessage],
  );
  const stop = useCallback(() => {
    if (runId.current) fetch(`/api/runs/${runId.current}/stop`, { method: "POST" });
  }, []);

  const jobs = jobData?.jobs ?? [];
  const questions = jobData?.questions ?? {};
  jobCount.current = jobs.length;
  useEffect(() => {
    if (!starting) return;
    if (jobs.length > before.current) setStarting(null); // the job card exists now
    else if (busy) sawBusy.current = true;
    else if (sawBusy.current) setStarting(null); // the run ended without creating a job
  }, [starting, jobs.length, busy]);
  // "Running" comes from the shared activity log, so it is true for jobs driven from any surface.
  const sessions = activity?.sessions ?? [];
  const running = new Set([
    ...(jobData?.active ?? []).map((a) => a.jobKey).filter((k): k is string => !!k),
    ...sessions.filter((s) => s.state === "running" && s.job).map((s) => s.job as string),
  ]);
  const trouble = new Map<string, "stalled" | "crashed">(
    sessions.flatMap((s) => (s.job && (s.state === "stalled" || s.state === "crashed") ? [[s.job, s.state] as [string, "stalled" | "crashed"]] : [])),
  );
  const needMe = jobs.filter((j) => j.stage === "spec-approval" || j.stage === "needs-human" || (questions[j.id] && !running.has(j.id))).length;

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
            <Board starting={starting} jobs={jobs} stages={jobData?.stages ?? []} running={running} trouble={trouble} questions={questions} busy={busy} onOpen={setOpen} onAnswer={answer} />
          ) : tab === "agents" ? (
            <AgentsView starting={starting} repo={repo} jobs={jobs} stages={jobData?.stages ?? []} busy={busy} running={running} trouble={trouble} questions={questions} onCommand={submit} onOpen={setOpen} onAnswer={answer} />
          ) : tab === "activity" ? (
            <ActivityView data={activity} error={activityError} />
          ) : tab === "runs" ? (
            <RunsView />
          ) : (
            <MetricsView repo={repo} />
          )}
        </main>
        <aside className="hidden w-[400px] shrink-0 border-l md:block">
          <RunPanel messages={messages} status={status} error={error} servers={servers} options={options} onOptions={setOptions} onSubmit={submit} onStop={stop} />
        </aside>
      </div>
      {repo && <JobDrawer job={jobs.find((j) => j.id === open)} repo={repo} busy={busy} working={!!open && running.has(open)} question={open ? questions[open] : undefined} onClose={() => setOpen(null)} onCommand={submit} onAnswer={answer} />}
    </div>
  );
}
