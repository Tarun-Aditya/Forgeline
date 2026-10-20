"use client";
import { StatusDot, type Status } from "@/components/status";
import type { Job } from "@/lib/jobs";
import { cn } from "@/lib/utils";

const HUMAN = new Set(["spec-approval", "needs-human"]);

function statusOf(job: Job, running: Set<string>, trouble: Map<string, "stalled" | "crashed">): Status {
  const t = trouble.get(job.id);
  if (t) return t;
  if (HUMAN.has(job.stage)) return "waiting";
  if (running.has(job.id)) return "running";
  if (job.stage === "merged") return "ok";
  if (job.paused) return "paused";
  return "idle";
}

const rank = (j: Job, running: Set<string>) => (HUMAN.has(j.stage) ? 0 : running.has(j.id) ? 1 : j.stage === "merged" ? 3 : 2);

/** Switch the whole app between parallel jobs. Every page reads the same scope. */
export function JobSwitcher({ jobs, scope, running, trouble, onScope }: { jobs: Job[]; scope: string | null; running: Set<string>; trouble: Map<string, "stalled" | "crashed">; onScope: (id: string | null) => void }) {
  const sorted = [...jobs].sort((a, b) => rank(a, running) - rank(b, running) || b.id.localeCompare(a.id));
  const live = jobs.filter((j) => running.has(j.id)).length;
  const chip = "state-layer flex h-control-sm shrink-0 cursor-pointer items-center gap-2 rounded-full px-3 text-label whitespace-nowrap shadow-raised outline-hidden focus-visible:[--surface-rim:var(--border-focus)]";
  return (
    <div role="tablist" aria-label="Job scope" className="flex items-center gap-2 overflow-x-auto border-b border-surface-rim px-4 py-2">
      <button role="tab" aria-selected={scope === null} onClick={() => onScope(null)} className={cn(chip, scope === null ? "bg-fill text-foreground" : "bg-card text-muted-foreground")}>
        All jobs
        <span className="text-meta text-muted-foreground tabular-nums">{jobs.length}{live > 0 ? ` · ${live} live` : ""}</span>
      </button>
      {sorted.map((j) => {
        const [num, ...slug] = j.id.split("-");
        const on = scope === j.id;
        return (
          <button key={j.id} role="tab" aria-selected={on} title={j.feature} onClick={() => onScope(on ? null : j.id)} className={cn(chip, on ? "bg-fill text-foreground [--surface-rim:var(--border-strong)]" : "bg-card text-muted-foreground")}>
            <StatusDot status={statusOf(j, running, trouble)} />
            <span className="font-mono text-caption">{num}</span>
            <span className="max-w-32 truncate">{slug.join("-")}</span>
            <span className="text-meta text-placeholder">{j.stage}</span>
          </button>
        );
      })}
    </div>
  );
}
