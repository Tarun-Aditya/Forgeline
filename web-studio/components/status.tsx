"use client";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** One status vocabulary for runs, sessions and jobs. */
export type Status = "running" | "ok" | "failed" | "lost" | "idle" | "ended" | "stalled" | "crashed" | "waiting" | "paused";

const TONE: Record<Status, { dot: string; variant: BadgeVariant; pulse?: boolean }> = {
  running: { dot: "bg-success-indicator", variant: "success", pulse: true },
  ok: { dot: "bg-success-indicator", variant: "success" },
  failed: { dot: "bg-destructive-indicator", variant: "destructive" },
  crashed: { dot: "bg-destructive-indicator", variant: "destructive" },
  stalled: { dot: "bg-warning-indicator", variant: "warning" },
  lost: { dot: "bg-warning-indicator", variant: "warning" },
  paused: { dot: "bg-warning-indicator", variant: "warning" },
  waiting: { dot: "bg-brand-pink", variant: "pink", pulse: true },
  idle: { dot: "bg-muted-foreground", variant: "neutral" },
  ended: { dot: "bg-muted-foreground/60", variant: "neutral" },
};

export function StatusDot({ status, className }: { status: Status; className?: string }) {
  const t = TONE[status];
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", t.dot, t.pulse && "animate-pulse", className)} />;
}

export function StatusBadge({ status, children, className }: { status: Status; children?: React.ReactNode; className?: string }) {
  const t = TONE[status];
  return (
    <Badge variant={t.variant} emphasis="subtle" indicator={t.pulse ? "pulse" : "dot"} className={className}>
      {children ?? status}
    </Badge>
  );
}

export type Belt = { state: "working" | "waiting" | "trouble" | "ready"; text: string };

/** Header indicator, like Mastra's Activity belt: working / waiting on you / trouble / ready. */
export function ActivityBelt({ belt, onClick }: { belt: Belt; onClick?: () => void }) {
  const status: Status = belt.state === "working" ? "running" : belt.state === "waiting" ? "waiting" : belt.state === "trouble" ? "crashed" : "idle";
  return (
    <button onClick={onClick} className="state-layer inline-flex h-control-sm cursor-pointer items-center gap-2 rounded-full bg-card px-3 text-label shadow-raised">
      <StatusDot status={status} />
      <span>{belt.text}</span>
    </button>
  );
}
