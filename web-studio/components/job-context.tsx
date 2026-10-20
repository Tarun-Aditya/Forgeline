"use client";
import { XIcon } from "lucide-react";
import { Actions } from "@/components/job-drawer";
import { StatusDot } from "@/components/status";
import { Button } from "@/components/ui/button";
import type { Job } from "@/lib/jobs";

/** On the New job page, shows which job the app is scoped to and the commands its stage allows. */
export function JobContext({ job, busy, onCommand, onClear }: { job: Job; busy: boolean; onCommand: (text: string) => void; onClear: () => void }) {
  const human = job.stage === "spec-approval" || job.stage === "needs-human";
  return (
    <div className="mx-auto mb-2 w-full max-w-3xl space-y-2 rounded-xl bg-card p-3 shadow-raised">
      <div className="flex items-center gap-2 text-label">
        <StatusDot status={human ? "waiting" : "idle"} />
        <span className="font-mono text-caption text-foreground">{job.id}</span>
        <span className="text-caption text-muted-foreground">{job.stage}</span>
        <Button className="ml-auto" size="icon-sm" variant="ghost" tooltip="Back to all jobs" onClick={onClear}><XIcon /></Button>
      </div>
      <Actions job={job} busy={busy} onCommand={onCommand} />
    </div>
  );
}
