"use client";
import { MessageSquarePlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AgentsView } from "@/components/agents-view";
import { ActivityView, type ActivityData } from "@/components/activity-view";
import { Board } from "@/components/board";
import { JobDrawer } from "@/components/job-drawer";
import { MetricsView } from "@/components/metrics-view";
import type { Options } from "@/components/run-panel";
import { RunsPanel } from "@/components/runs-panel";
import { NotifyButton, useAttention } from "@/components/notify";
import { RunsView, type Run } from "@/components/runs-view";
import { ThemeToggle } from "@/components/theme-toggle";
import { ShortcutsHelp, useHelp, useShortcuts, type Tab } from "@/components/shortcuts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ChangesProvider, usePoll, usePushConnected } from "@/components/use-poll";
import type { Job } from "@/lib/jobs";
import type { McpServer } from "@/lib/mcp";
import type { Question } from "@/lib/questions";
import type { Repo } from "@/lib/repos";
import type { Warning } from "@/lib/repocheck";
import type { ExternalSession } from "@/lib/external";

export function AppShell() {
  const { data: repoData } = usePoll<{ repos: Repo[] }>("/api/repos", 30000);
  const repos = repoData?.repos ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const repo = picked ?? repos.find((r) => r.ready)?.path ?? repos[0]?.path ?? null;
  return (
    <ChangesProvider repo={repo}>
      <Shell repo={repo} repos={repos} onPick={setPicked} />
    </ChangesProvider>
  );
}

