"use client";
import { CodeXmlIcon, XIcon } from "lucide-react";
import { Actions } from "@/components/job-drawer";
import { Pipeline } from "@/components/pipeline";
import { StatusBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Job } from "@/lib/jobs";

type Stage = { key: string; label: string; who: string };
const REVIEWERS = ["security", "ux", "ui", "code"] as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <dt className="text-body-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-body-sm break-words text-foreground">{children}</dd>
    </div>
  );
}

/** Context for the selected job, docked on the right like Studio's agent overview panel. */
export function JobPanel({ job, stages, running, busy, onClose, onFiles, onCode, onCommand }: { job: Job; stages: Stage[]; running: boolean; busy: boolean; onClose: () => void; onFiles: () => void; onCode: () => void; onCommand: (text: string) => void }) {
  const human = job.stage === "spec-approval" || job.stage === "needs-human";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-header-default shrink-0 items-center gap-2 border-b border-surface-rim px-4">
        <h2 className="min-w-0 flex-1 truncate font-mono text-label text-foreground">{job.id}</h2>
        <Button variant="ghost" size="icon-sm" tooltip="Close" onClick={onClose}><XIcon /></Button>
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <p className="text-body text-foreground">{job.feature}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {human && <StatusBadge status="waiting">your call</StatusBadge>}
          {running && <StatusBadge status="running">agent running</StatusBadge>}
          {job.paused && <StatusBadge status="paused">paused</StatusBadge>}
          <Badge variant="neutral" size="sm">{job.type}</Badge>
          {job.ticket && <Badge variant="neutral" size="sm">{job.ticket}</Badge>}
        </div>
        <Pipeline job={job} stages={stages} running={running} />
        <Actions job={job} busy={busy} onCommand={onCommand} />
        <dl className="divide-y divide-border">
          <Row label="Stage">{job.stage}</Row>
          <Row label="Branch"><span className="font-mono text-caption">{job.branch}</span></Row>
          <Row label="Review round">{job.round}</Row>
          {job.round > 0 && (
            <Row label="Reviews">
              <span className="inline-flex flex-wrap justify-end gap-1">
                {REVIEWERS.map((k) => {
                  const v = job.reviews?.[k];
                  return <Badge key={k} size="sm" variant={v === "PASS" ? "success" : v === "CHANGES" ? "warning" : "neutral"} emphasis="subtle">{k}</Badge>;
                })}
              </span>
            </Row>
          )}
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button variant="default" onClick={onFiles}>View files and activity</Button>
          <Button variant="default" onClick={onCode}><CodeXmlIcon className="size-4" />Code changes</Button>
        </div>
      </div>
    </div>
  );
}
