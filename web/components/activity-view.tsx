"use client";
import { Badge } from "@/components/ui/badge";
import { usePoll } from "@/components/use-poll";
import { cn } from "@/lib/utils";
import type { ActivityEvent, SessionState } from "@/lib/activity";

export type ActivityData = { sessions: SessionState[]; events: ActivityEvent[] };

const STATE_STYLE: Record<SessionState["state"], string> = {
  running: "bg-ok/20 text-ok",
  idle: "bg-secondary text-secondary-foreground",
  ended: "bg-secondary text-muted-foreground",
  stalled: "bg-destructive/20 text-destructive",
  crashed: "bg-destructive/20 text-destructive",
};

const age = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${(s / 3600).toFixed(1)}h`);

const label = (e: ActivityEvent) =>
  ({
    session_start: "session started", session_end: "session ended", prompt: "prompt", stop: "finished turn",
    subagent_start: "agent started", subagent_stop: "agent finished",
    tool_done: `done ${e.tool}${e.ms != null ? ` · ${e.ms}ms` : ""}`, tool: e.tool,
  })[e.ev] ?? e.ev;

/** Sessions that are stalled get the exact command to continue them. */
export function Sessions({ sessions }: { sessions: SessionState[] }) {
  if (sessions.length === 0) return <p className="text-sm text-muted-foreground">No activity recorded yet. Hooks write it from any Claude Code surface.</p>;
  return (
    <ul className="space-y-1.5 text-sm">
      {sessions.slice(0, 12).map((s) => (
        <li key={s.session} className="flex flex-wrap items-center gap-2">
          <Badge className={cn("rounded-full", STATE_STYLE[s.state])}>{s.state}</Badge>
          <span className="font-mono text-xs">{s.job ?? "no job"}</span>
          <span className="text-xs text-muted-foreground">{s.agent} · {age(s.age_seconds)} ago</span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{s.last}</span>
          {(s.state === "stalled" || s.state === "crashed") && s.job && <code className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">/factory resume {s.job}</code>}
        </li>
      ))}
    </ul>
  );
}

export function Feed({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-muted-foreground">Nothing yet.</p>;
  return (
    <ol className="space-y-0.5 font-mono text-xs">
      {[...events].reverse().map((e, i) => (
        <li key={`${e.ts}-${i}`} className="flex gap-2">
          <span className="shrink-0 text-muted-foreground">{e.ts.slice(11, 19)}</span>
          <span className="w-28 shrink-0 truncate text-muted-foreground" title={e.agent}>{e.agent}</span>
          <span className={cn("w-28 shrink-0 truncate", e.ev === "tool_done" ? "text-muted-foreground" : "text-foreground")}>{label(e)}</span>
          <span className="min-w-0 flex-1 truncate" title={e.text}>{e.text}</span>
        </li>
      ))}
    </ol>
  );
}

/** Job-scoped feed, used in the job dialog. */
export function JobActivity({ repo, job }: { repo: string; job: string }) {
  const { data, error } = usePoll<ActivityData>(`/api/activity?repo=${encodeURIComponent(repo)}&job=${encodeURIComponent(job)}`, 2000);
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  return data ? <div className="space-y-4"><Sessions sessions={data.sessions.filter((s) => s.job === job)} /><Feed events={data.events} /></div> : null;
}

export function ActivityView({ data, error }: { data: ActivityData | null; error: string | null }) {
  if (error) return <p className="p-2 text-sm text-destructive">{error}</p>;
  if (!data) return <p className="p-2 text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">Shared by every surface: hooks in the CLI, desktop app, VS Code and this app write to the same log.</p>
      <section><h3 className="mb-2 text-sm font-medium">Sessions</h3><Sessions sessions={data.sessions} /></section>
      <section><h3 className="mb-2 text-sm font-medium">Live feed</h3><Feed events={data.events} /></section>
    </div>
  );
}
