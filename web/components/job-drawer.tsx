"use client";
import { useEffect, useState } from "react";
import { MessageResponse } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { JobActivity } from "@/components/activity-view";
import { QuestionBadge, QuestionBox } from "@/components/question-box";
import { usePoll } from "@/components/use-poll";
import { cn } from "@/lib/utils";
import type { Job } from "@/lib/jobs";
import type { Question } from "@/lib/questions";

const ACTIVITY = "activity";
const FIRST = ["intent.md", "spec.md", "plan.md", "build.md", "decision.md"];
const rank = (f: string) => (FIRST.includes(f) ? FIRST.indexOf(f) : f.startsWith("round-") ? 10 : 20);

type Props = {
  job: Job | undefined; repo: string; busy: boolean; working: boolean; note?: string; question?: Question;
  onClose: () => void; onCommand: (text: string) => void; onAnswer: (jobId: string, text: string) => void;
};

/** Buttons that map to the exact /factory commands for the job's stage. */
/** Stages where an agent should be working; if none is, the job needs a nudge. */
const AGENT_STAGES = new Set(["spec", "plan", "build", "review", "approve"]);
export const isStuck = (job: Job, working: boolean) => AGENT_STAGES.has(job.stage) && !job.paused && !working;

export function Actions({ job, busy, stuck, onCommand }: Pick<Props, "busy" | "onCommand"> & { job: Job; stuck?: boolean }) {
  const [note, setNote] = useState("");
  const run = (verb: string, withNote = false) => {
    if (verb === "approve" && !window.confirm(`Merge ${job.id} into main?`)) return;
    onCommand(`/factory ${verb} ${job.id}${withNote ? ` ${note.trim()}` : ""}`);
    setNote("");
  };
  const noteOk = note.trim().length > 0;
  if (job.stage === "intent")
    return <Button disabled={busy} onClick={() => run("accept")}>Accept intent</Button>;
  if (job.stage === "spec-approval")
    return (
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => run("approve-spec")}>Approve spec</Button>
        <Input className="min-w-48 flex-1" placeholder="Note for the spec-writer" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button variant="secondary" disabled={busy || !noteOk} onClick={() => run("respec", true)}>Send back</Button>
      </div>
    );
  if (job.stage === "needs-human")
    return (
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => run("approve")}>Approve merge</Button>
        <Input className="min-w-48 flex-1" placeholder="Note for the builder" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button variant="secondary" disabled={busy || !noteOk} onClick={() => run("rework", true)}>Send back</Button>
        <Button variant="outline" disabled={busy} title="Sends the job back to the builder to merge main into its branch, fix conflicts and run the reviews again" onClick={() => onCommand(`/factory rework ${job.id} rebase onto current main, resolve any conflicts, and run the review again`)}>Rebase onto main</Button>
      </div>
    );
  if (job.paused || stuck)
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy} onClick={() => run("resume")}>Resume</Button>
        {stuck && !job.paused && <span className="text-xs text-muted-foreground">No agent is running on this job. Resume continues it from where it stopped.</span>}
      </div>
    );
  return null;
}

/** One click sends one command: buttons stay locked until the job moves on or the agent stops. */
export function useJobCommand(job: Job | undefined, busy: boolean, working: boolean, onCommand: (text: string) => void, onSent?: () => void) {
  const [sent, setSent] = useState<string | null>(null); // the stage a command was sent from
  useEffect(() => { if (sent && job?.stage !== sent) setSent(null); }, [job?.stage, sent]);
  useEffect(() => { if (sent && !working) { const t = setTimeout(() => setSent(null), 4000); return () => clearTimeout(t); } }, [sent, working]);
  const locked = busy || working || sent !== null;
  // `via` sends the text some other way (an answer to the job's question) under the same lock.
  const send = (text: string, via?: (text: string) => void) => {
    if (locked || !job) return;
    setSent(job.stage);
    onSent?.();
    (via ?? onCommand)(text);
  };
  // `mine`: this job itself is being worked on; `locked` also covers any other run from this tab.
  return { locked, mine: working || sent !== null, send, reset: () => setSent(null) };
}

