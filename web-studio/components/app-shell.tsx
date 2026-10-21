"use client";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityView, type ActivityData } from "@/components/activity-view";
import { Board } from "@/components/board";
import { AgentPanel, AgentsView, agentRows } from "@/components/agents-view";
import type { AgentInfo } from "@/lib/agents";
import { JobContext } from "@/components/job-context";
import { JobSwitcher } from "@/components/job-switcher";
import { JobPanel } from "@/components/job-panel";
import { JobDrawer } from "@/components/job-drawer";
import { MetricsView } from "@/components/metrics-view";
import { RunPanel, type Options } from "@/components/run-panel";
import { RunsView } from "@/components/runs-view";
import { CommandPalette, type PaletteItem } from "@/components/command-palette";
import { Panel, useDefaultLayout } from "react-resizable-panels";
import type { CSSProperties } from "react";
import { PanelGroup } from "@/components/resize/panel-group";
import { PanelSeparator } from "@/components/resize/separator";
import { Button } from "@/components/ui/button";
import { AppFrame, MainCard } from "@/components/app-frame";
import { navItemClasses } from "@/lib/ds/sidebar-nav-item-classes";
import { PageLayout } from "@/components/page-layout";
import { ActivityBelt, type Belt } from "@/components/status";
import { cn } from "@/lib/utils";
import { usePoll } from "@/components/use-poll";
import type { Job } from "@/lib/jobs";
import type { McpServer } from "@/lib/mcp";
import type { Repo } from "@/lib/repos";

// `Group` and `Panel` hardcode inline overflow, which would clip the frame rim and shadow.
const UNCLIPPED: CSSProperties = { overflow: "visible" };
const noStorage = { getItem: () => null, setItem: () => {} };
const layoutStorage = typeof window === "undefined" ? noStorage : window.localStorage;
const COLLAPSED_LAYOUT = { "studio-frame": 100 };

type Tab = "board" | "new" | "agents" | "activity" | "runs" | "metrics";

