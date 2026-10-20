"use client";
import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Job } from "@/lib/jobs";

type Stage = { key: string; label: string; who: string };

const LIVE = new Set(["intent", "spec", "plan", "build", "review", "approve"]);
const HUMAN = new Set(["spec-approval", "needs-human"]);
const REVIEWERS = [["security", "sec"], ["ux", "ux"], ["ui", "ui"], ["code", "code"]] as const;

function chipClass(v: string | undefined) {
  if (v === "PASS") return "bg-badge-green-subtle text-badge-green-foreground";
  if (v === "CHANGES") return "bg-badge-amber-subtle text-warning-foreground";
  return "bg-fill-subtle text-muted-foreground";
}

function JobCard({ job, running, trouble, selected, onOpen }: { job: Job; running: boolean; trouble?: "stalled" | "crashed"; selected: boolean; onOpen: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  // Keep the selected job in view when the board is wider than the space beside the side panel.
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selected, job.stage]);
  const [num, ...slug] = job.id.split("-");
  const live = LIVE.has(job.stage) && !job.paused;
  const human = HUMAN.has(job.stage);
  return (
    <button
      ref={ref}
      onClick={onOpen}
      className={cn(
        "state-layer w-full cursor-pointer rounded-xl bg-card p-3 text-left text-body-sm shadow-raised outline-hidden focus-visible:[--surface-rim:var(--border-focus)]",
        selected && "[--surface-rim:var(--border-strong)]",
        human && "[--surface-rim:var(--brand-pink)]",
        job.stage === "merged" && "opacity-70",
      )}
    >
      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {(running || live) && (
          <span className={cn("size-2 rounded-full bg-success-indicator", running && "animate-pulse")} aria-label={running ? "agent running" : "in progress"} />
        )}
        <span className="whitespace-nowrap font-mono">{num} · {slug.join("-")}</span>
        {trouble && <Badge variant="destructive" size="sm" className="ml-auto">{trouble}</Badge>}
        {human && <Badge variant="pink" size="sm" indicator="pulse" className={cn(!trouble && "ml-auto")}>your call</Badge>}
      </div>
      <p className="line-clamp-3 text-body-sm text-foreground">{job.feature}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]">
        <Badge variant="neutral" size="sm">{job.type}</Badge>
        {job.ticket && <Badge variant="neutral" size="sm">{job.ticket}</Badge>}
        {job.paused && <Badge variant="warning" size="sm">paused</Badge>}
        {job.intent_waived && <Badge variant="warning" size="sm">intent waived</Badge>}
      </div>
      {job.round > 0 && (
        <div className="mt-2 flex items-center gap-1 text-[11px]">
          <span className="text-muted-foreground">R{job.round}</span>
          {REVIEWERS.map(([k, short]) => (
            <span key={k} title={`${k}: ${job.reviews?.[k] ?? "pending"}`} className={cn("rounded-md px-1.5 py-0.5 shadow-inset", chipClass(job.reviews?.[k]))}>
              {short}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

export function Board({ jobs, stages, running, trouble, selected, onOpen }: { jobs: Job[]; stages: Stage[]; running: Set<string>; trouble: Map<string, "stalled" | "crashed">; selected?: string | null; onOpen: (id: string) => void }) {
  const shown = stages.filter((s) => s.key !== "split" || jobs.some((j) => j.stage === "split"));
  const known = new Set(stages.map((s) => s.key));
  const unknown = jobs.filter((j) => !known.has(j.stage));
  return (
    <div>
      {unknown.map((j) => (
        <div key={j.id} className="mb-2 rounded-lg bg-destructive-subtle p-2 text-body-sm text-destructive-subtle-foreground">Job {j.id} has unknown stage “{j.stage}”.</div>
      ))}
      {jobs.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No jobs yet. Describe a task in the panel on the right to start one.</p>}
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(168px, 1fr))` }}>
        {shown.map((s) => {
          const here = jobs.filter((j) => j.stage === s.key).reverse();
          return (
            <section key={s.key} className="min-w-0 space-y-2">
              <header className="flex items-baseline gap-2 px-1">
                <h2 className="text-card-title">{s.label}</h2>
                <span className="truncate text-caption text-placeholder">{s.who}</span>
                <span className="ml-auto text-xs text-muted-foreground">{here.length || ""}</span>
              </header>
              {here.map((j) => (
                <JobCard key={j.id} job={j} running={running.has(j.id)} trouble={trouble.get(j.id)} selected={selected === j.id} onOpen={() => onOpen(j.id)} />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
