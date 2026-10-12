"use client";
import { useState } from "react";
import { RunViewer } from "@/components/run-viewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePoll } from "@/components/use-poll";
import { cn } from "@/lib/utils";

export type Run = {
  runId: string; repo: string; prompt: string; startedAt: string; status: "running" | "ok" | "failed" | "lost";
  jobIds: string[]; costUsd?: number; durationMs?: number; sessionId?: string;
};

export const RUN_STYLE: Record<Run["status"], string> = {
  running: "bg-ok/20 text-ok", ok: "bg-secondary text-secondary-foreground",
  failed: "bg-destructive/20 text-destructive", lost: "bg-destructive/20 text-destructive",
};

export function RunsView() {
  const { data } = usePoll<{ runs: Run[] }>("/api/runs", 3000);
  const [open, setOpen] = useState<Run | null>(null);
  const runs = data?.runs ?? [];
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Runs survive a web server restart. A run whose process disappeared without a result shows as lost; continue its job with /factory resume.</p>
      {runs.length === 0 && <p className="text-sm text-muted-foreground">No runs started from this app yet.</p>}
      {runs.map((r) => (
        <button key={r.runId} onClick={() => setOpen(r)} className="flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left text-sm hover:bg-accent">
          <Badge className={cn("rounded-full", RUN_STYLE[r.status])}>{r.status}</Badge>
          <span className="min-w-0 flex-1 truncate">{r.prompt}</span>
          <span className="font-mono text-xs text-muted-foreground">{r.jobIds.join(", ")}</span>
          <span className="text-xs text-muted-foreground">{r.costUsd != null ? `$${r.costUsd.toFixed(2)}` : ""}</span>
          <span className="text-xs text-muted-foreground">{new Date(r.startedAt).toLocaleTimeString()}</span>
        </button>
      ))}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="flex h-[85vh] max-w-4xl flex-col gap-3 sm:max-w-4xl">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">{open.prompt}</DialogTitle>
                <DialogDescription>
                  {open.status}{open.sessionId && <> · open in Claude Code: <code className="rounded bg-muted px-1">claude --resume {open.sessionId}</code></>}
                </DialogDescription>
              </DialogHeader>
              {open.status === "running" && <Button size="sm" variant="secondary" className="w-fit" onClick={() => fetch(`/api/runs/${open.runId}/stop`, { method: "POST" })}>Stop run</Button>}
              <RunViewer key={open.runId} runId={open.runId} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