export function AppShell() {
  const { data: repoData } = usePoll<{ repos: Repo[] }>("/api/repos", 30000);
  const repos = repoData?.repos ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const repo = picked ?? repos.find((r) => r.ready)?.path ?? repos[0]?.path ?? null;
  const q = repo ? encodeURIComponent(repo) : null;

  const { data: jobData, error: jobError } = usePoll<{ jobs: Job[]; stages: { key: string; label: string; who: string }[]; active: { jobKey: string | null }[] }>(q && `/api/jobs?repo=${q}`);
  const { data: agentData, error: agentError } = usePoll<{ agents: AgentInfo[] }>(q && `/api/agents?repo=${q}`, 60000);
  const { data: mcpData } = usePoll<{ servers: McpServer[] }>(q && `/api/mcp?repo=${q}`, 60000);

  const { data: activity, error: activityError } = usePoll<ActivityData>(q && `/api/activity?repo=${q}`, 2000);
  const [tab, setTab] = useState<Tab>("board");
  const [open, setOpenRaw] = useState<string | null>(null);
  const setOpen = useCallback((id: string | null) => {
    setOpenRaw(id);
    try { id ? localStorage.setItem("forgeline.scope", id) : localStorage.removeItem("forgeline.scope"); } catch {}
  }, []);
  useEffect(() => {
    try { const v = localStorage.getItem("forgeline.scope"); if (v) setOpenRaw(v); } catch {}
  }, []);
  const [filesOpen, setFilesOpen] = useState(false);
  const [filesView, setFilesView] = useState<"docs" | "code">("docs");
  const [agentName, setAgentName] = useState<string | null>(null);
  const [options, setOptions] = useState<Options>({ type: "feature", ticket: "", mcpOff: [] });
  const runId = useRef<string | null>(null);

  const servers = mcpData?.servers ?? [];
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const { messages, sendMessage, status, error } = useChat({
    transport,
    onData: (part) => {
      if (part.type === "data-run") runId.current = (part.data as { runId: string }).runId;
    },
  });
  const busy = status === "submitted" || status === "streaming";

  const submit = useCallback(
    (text: string) => {
      if (!repo) return;
      setTab("new");
      const mcp = options.mcpOff.length ? servers.map((s) => s.name).filter((n) => !options.mcpOff.includes(n)) : undefined;
      sendMessage({ text }, { body: { repo, type: options.type, ticket: options.ticket.trim() || undefined, mcp } });
    },
    [repo, options, servers, sendMessage],
  );
  const stop = useCallback(() => {
    if (runId.current) fetch(`/api/runs/${runId.current}/stop`, { method: "POST" });
  }, []);

  const jobs = jobData?.jobs ?? [];
  // "Running" comes from the shared activity log, so it is true for jobs driven from any surface.
  const sessions = activity?.sessions ?? [];
  const running = new Set([
    ...(jobData?.active ?? []).map((a) => a.jobKey).filter((k): k is string => !!k),
    ...sessions.filter((s) => s.state === "running" && s.job).map((s) => s.job as string),
  ]);
  const trouble = new Map<string, "stalled" | "crashed">(
    sessions.flatMap((s) => (s.job && (s.state === "stalled" || s.state === "crashed") ? [[s.job, s.state] as [string, "stalled" | "crashed"]] : [])),
  );
  const needMe = jobs.filter((j) => j.stage === "spec-approval" || j.stage === "needs-human").length;

  const selected = jobs.find((j) => j.id === open);
  const scopedActivity = useMemo(() => (activity && open ? { sessions: activity.sessions.filter((s) => s.job === open), events: activity.events.filter((e) => e.job === open) } : activity), [activity, open]);
  const agentRowsList = useMemo(() => (agentData ? agentRows(agentData.agents, activity, Date.now(), open) : null), [agentData, activity]);
  const selectedAgent = agentRowsList?.find((a) => a.name === agentName);
  const showPanel = (tab === "board" && !!selected) || (tab === "agents" && !!selectedAgent);
  const { defaultLayout, onLayoutChange } = useDefaultLayout({ id: "studio-frame-layout-v1", storage: layoutStorage });
  const belt: Belt = trouble.size > 0
    ? { state: "trouble", text: `${trouble.size} session${trouble.size > 1 ? "s" : ""} need attention` }
    : needMe > 0
      ? { state: "waiting", text: `Waiting on you · ${needMe}` }
      : running.size > 0
        ? { state: "working", text: `${running.size} job${running.size > 1 ? "s" : ""} working` }
        : { state: "ready", text: "All quiet" };
  const beltTarget = () => setTab(trouble.size > 0 ? "activity" : "board");

  const NAV: { key: Tab; label: string; badge?: number; tone?: string }[] = [
    { key: "board", label: "Board", badge: needMe, tone: "bg-brand-pink" },
    { key: "new", label: "New job" },
    { key: "agents", label: "Agents" },
    { key: "activity", label: "Activity", badge: trouble.size, tone: "bg-destructive-indicator" },
    { key: "runs", label: "Runs" },
    { key: "metrics", label: "Metrics" },
  ];
  const TITLE: Record<Tab, string> = { board: "Board", new: "New job", agents: "Agents", activity: "Activity", runs: "Runs", metrics: "Metrics" };
  const palette: PaletteItem[] = [
    ...NAV.map((n) => ({ id: `view-${n.key}`, label: n.label, run: () => setTab(n.key) })),
    ...jobs.map((j) => ({ id: j.id, label: `${j.id} · ${j.stage}`, hint: "Jobs", run: () => { setTab("board"); setOpen(j.id); } })),
  ];

  return (
    <div className="h-screen">
      <AppFrame
        sidebar={
          <aside className="flex w-60 shrink-0 flex-col gap-4 px-3 py-3">
            <h1 className="px-3 pt-1 font-display text-subheading">Forgeline</h1>
            <select
              className="h-control-md w-full rounded-full bg-field px-3 text-label text-foreground shadow-input outline-hidden focus-visible:[--surface-rim:var(--field-rim-focus)]"
              value={repo ?? ""}
              onChange={(e) => setPicked(e.target.value)}
              aria-label="Repository"
            >
              {repos.map((r) => (
                <option key={r.path} value={r.path} disabled={!r.ready}>{r.name}{r.ready ? "" : " (no factory)"}</option>
              ))}
            </select>
            <nav className="flex flex-col gap-0.5" aria-label="Views">
              {NAV.map((n) => (
                <button key={n.key} onClick={() => setTab(n.key)} aria-current={tab === n.key ? "page" : undefined} className={navItemClasses({ isActive: tab === n.key })}>
                  {n.label}
                  {!!n.badge && <span className={cn("ml-auto rounded-full px-1.5 text-meta text-white", n.tone)}>{n.badge}</span>}
                </button>
              ))}
            </nav>
            <p className="mt-auto px-3 text-caption text-muted-foreground">⌘K to jump · {jobError ? <span className="text-destructive-foreground">{jobError}</span> : "live · 2s"}</p>
          </aside>
        }
      >
        <PanelGroup
          className="min-h-0 min-w-0 flex-1"
          style={UNCLIPPED}
          orientation="horizontal"
          defaultLayout={defaultLayout ?? COLLAPSED_LAYOUT}
          onLayoutChange={onLayoutChange}
        >
          <Panel id="studio-frame" className="min-w-0" style={UNCLIPPED}>
            <MainCard className="h-full">
              <PageLayout
                title={TITLE[tab]}
                breadcrumbs={repos.find((r) => r.path === repo) ? [repos.find((r) => r.path === repo)!.name] : []}
                variant="fit"
                toolbar={jobs.length > 0 ? <JobSwitcher jobs={jobs} scope={open} running={running} trouble={trouble} onScope={setOpen} /> : undefined}
                actions={
                  <>
                    <ActivityBelt belt={belt} onClick={beltTarget} />
                    {tab !== "new" && (
                      <Button variant="primary" size="sm" onClick={() => setTab("new")}>New job</Button>
                    )}
                  </>
                }
              >
                <div key={tab} className={cn("h-full motion-safe:animate-in motion-safe:fade-in motion-safe:duration-fast", tab === "new" ? "overflow-hidden" : "overflow-auto")}>
                  {!repo ? (
                    <p className="text-body text-muted-foreground">No repository with the factory installed. Set FORGELINE_REPOS to a path list.</p>
                  ) : tab === "board" ? (
                    <Board jobs={jobs} stages={jobData?.stages ?? []} running={running} trouble={trouble} selected={open} onOpen={setOpen} />
                  ) : tab === "new" ? (
                    <RunPanel context={selected ? <JobContext job={selected} busy={busy} onCommand={submit} onClear={() => setOpen(null)} /> : undefined} messages={messages} status={status} error={error} servers={servers} options={options} onOptions={setOptions} onSubmit={submit} onStop={stop} />
                  ) : tab === "agents" ? (
                    <AgentsView rows={agentRowsList} error={agentError} selected={agentName} onSelect={setAgentName} job={open} />
                  ) : tab === "activity" ? (
                    <ActivityView data={scopedActivity} error={activityError} />
                  ) : tab === "runs" ? (
                    <RunsView job={open} />
                  ) : (
                    <MetricsView repo={repo} job={open} />
                  )}
                </div>
              </PageLayout>
            </MainCard>
          </Panel>
          {showPanel && (
            <>
              <PanelSeparator />
              <Panel id="route-side-panel" className="min-w-0 pl-2" defaultSize={420} minSize={320} maxSize="50%" style={UNCLIPPED}>
                <MainCard className="h-full motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-2 motion-safe:duration-normal motion-safe:ease-out-custom">
                  {tab === "agents" ? (
                    <AgentPanel row={selectedAgent!} activity={activity} onClose={() => setAgentName(null)} />
                  ) : (
                    <JobPanel job={selected!} stages={jobData?.stages ?? []} running={!!open && running.has(open)} busy={busy} onClose={() => setOpen(null)} onFiles={() => { setFilesView("docs"); setFilesOpen(true); }} onCode={() => { setFilesView("code"); setFilesOpen(true); }} onCommand={submit} />
                  )}
                </MainCard>
              </Panel>
            </>
          )}
        </PanelGroup>
      </AppFrame>
      <CommandPalette items={palette} />
      {repo && <JobDrawer job={filesOpen ? selected : undefined} stages={jobData?.stages ?? []} running={!!open && running.has(open)} repo={repo} busy={busy} view={filesView} onClose={() => setFilesOpen(false)} onCommand={submit} />}
    </div>
  );
}
