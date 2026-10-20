"use client";
import { cn } from "@/lib/utils";
import { StatusDot } from "@/components/status";
import type { Job } from "@/lib/jobs";

type Stage = { key: string; label: string; who: string };
const HUMAN = new Set(["spec-approval", "needs-human"]);

/** The job's stages as a horizontal pipeline: done, current, upcoming. */
export function Pipeline({ job, stages, running }: { job: Job; stages: Stage[]; running: boolean }) {
  const flow = stages.filter((s) => s.key !== "split");
  const at = flow.findIndex((s) => s.key === job.stage);
  return (
    <ol className="flex items-stretch gap-1 overflow-x-auto text-caption" aria-label="Pipeline">
      {flow.map((s, i) => {
        const done = at === -1 ? job.stage === "merged" : i < at || job.stage === "merged";
        const current = i === at && job.stage !== "merged";
        return (
          <li
            key={s.key}
            aria-current={current ? "step" : undefined}
            className={cn(
              "flex min-w-24 flex-1 flex-col gap-0.5 rounded-lg px-2.5 py-1.5 shadow-inset",
              done && "bg-badge-green-subtle",
              current && (HUMAN.has(s.key) ? "bg-badge-pink-subtle" : "bg-badge-blue-subtle"),
              !done && !current && "bg-fill-subtle text-muted-foreground",
            )}
          >
            <span className="flex items-center gap-1.5 font-medium">
              {current ? <StatusDot status={HUMAN.has(s.key) ? "waiting" : running ? "running" : "idle"} /> : done ? <span className="text-success-indicator">✓</span> : null}
              {s.label}
            </span>
            <span className="truncate text-meta text-muted-foreground">{s.who}</span>
          </li>
        );
      })}
    </ol>
  );
}