/** The orchestrator's closing message from the latest finished run on this job: why a merge was refused, a question, a summary. */
export function LastMessage({ text }: { text?: string }) {
  const [more, setMore] = useState(false);
  if (!text) return null;
  const long = text.length > 280 || text.split("\n").length > 4;
  return (
    <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
      <div className="mb-1 text-xs text-muted-foreground">Latest from the orchestrator</div>
      <p className={cn("whitespace-pre-wrap", !more && "line-clamp-4")}>{text}</p>
      {long && <button className="mt-1 text-xs text-muted-foreground underline" onClick={() => setMore((m) => !m)}>{more ? "Show less" : "Show more"}</button>}
    </div>
  );
}

export function WorkingBanner() {
  return (
    <p role="status" className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-sm">
      <Spinner /> An agent is working on this job. This view updates by itself; the next step appears here when it finishes.
    </p>
  );
}

export function JobDrawer({ job, repo, busy, working, note, question, onClose, onCommand, onAnswer }: Props) {
  const id = job?.id;
  const q = encodeURIComponent(repo);
  const { data: list } = usePoll<{ files: string[] }>(id ? `/api/jobs/${id}?repo=${q}` : null, 3000, "jobs");
  const files = [...(list?.files ?? [])].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const [picked, setPicked] = useState<string | null>(null);
  const file = picked && picked !== ACTIVITY && files.includes(picked) ? picked : (files.at(-1) ?? null);
  const showActivity = picked === ACTIVITY;
  const { data: doc } = usePoll<{ text: string }>(id && file && !showActivity ? `/api/jobs/${id}?repo=${q}&file=${encodeURIComponent(file)}` : null, 3000, "jobs");

  const { locked, mine, send, reset } = useJobCommand(job, busy, working, onCommand, () => setPicked(ACTIVITY)); // show what the agent is doing right away
  useEffect(() => { setPicked(null); reset(); }, [id]);

  return (
    <Dialog open={!!job} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[85vh] max-w-5xl flex-col gap-3 sm:max-w-5xl">
        {job && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-mono text-base">{job.id}{question && !working && <QuestionBadge />}</DialogTitle>
              <DialogDescription>{job.feature}</DialogDescription>
              <p className="font-mono text-xs text-muted-foreground">{job.branch} · {job.stage} · round {job.round}</p>
            </DialogHeader>
            {/* A pending question shows its own text below, so the closing message is not repeated. */}
            {mine ? <WorkingBanner /> : job.stage !== "merged" && !question && <LastMessage text={note} />}
            <Actions job={job} busy={locked} stuck={isStuck(job, working)} onCommand={send} />
            {question && !working && !mine && <QuestionBox question={question} locked={locked} onSend={(t) => send(t, (x) => onAnswer(job.id, x))} />}
            <div className="flex min-h-0 flex-1 gap-3">
              <nav className="w-52 shrink-0 space-y-1 overflow-y-auto text-sm">
                <button onClick={() => setPicked(ACTIVITY)} className={cn("block w-full truncate rounded px-2 py-1 text-left hover:bg-accent", showActivity && "bg-accent")}>
                  activity (live)
                </button>
                {list && files.length === 0 && <p className="text-muted-foreground">No files yet.</p>}
                {files.map((f) => (
                  <button key={f} onClick={() => setPicked(f)} className={cn("block w-full truncate rounded px-2 py-1 text-left hover:bg-accent", !showActivity && f === file && "bg-accent")}>
                    {f}
                  </button>
                ))}
              </nav>
              <article className="min-w-0 flex-1 overflow-y-auto rounded-md border p-4 text-sm">
                {showActivity ? <JobActivity repo={repo} job={job.id} /> : doc ? <MessageResponse>{doc.text}</MessageResponse> : <p className="text-muted-foreground">Select a file.</p>}
              </article>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