function Shell({ repo, repos, onPick }: { repo: string | null; repos: Repo[]; onPick: (path: string) => void }) {
  const q = repo ? encodeURIComponent(repo) : null;

  const { data: jobData, error: jobError } = usePoll<{ jobs: Job[]; stages: { key: string; label: string; who: string }[]; active: { jobKey: string | null }[]; questions: Record<string, Question> }>(q && `/api/jobs?repo=${q}`, 2000, ["jobs", "runs"]);
  const { data: mcpData } = usePoll<{ servers: McpServer[] }>(q && `/api/mcp?repo=${q}`, 60000);

  const { data: activity, error: activityError } = usePoll<ActivityData>(q && `/api/activity?repo=${q}`, 2000, "activity");
  const [tab, setTab] = useState<Tab>("board");
  const help = useHelp();
  const [sheet, setSheet] = useState(false);
  useShortcuts(setTab, help.show);
  const [open, setOpen] = useState<string | null>(null);
  const [options, setOptions] = useState<Options>({ type: "feature", ticket: "", mcpOff: [] });

  const servers = mcpData?.servers ?? [];
  const mcp = useMemo(
    () => (options.mcpOff.length ? servers.map((s) => s.name).filter((n) => !options.mcpOff.includes(n)) : undefined),
    [options.mcpOff, servers],
  );
  const jobs = jobData?.jobs ?? [];
  const questions = jobData?.questions ?? {};

  const { data: checkData } = usePoll<{ warnings: Warning[] }>(q && `/api/repos/check?repo=${q}`, 10000);

  const { data: sessData } = usePoll<{ sessions: ExternalSession[] }>(q && `/api/sessions?repo=${q}`, 5000, "activity");

  // Runs are independent processes, so any number can go at once. This panel just follows one of them.
  const { data: runData } = usePoll<{ runs: Run[] }>("/api/runs", 2000, "runs");
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Run | null>(null); // a run just started, before the next poll lists it
  const [posting, setPosting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const polled = (runData?.runs ?? []).filter((r) => r.repo === repo);
  const runs = fresh && !polled.some((r) => r.runId === fresh.runId) ? [fresh, ...polled] : polled;
  useEffect(() => { if (fresh && polled.some((r) => r.runId === fresh.runId)) setFresh(null); }, [fresh, polled]);

  // Starts a run and follows it in the panel. `prompt` and `jobIds` fill the panel's row until the next poll lists it.
  const start = useCallback(
    async (payload: { text: string; type?: Options["type"]; ticket?: string; answer?: string }, prompt: string, jobIds: string[]) => {
      if (!repo) return;
      setPosting(true);
      setSubmitError(null);
      try {
        const res = await fetch("/api/runs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ repo, ...payload, mcp }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setFresh({ runId: body.runId, repo, prompt, startedAt: new Date().toISOString(), status: "running", jobIds });
        setSelectedRun(body.runId);
      } catch (e) {
        setSubmitError(e instanceof Error ? e.message : "Could not start the run.");
      } finally {
        setPosting(false);
      }
    },
    [repo, mcp],
  );
  const submit = useCallback(
    (text: string) => {
      const prompt = text.trim().startsWith("/factory") ? text.trim() : `/factory ${text.trim()}`;
      return start({ text, type: options.type, ticket: options.ticket.trim() || undefined }, prompt, []);
    },
    [start, options],
  );
  // An answer continues the session that stopped on the job, so no new job card is expected.
  const answer = useCallback((jobId: string, text: string) => start({ text, answer: jobId }, text.trim(), [jobId]), [start]);
  const stop = useCallback((id: string) => { fetch(`/api/runs/${id}/stop`, { method: "POST" }); }, []);

  // The latest finished run's closing message per job, so a refused merge or a question shows on the card.
  const notes = new Map<string, string>();
  for (const r of runs) if (r.status !== "running" && r.message) for (const id of r.jobIds) if (!notes.has(id)) notes.set(id, r.message);

  // A new task has no job card until its agent creates one; each such run shows a "starting" card.
  const NOT_A_NEW_JOB = /^\/factory\s+(accept|approve|approve-spec|respec|rework|resume|stop|next|metrics|review|doctor|init)\b/i;
  const starting = runs.filter((r) => r.status === "running" && r.jobIds.length === 0 && !NOT_A_NEW_JOB.test(r.prompt)).map((r) => r.prompt.replace(/^\/factory\s+/, ""));
  // "Running" comes from the shared activity log, so it is true for jobs driven from any surface.
  const sessions = activity?.sessions ?? [];
  const finished = new Set(jobs.filter((j) => j.stage === "merged").map((j) => j.id)); // nothing can be working on these
  const runningAll = new Set([
    ...(jobData?.active ?? []).map((a) => a.jobKey).filter((k): k is string => !!k),
    ...runs.filter((r) => r.status === "running").flatMap((r) => r.jobIds),
    ...sessions.filter((s) => s.state === "running" && s.job).map((s) => s.job as string),
  ]);
  const running = new Set([...runningAll].filter((id) => !finished.has(id)));
  const trouble = new Map<string, "stalled" | "crashed">(
    sessions.flatMap((s) => (s.job && (s.state === "stalled" || s.state === "crashed") ? [[s.job, s.state] as [string, "stalled" | "crashed"]] : [])),
  );
  const needMe = jobs.filter((j) => j.stage === "spec-approval" || j.stage === "needs-human" || (questions[j.id] && !running.has(j.id))).length;
  const pushed = usePushConnected();
  const alerts = useAttention(repo, jobs, trouble, new Set(Object.keys(questions).filter((id) => !running.has(id))), needMe);

  const panel = (
    <RunsPanel repo={repo ?? ""} sessions={sessData?.sessions ?? []} warnings={checkData?.warnings ?? []} runs={runs} selected={selectedRun} onSelect={setSelectedRun} error={submitError} posting={posting} servers={servers} options={options} onOptions={setOptions} onSubmit={submit} onStop={stop} />
  );

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2 sm:px-4">
        <h1 className="text-sm font-semibold tracking-tight">Forgeline</h1>
        <select className="min-w-0 max-w-[45vw] rounded-md border bg-background px-2 py-1 text-sm sm:max-w-none" value={repo ?? ""} onChange={(e) => onPick(e.target.value)} aria-label="Repository">
          {repos.map((r) => (
            <option key={r.path} value={r.path} disabled={!r.ready}>{r.name}{r.ready ? "" : " (no factory)"}</option>
          ))}
        </select>
        <nav className="order-last -mx-1 flex w-full gap-1 overflow-x-auto px-1 sm:order-none sm:mx-0 sm:ml-2 sm:w-auto sm:overflow-visible sm:px-0" aria-label="Sections">
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
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground"><NotifyButton {...alerts} /><ThemeToggle /><Button size="sm" variant="ghost" onClick={help.show} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">?</Button><span className="hidden sm:inline">{jobError ? <span className="text-destructive">{jobError}</span> : pushed ? "● live" : "polling"}</span></span>
      </header>
      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-auto p-4">
          {!repo ? (
            <p className="text-sm text-muted-foreground">No repository with the factory installed. Set FORGELINE_REPOS to a path list.</p>
          ) : tab === "board" ? (
            <Board starting={starting} jobs={jobs} stages={jobData?.stages ?? []} running={running} trouble={trouble} questions={questions} busy={posting} onOpen={setOpen} onAnswer={answer} />
          ) : tab === "agents" ? (
            <AgentsView notes={notes} starting={starting} repo={repo} jobs={jobs} stages={jobData?.stages ?? []} busy={posting} running={running} trouble={trouble} questions={questions} onCommand={submit} onOpen={setOpen} onAnswer={answer} />
          ) : tab === "activity" ? (
            <ActivityView data={activity} error={activityError} />
          ) : tab === "runs" ? (
            <RunsView />
          ) : (
            <MetricsView repo={repo} />
          )}
        </main>
        <aside className="hidden w-[400px] shrink-0 border-l md:block">{panel}</aside>
      </div>
      {/* On narrow screens the side panel is hidden; this opens the same panel as a sheet. */}
      <Button className="fixed bottom-4 right-4 z-30 rounded-full shadow-lg md:hidden" onClick={() => setSheet(true)} aria-label="New task and runs">
        <MessageSquarePlus className="size-4" /> New task{runs.some((r) => r.status === "running") && <span className="ml-1 size-2 animate-pulse rounded-full bg-current" />}
      </Button>
      <Dialog open={sheet} onOpenChange={setSheet}>
        <DialogContent className="flex h-[88vh] max-w-lg flex-col gap-0 overflow-hidden p-0">
          <DialogTitle className="sr-only">New task and runs</DialogTitle>
          {panel}
        </DialogContent>
      </Dialog>
      <ShortcutsHelp open={help.open} onClose={help.hide} />
      {repo && <JobDrawer job={jobs.find((j) => j.id === open)} repo={repo} busy={posting} working={!!open && running.has(open)} note={open ? notes.get(open) : undefined} question={open ? questions[open] : undefined} onClose={() => setOpen(null)} onCommand={submit} onAnswer={answer} />}
    </div>
  );
}
