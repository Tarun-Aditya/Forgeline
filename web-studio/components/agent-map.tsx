"use client";
import { Bot, CodeXml, Compass, FileText, GitPullRequest, Hammer, Lightbulb, ListChecks, MousePointerClick, Palette, ScanSearch, ShieldAlert, ShieldCheck, Stamp, Stethoscope } from "lucide-react";
import { Fragment, type ComponentType } from "react";
import type { AgentRow } from "@/components/agents-view";
import { cn } from "@/lib/utils";

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  "intent-writer": Lightbulb, "spec-writer": FileText, planner: ListChecks, builder: Hammer,
  "reviewer-security": ShieldCheck, "reviewer-ux": MousePointerClick, "reviewer-ui": Palette, "reviewer-code": CodeXml,
  approver: Stamp, "scanner-quality": ScanSearch, "scanner-security": ShieldAlert, diagnoser: Stethoscope,
  onboarder: Compass, "pr-reviewer": GitPullRequest,
};

// The factory's order of work, left to right. Agents not named here land in "Other".
const LANES: { title: string; names: string[] }[] = [
  { title: "Intake", names: ["intent-writer", "spec-writer"] },
  { title: "Plan", names: ["planner"] },
  { title: "Build", names: ["builder"] },
  { title: "Review", names: ["reviewer-security", "reviewer-ux", "reviewer-ui", "reviewer-code"] },
  { title: "Decide", names: ["approver"] },
];
const SIDE: { title: string; names: string[] }[] = [
  { title: "Maintain loop", names: ["scanner-quality", "scanner-security", "diagnoser"] },
  { title: "Setup and review", names: ["onboarder", "pr-reviewer"] },
];

function Tile({ row, selected, onSelect, scoped }: { row: AgentRow; selected: boolean; onSelect: (n: string) => void; scoped: boolean }) {
  const Icon = ICONS[row.name] ?? Bot;
  const live = row.state === "running";
  return (
    <button
      onClick={() => onSelect(row.name)}
      aria-pressed={selected}
      className={cn(
        scoped && !live && !row.events && "opacity-50",
        "state-layer group relative flex w-full cursor-pointer items-center gap-3 rounded-xl bg-card p-3 text-left shadow-raised outline-hidden focus-visible:[--surface-rim:var(--border-focus)]",
        selected && "[--surface-rim:var(--border-strong)]",
        live && "[--surface-rim:var(--success-indicator)]",
      )}
    >
      <span className="relative grid size-9 shrink-0 place-items-center rounded-lg bg-fill text-foreground">
        {live && <span aria-hidden className="absolute inset-0 rounded-lg bg-success-indicator/30 motion-safe:animate-ping" />}
        <Icon className="relative size-icon-lg" />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-mono text-caption text-foreground">{row.name}</span>
        <span className="block truncate text-meta text-muted-foreground">
          {live ? "working now" : row.events ? (scoped ? `worked on this job · ${row.events}` : `${row.events} events`) : scoped ? "not involved" : "idle"}{row.model ? ` · ${row.model}` : ""}
        </span>
      </span>
      {live && <span aria-hidden className="absolute top-2 right-2 size-1.5 rounded-full bg-success-indicator motion-safe:animate-pulse" />}
    </button>
  );
}

/** Animated link between two lanes: dashes travel while either side is working. */
function Link({ live }: { live: boolean }) {
  return (
    <div aria-hidden className="relative mt-[4.1rem] hidden h-0.5 w-8 shrink-0 self-start lg:block">
      <svg viewBox="0 0 32 2" preserveAspectRatio="none" className="absolute inset-0 size-full">
        <line x1="0" y1="1" x2="32" y2="1" stroke={live ? "var(--success-indicator)" : "var(--border-strong)"} strokeWidth="2" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" className={live ? "motion-safe:animate-[agent-flow_0.8s_linear_infinite]" : undefined} />
      </svg>
    </div>
  );
}

/** Pictorial view: the pipeline as lanes of agent tiles, with live agents pulsing. */
export function AgentMap({ rows, selected, onSelect, job }: { rows: AgentRow[]; selected: string | null; onSelect: (n: string) => void; job?: string | null }) {
  const by = new Map(rows.map((r) => [r.name, r]));
  const pick = (names: string[]) => names.map((n) => by.get(n)).filter((r): r is AgentRow => !!r);
  const known = new Set([...LANES, ...SIDE].flatMap((l) => l.names));
  const other = rows.filter((r) => !known.has(r.name));
  const lanes = LANES.map((l) => ({ ...l, rows: pick(l.names) })).filter((l) => l.rows.length);
  const liveLane = lanes.map((l) => l.rows.some((r) => r.state === "running"));
  const side = [...SIDE.map((l) => ({ ...l, rows: pick(l.names) })), { title: "Other", names: [], rows: other }].filter((l) => l.rows.length);

  return (
    <div className="space-y-8">
      <div>
        <h3 className="mb-3 text-eyebrow text-muted-foreground uppercase">Factory pipeline</h3>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-0">
          {lanes.map((l, i) => (
            <Fragment key={l.title}>
              {i > 0 && <Link live={liveLane[i] || liveLane[i - 1]} />}
              <section className="min-w-0 flex-1 space-y-2">
                <h4 className="text-column text-muted-foreground">{l.title}</h4>
                {l.rows.map((r) => <Tile key={r.name} row={r} selected={selected === r.name} onSelect={onSelect} scoped={!!job} />)}
              </section>
            </Fragment>
          ))}
        </div>
      </div>
      {side.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {side.map((l) => (
            <section key={l.title} className="space-y-2">
              <h3 className="text-eyebrow text-muted-foreground uppercase">{l.title}</h3>
              {l.rows.map((r) => <Tile key={r.name} row={r} selected={selected === r.name} onSelect={onSelect} scoped={!!job} />)}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
