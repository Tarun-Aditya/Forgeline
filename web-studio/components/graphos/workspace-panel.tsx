"use client";
import { XIcon } from "lucide-react";
import { EvidenceChips } from "@/components/graphos/graphos-board";
import { Pipeline } from "@/components/pipeline";
import { StatusBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { GraphosState } from "@/lib/graphos";
import type { Job } from "@/lib/jobs";

type Stage = { key: string; label: string; who: string };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <dt className="text-body-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-body-sm break-words text-foreground">{children}</dd>
    </div>
  );
}

/** Context for the selected connector, docked on the right like the job panel. */
export function WorkspacePanel({ w, stages, running, busy, onClose, onOpen, onCommand }: { w: GraphosState; stages: Stage[]; running: boolean; busy: boolean; onClose: () => void; onOpen: () => void; onCommand: (text: string) => void }) {
  const needs = w.gate && !w.exported;
  // The pipeline only reads the stage, so a connector can stand in for a job.
  const asJob = { stage: w.stage } as Job;
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="gx-panel">
      <header className="flex h-header-default shrink-0 items-center gap-2 border-b border-surface-rim px-4">
        <h2 className="min-w-0 flex-1 truncate font-mono text-label text-foreground">{w.name}</h2>
        <Button variant="ghost" size="icon-sm" tooltip="Close" onClick={onClose}><XIcon /></Button>
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <p className="text-body text-foreground">{w.reason}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {needs && <StatusBadge status="waiting">your call</StatusBadge>}
          {running && <StatusBadge status="running">agent running</StatusBadge>}
          {w.refresh && <Badge variant="warning" size="sm">API changed</Badge>}
          {w.exported && <Badge variant="success" size="sm">exported</Badge>}
          <Badge variant="neutral" size="sm">{w.intake === "spec" ? "from spec" : "from docs"}</Badge>
          {w.context_mode === "specialized" && <Badge variant="info" size="sm">customer-specific</Badge>}
        </div>
        <Pipeline job={asJob} stages={stages} running={running} />
        <div className="flex flex-wrap gap-2">
          {!w.gate && w.next && !running && (
            <Button variant="primary" disabled={busy} data-testid="gx-panel-next" onClick={() => onCommand(`/graphos continue ${w.name}`)}>Run next step</Button>
          )}
          <Button variant="default" data-testid="gx-open" onClick={onOpen}>Open connector</Button>
        </div>
        <dl className="divide-y divide-border">
          <Row label="Stage">{w.stage}</Row>
          <Row label="Operations">{w.selection ? `${w.selection.included} of ${w.ops_total} in scope` : `${w.ops_total} found`}</Row>
          <Row label="Decisions">{w.decisions.open} open · {w.decisions.resolved} settled</Row>
          {w.review && <Row label="Review"><Badge size="sm" variant={w.review === "PASS" ? "success" : "warning"} emphasis="subtle">{w.review}</Badge></Row>}
          {w.evidence && <Row label="Validation"><span className="inline-flex justify-end"><EvidenceChips evidence={w.evidence} /></span></Row>}
        </dl>
      </div>
    </div>
  );
}
