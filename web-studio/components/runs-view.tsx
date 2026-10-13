"use client";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useMemo, useState } from "react";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Messages } from "@/components/run-panel";
import { StatusBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePoll } from "@/components/use-poll";
import { cn } from "@/lib/utils";

type Run = {
  runId: string; repo: string; prompt: string; startedAt: string; status: "running" | "ok" | "failed" | "lost";
  jobIds: string[]; costUsd?: number; durationMs?: number; sessionId?: string;
};


/** Replays a run's saved log and keeps following it while the process is alive. */
function RunViewer({ runId }: { runId: string }) {
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const { messages, status, error } = useChat({ id: runId, transport, resume: true });
  return (
    <Conversation className="min-h-0 flex-1 rounded-xl bg-background shadow-inset">
      <ConversationContent>
        <Messages messages={messages} busy={status === "streaming"} />
        {error && <p className="text-sm text-destructive">{error.message}</p>}
        {messages.length === 0 && !error && <p className="text-sm text-muted-foreground">Loading log…</p>}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}

export function RunsView({ job }: { job?: string | null }) {
  const { data } = usePoll<{ runs: Run[] }>("/api/runs", 3000);
  const [open, setOpen] = useState<Run | null>(null);
  const runs = (data?.runs ?? []).filter((r) => !job || r.jobIds.includes(job));
  return (
    <div className="space-y-2">
      <p className="text-caption text-muted-foreground">Runs survive a web server restart. A run whose process disappeared without a result shows as lost; continue its job with /factory resume.</p>
      {runs.length === 0 && <p className="text-body text-muted-foreground">{job ? `No runs for ${job} yet.` : "No runs started from this app yet."}</p>}
      {runs.map((r) => (
        <button key={r.runId} onClick={() => setOpen(r)} className="state-layer flex min-h-table-row w-full cursor-pointer items-center gap-3 rounded-xl bg-card px-4 text-left text-body-sm shadow-raised outline-hidden focus-visible:[--surface-rim:var(--border-focus)]">
          <StatusBadge status={r.status} />
          <span className="min-w-0 flex-1 truncate">{r.prompt}</span>
          <span className="font-mono text-caption text-muted-foreground">{r.jobIds.join(", ")}</span>
          <span className="text-caption text-muted-foreground tabular-nums">{r.costUsd != null ? `$${r.costUsd.toFixed(2)}` : ""}</span>
          <span className="text-caption text-muted-foreground tabular-nums">{new Date(r.startedAt).toLocaleTimeString()}</span>
        </button>
      ))}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="flex h-[85vh] max-w-4xl flex-col gap-3 sm:max-w-4xl">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>{open.prompt}</DialogTitle>
                <DialogDescription>
                  {open.status}{open.sessionId && <> · open in Claude Code: <code className="rounded-md bg-fill px-1.5 font-mono text-caption">claude --resume {open.sessionId}</code></>}
                </DialogDescription>
              </DialogHeader>
              {open.status === "running" && <Button size="sm" variant="destructive" className="w-fit" onClick={() => fetch(`/api/runs/${open.runId}/stop`, { method: "POST" })}>Stop run</Button>}
              <RunViewer key={open.runId} runId={open.runId} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
