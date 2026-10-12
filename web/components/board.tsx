"use client";
import { useJobCommand, WorkingBanner } from "@/components/job-drawer";
import { QuestionBadge, QuestionBox } from "@/components/question-box";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { Job } from "@/lib/jobs";
import type { Question } from "@/lib/questions";

type Stage = { key: string; label: string; who: string };

const LIVE = new Set(["intent", "spec", "plan", "build", "review", "approve"]);
const HUMAN = new Set(["spec-approval", "needs-human"]);
const REVIEWERS = [["security", "sec"], ["ux", "ux"], ["ui", "ui"], ["code", "code"]] as const;

function chipClass(v: string | undefined) {
  if (v === "PASS") return "bg-ok/20 text-ok border-ok/40";
  if (v === "CHANGES") return "bg-warn/20 text-warn border-warn/40";
  return "border-dashed text-muted-foreground";
}

export function ReviewChips({ job }: { job: Job }) {
  if (job.round <= 0) return null;
  return (
    <div className="flex items-center gap-1 text-[11px]">
      <span className="text-muted-foreground">R{job.round}</span>
      {REVIEWERS.map(([k, short]) => (
        <span key={k} title={`${k}: ${job.reviews?.[k] ?? "pending"}`} className={cn("rounded border px-1.5 py-0.5", chipClass(job.reviews?.[k]))}>{short}</span>
      ))}
    </div>
  );
}

type CardProps = {
  job: Job; running: boolean; busy: boolean; trouble?: "stalled" | "crashed"; question?: Question;
  onOpen: () => void; onAnswer: (jobId: string, text: string) => void;
};

function JobCard({ job, running, busy, trouble, question, onOpen, onAnswer }: CardProps) {
  const [num, ...slug] = job.id.split("-");
  const live = LIVE.has(job.stage) && !job.paused;
  const human = HUMAN.has(job.stage);
  const asking = !!question && !running;
  // Every send here passes its own sender, so the default one is never called.
  const { locked, mine, send } = useJobCommand(job, busy, running, () => {});
  // The reply box sits beside the open button, not inside it: a form inside a <button> is invalid.
  return (
    <div className={cn("rounded-lg border bg-card text-sm", (human || asking) && "border-call/60", job.stage === "merged" && "opacity-70")}>
      <button onClick={onOpen} className="w-full rounded-lg p-3 text-left transition-colors hover:bg-accent">
        <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {(running || live) && (
            <span className={cn("size-2 rounded-full bg-ok", running && "animate-pulse")} aria-label={running ? "agent running" : "in progress"} />
          )}
          <span className="whitespace-nowrap font-mono">{num} · {slug.join("-")}</span>
          {trouble && <Badge className="ml-auto bg-destructive text-white">{trouble}</Badge>}
          {human && <Badge className={cn(!trouble && "ml-auto", "bg-call text-white")}>your call</Badge>}
          {asking && <QuestionBadge className={cn(!trouble && !human && "ml-auto")} />}
        </div>
        <p className="line-clamp-3 text-sm">{job.feature}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]">
          <Badge variant="secondary">{job.type}</Badge>
          {job.ticket && <Badge variant="secondary">{job.ticket}</Badge>}
          {job.paused && <Badge className="bg-warn/20 text-warn">paused</Badge>}
          {job.intent_waived && <Badge className="bg-warn/20 text-warn">intent waived</Badge>}
        </div>
        {job.round > 0 && <div className="mt-2"><ReviewChips job={job} /></div>}
      </button>
      {(mine || asking) && (
        <div className="space-y-2 border-t p-3">
          {mine ? <WorkingBanner /> : question && <QuestionBox question={question} locked={locked} onSend={(t) => send(t, (x) => onAnswer(job.id, x))} />}
        </div>
      )}
    </div>
  );
}

type BoardProps = {
  starting?: string | null; jobs: Job[]; stages: Stage[]; running: Set<string>; trouble: Map<string, "stalled" | "crashed">;
  questions: Record<string, Question>; busy: boolean; onOpen: (id: string) => void; onAnswer: (jobId: string, text: string) => void;
};

export function Board({ starting, jobs, stages, running, trouble, questions, busy, onOpen, onAnswer }: BoardProps) {
  const shown = stages.filter((s) => s.key !== "split" || jobs.some((j) => j.stage === "split"));
  const known = new Set(stages.map((s) => s.key));
  const unknown = jobs.filter((j) => !known.has(j.stage));
  return (
    <div>
      {unknown.map((j) => (
        <div key={j.id} className="mb-2 rounded border border-destructive p-2 text-sm text-destructive">Job {j.id} has unknown stage “{j.stage}”.</div>
      ))}
      {jobs.length === 0 && !starting && <p className="p-8 text-center text-sm text-muted-foreground">No jobs yet. Describe a task in the panel on the right to start one.</p>}
      {/* Empty stages stay narrow so every stage, including Merged, fits on screen. */}
      <div className="grid gap-3" style={{ gridTemplateColumns: shown.map((s) => (jobs.some((j) => j.stage === s.key) || (starting && s.key === shown[0]?.key) ? "minmax(210px, 2fr)" : "minmax(70px, 1fr)")).join(" ") }}>
        {shown.map((s) => {
          const here = jobs.filter((j) => j.stage === s.key).reverse();
          const empty = here.length === 0 && !(starting && s.key === shown[0]?.key);
          return (
            <section key={s.key} className="min-w-0 space-y-2">
              <header className="flex items-baseline gap-2 px-1">
                <h2 className={cn("text-sm font-medium", empty && "truncate text-xs text-muted-foreground")} title={s.label}>{s.label}</h2>
                {!empty && <span className="truncate text-[11px] text-muted-foreground">{s.who}</span>}
                <span className="ml-auto text-xs text-muted-foreground">{here.length || ""}</span>
              </header>
              {starting && s.key === shown[0]?.key && (
                <div role="status" className="space-y-1 rounded-lg border border-dashed border-claude/60 bg-claude/5 p-3 text-sm">
                  <div className="flex items-center gap-2 text-xs text-claude"><Spinner className="size-3.5" /> Starting a new job…</div>
                  <p className="line-clamp-3">{starting}</p>
                </div>
              )}
              {here.map((j) => (
                <JobCard key={j.id} job={j} running={running.has(j.id)} busy={busy} trouble={trouble.get(j.id)} question={questions[j.id]} onOpen={() => onOpen(j.id)} onAnswer={onAnswer} />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
