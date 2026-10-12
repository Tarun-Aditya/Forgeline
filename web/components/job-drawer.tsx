"use client";
import { useEffect, useState } from "react";
import { MessageResponse } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { JobActivity } from "@/components/activity-view";
import { usePoll } from "@/components/use-poll";
import { cn } from "@/lib/utils";
import type { Job } from "@/lib/jobs";

const ACTIVITY = "activity";
const FIRST = ["intent.md", "spec.md", "plan.md", "build.md", "decision.md"];
const rank = (f: string) => (FIRST.includes(f) ? FIRST.indexOf(f) : f.startsWith("round-") ? 10 : 20);

type Props = { job: Job | undefined; repo: string; busy: boolean; onClose: () => void; onCommand: (text: string) => void };

/** Buttons that map to the exact /factory commands for the job's stage. */
function Actions({ job, busy, onCommand }: Pick<Props, "busy" | "onCommand"> & { job: Job }) {
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
      </div>
    );
  if (job.paused) return <Button disabled={busy} onClick={() => run("resume")}>Resume</Button>;
  return null;
}

export function JobDrawer({ job, repo, busy, onClose, onCommand }: Props) {
  const id = job?.id;
  const q = encodeURIComponent(repo);
  const { data: list } = usePoll<{ files: string[] }>(id ? `/api/jobs/${id}?repo=${q}` : null, 3000);
  const files = [...(list?.files ?? [])].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const [picked, setPicked] = useState<string | null>(null);
  const file = picked && picked !== ACTIVITY && files.includes(picked) ? picked : (files.at(-1) ?? null);
  const showActivity = picked === ACTIVITY;
  const { data: doc } = usePoll<{ text: string }>(id && file && !showActivity ? `/api/jobs/${id}?repo=${q}&file=${encodeURIComponent(file)}` : null, 3000);

  useEffect(() => setPicked(null), [id]);

  return (
    <Dialog open={!!job} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[85vh] max-w-5xl flex-col gap-3 sm:max-w-5xl">
        {job && (
          <>
            <DialogHeader>
              <DialogTitle className="font-mono text-base">{job.id}</DialogTitle>
              <DialogDescription>{job.feature}</DialogDescription>
              <p className="font-mono text-xs text-muted-foreground">{job.branch} · {job.stage} · round {job.round}</p>
            </DialogHeader>
            <Actions job={job} busy={busy} onCommand={onCommand} />
            <div className="flex min-h-0 flex-1 gap-3">
              <nav className="w-52 shrink-0 space-y-1 overflow-y-auto text-sm">
                <button onClick={() => setPicked(ACTIVITY)} className={cn("block w-full truncate rounded px-2 py-1 text-left hover:bg-accent", showActivity && "bg-accent")}>
                  activity (live)
                </button>
                {files.length === 0 && <p className="text-muted-foreground">No files yet.</p>}
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
