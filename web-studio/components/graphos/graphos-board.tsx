"use client";
import { useEffect, useRef } from "react";
import { StatusDot } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GraphosState } from "@/lib/graphos";

type Stage = { key: string; label: string; who: string };

const NEXT_LABEL: Record<string, string> = {
  "graphos-intake": "intake", "graphos-selector": "selector", "graphos-author": "author",
  "graphos-validator": "validator", "graphos-reviewer": "reviewer", "graphos-exporter": "exporter",
};

/** Layers that did not run are shown as such, never as a pass. */
export function EvidenceChips({ evidence }: { evidence: GraphosState["evidence"] }) {
  if (!evidence) return null;
  const pass = Object.values(evidence.layers).filter((s) => s === "pass").length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge size="sm" variant="success" emphasis="subtle">{pass} pass</Badge>
      {evidence.failed.length > 0 && <Badge size="sm" variant="destructive" emphasis="subtle" title={evidence.failed.join(", ")}>{evidence.failed.length} fail</Badge>}
      {evidence.not_run.length > 0 && <Badge size="sm" variant="neutral" emphasis="subtle" title={evidence.not_run.join(", ")}>{evidence.not_run.length} not run</Badge>}
    </div>
  );
}

function Card({ w, running, selected, onOpen }: { w: GraphosState; running: boolean; selected: boolean; onOpen: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selected, w.stage]);
  const needs = w.gate && w.stage !== "export";
  const ready = w.stage === "export" && !w.exported;
  return (
    <button
      ref={ref}
      onClick={onOpen}
      data-testid={`gx-card-${w.name}`}
      className={cn(
        "state-layer w-full cursor-pointer rounded-xl bg-card p-3 text-left text-body-sm shadow-raised outline-hidden focus-visible:[--surface-rim:var(--border-focus)]",
        selected && "[--surface-rim:var(--border-strong)]",
        (needs || ready) && "[--surface-rim:var(--brand-pink)]",
        w.exported && "opacity-70",
      )}
    >
      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {running && <StatusDot status="running" />}
        <span className="whitespace-nowrap font-mono">{w.name}</span>
        {needs && <Badge variant="pink" size="sm" indicator="pulse" className="ml-auto">your call</Badge>}
        {ready && <Badge variant="pink" size="sm" indicator="pulse" className="ml-auto">ready to export</Badge>}
        {w.exported && <Badge variant="success" size="sm" className="ml-auto">exported</Badge>}
      </div>
      <p className="line-clamp-3 text-body-sm text-foreground">{w.reason}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <Badge variant="neutral" size="sm">{w.intake === "spec" ? "from spec" : "from docs"}</Badge>
        <Badge variant="neutral" size="sm">{w.ops_total} ops</Badge>
        {w.selection && <Badge variant="neutral" size="sm">{w.selection.included} in scope</Badge>}
        {w.decisions.open > 0 && <Badge variant="warning" size="sm">{w.decisions.open} to answer</Badge>}
        {w.refresh && <Badge variant="warning" size="sm">API changed</Badge>}
        {w.context_mode === "specialized" && <Badge variant="info" size="sm">customer-specific</Badge>}
      </div>
      {w.evidence && <div className="mt-2"><EvidenceChips evidence={w.evidence} /></div>}
      {!w.gate && w.next && !running && <p className="mt-2 text-meta text-muted-foreground">next: {NEXT_LABEL[w.next] ?? w.next}</p>}
    </button>
  );
}

type Props = { starting?: string[]; workspaces: GraphosState[]; stages: Stage[]; running: Set<string>; selected?: string | null; onOpen: (name: string) => void };

export function GraphosBoard({ starting = [], workspaces, stages, running, selected, onOpen }: Props) {
  const first = stages[0]?.key;
  return (
    <div>
      {workspaces.length === 0 && starting.length === 0 && (
        <p className="p-8 text-center text-sm text-muted-foreground">No connectors yet. Use New connector: give it a spec or a docs link and it builds a workspace here.</p>
      )}
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(168px, 1fr))` }}>
        {stages.map((s) => {
          const here = workspaces.filter((w) => w.stage === s.key);
          return (
            <section key={s.key} className="min-w-0 space-y-2" data-testid={`gx-col-${s.key}`}>
              <header className="flex items-baseline gap-2 px-1">
                <h2 className="text-card-title">{s.label}</h2>
                <span className="truncate text-caption text-placeholder">{s.who}</span>
                <span className="ml-auto text-xs text-muted-foreground">{here.length || ""}</span>
              </header>
              {s.key === first && starting.map((text, i) => (
                <div key={`starting-${i}`} role="status" className="space-y-1 rounded-xl bg-card p-3 text-body-sm shadow-raised">
                  <div className="flex items-center gap-2 text-caption text-muted-foreground"><StatusDot status="running" /> Creating the workspace…</div>
                  <p className="line-clamp-3">{text}</p>
                </div>
              ))}
              {here.map((w) => <Card key={w.name} w={w} running={running.has(`gx-${w.name}`)} selected={selected === w.name} onOpen={() => onOpen(w.name)} />)}
            </section>
          );
        })}
      </div>
    </div>
  );
}
