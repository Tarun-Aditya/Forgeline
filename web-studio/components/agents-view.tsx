"use client";
import { LayoutGridIcon, Rows3Icon, SearchIcon, XIcon } from "lucide-react";
import { AgentMap } from "@/components/agent-map";
import { useMemo, useState } from "react";
import { StatusBadge, type Status } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Feed, type ActivityData } from "@/components/activity-view";
import type { AgentInfo } from "@/lib/agents";
import { cn } from "@/lib/utils";

export type AgentRow = AgentInfo & { events: number; lastTs: string | null; state: Status };

const WORKING_MS = 60_000;

/** One row per subagent: its definition plus what the shared activity log says it is doing. */
export function agentRows(agents: AgentInfo[], activity: ActivityData | null, now = Date.now(), job: string | null = null): AgentRow[] {
  const events = (activity?.events ?? []).filter((e) => !job || e.job === job);
  return agents.map((a) => {
    const mine = events.filter((e) => e.agent === a.name);
    const last = mine.at(-1);
    const live = !!last && last.ev !== "subagent_stop" && last.ev !== "stop" && now - Date.parse(last.ts) < WORKING_MS;
    return { ...a, events: mine.length, lastTs: last?.ts ?? null, state: live ? "running" : "idle" };
  });
}

const ago = (ts: string | null, now = Date.now()) => {
  if (!ts) return "never";
  const s = Math.max(0, Math.round((now - Date.parse(ts)) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${(s / 3600).toFixed(1)}h ago`;
};

const COLS = "grid-cols-[minmax(10rem,1.2fr)_minmax(0,3fr)_6rem_5rem_7rem_6rem]";

export function AgentsView({ rows, error, selected, onSelect, job, kind = "factory" }: { rows: AgentRow[] | null; error: string | null; selected: string | null; onSelect: (name: string) => void; job?: string | null; kind?: "factory" | "graphos" }) {
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"map" | "table">("map");
  const shown = useMemo(() => (rows ?? []).filter((r) => (kind === "graphos") === r.name.startsWith("graphos-")).filter((r) => `${r.name} ${r.description}`.toLowerCase().includes(q.toLowerCase())), [rows, q, kind]);
  if (error) return <p className="text-body-sm text-destructive-foreground">{error}</p>;
  if (!rows) return <p className="text-body-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-3">
      {job && <p className="text-caption text-muted-foreground">Showing activity for <span className="font-mono text-foreground">{job}</span> only. Agents that never touched it are dimmed.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-icon-md -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search agents" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search agents" />
        </div>
        <div className="ml-auto flex gap-1" role="group" aria-label="View">
          <Button size="icon-md" variant={mode === "map" ? "default" : "ghost"} tooltip="Pipeline view" aria-pressed={mode === "map"} onClick={() => setMode("map")}><LayoutGridIcon /></Button>
          <Button size="icon-md" variant={mode === "table" ? "default" : "ghost"} tooltip="Table view" aria-pressed={mode === "table"} onClick={() => setMode("table")}><Rows3Icon /></Button>
        </div>
      </div>
      {mode === "map" ? (
        <AgentMap rows={shown} selected={selected} onSelect={onSelect} job={job} kind={kind} />
      ) : (
      <div role="table" className="overflow-hidden rounded-xl bg-card shadow-raised">
        <div role="row" className={cn("grid h-table-header items-center gap-3 border-b border-border px-4 text-column text-muted-foreground", COLS)}>
          <span>Agent</span><span>Role</span><span>Model</span><span>Tools</span><span>Last active</span><span>Status</span>
        </div>
        {shown.length === 0 && <p className="px-4 py-6 text-center text-body-sm text-muted-foreground">No agents match.</p>}
        {shown.map((r) => (
          <button
            key={r.name}
            role="row"
            onClick={() => onSelect(r.name)}
            aria-selected={selected === r.name}
            className={cn("state-layer grid min-h-table-row w-full cursor-pointer items-center gap-3 border-b border-border px-4 text-left text-body-sm outline-hidden last:border-b-0 focus-visible:[--surface-rim:var(--border-focus)]", COLS, selected === r.name && "bg-fill")}
          >
            <span className="truncate font-mono text-caption text-foreground">{r.name}</span>
            <span className="truncate text-muted-foreground">{r.description}</span>
            <span>{r.model ? <Badge size="sm" variant="neutral">{r.model}</Badge> : <span className="text-placeholder">default</span>}</span>
            <span className="tabular-nums text-muted-foreground">{r.tools.length}</span>
            <span className="text-muted-foreground">{ago(r.lastTs)}</span>
            <span><StatusBadge status={r.state}>{r.state === "running" ? "working" : "idle"}</StatusBadge></span>
          </button>
        ))}
      </div>
      )}
    </div>
  );
}

/** Right-hand context for the selected agent, like Studio's agent overview panel. */
export function AgentPanel({ row, activity, onClose }: { row: AgentRow; activity: ActivityData | null; onClose: () => void }) {
  const mine = (activity?.events ?? []).filter((e) => e.agent === row.name).slice(-40);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-header-default shrink-0 items-center gap-2 border-b border-surface-rim px-4">
        <h2 className="min-w-0 flex-1 truncate font-mono text-label text-foreground">{row.name}</h2>
        <Button variant="ghost" size="icon-sm" tooltip="Close" onClick={onClose}><XIcon /></Button>
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <p className="text-body text-foreground">{row.description}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={row.state}>{row.state === "running" ? "working" : "idle"}</StatusBadge>
          {row.model && <Badge size="sm" variant="neutral">{row.model}</Badge>}
          <span className="text-caption text-muted-foreground">{row.events} events · {ago(row.lastTs)}</span>
        </div>
        <section>
          <h3 className="mb-2 text-eyebrow text-muted-foreground uppercase">Tools</h3>
          <div className="flex flex-wrap gap-1.5">
            {row.tools.length === 0 ? <span className="text-body-sm text-muted-foreground">Inherits all tools.</span> : row.tools.map((t) => <Badge key={t} size="sm" variant="neutral">{t}</Badge>)}
          </div>
        </section>
        <section>
          <h3 className="mb-2 text-eyebrow text-muted-foreground uppercase">Prompt</h3>
          <p className="mb-1 font-mono text-caption text-muted-foreground">{row.file}</p>
          <pre className="max-h-64 overflow-auto rounded-lg bg-background p-3 text-caption whitespace-pre-wrap text-foreground shadow-inset">{row.prompt}</pre>
        </section>
        <section>
          <h3 className="mb-2 text-eyebrow text-muted-foreground uppercase">Recent activity</h3>
          {mine.length === 0 ? <p className="text-body-sm text-muted-foreground">Nothing recorded in the current feed.</p> : <div className="overflow-x-auto"><Feed events={mine} /></div>}
        </section>
      </div>
    </div>
  );
}
