"use client";
import { BadgeCheck, Check, Code, FileText, Hammer, Lightbulb, ListChecks, MousePointerClick, Palette, Pause, Play, RotateCcw, ShieldCheck, Sparkles, Bot } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { fmtDur, handoffsAt, stateAt, type AgentEvent, type Lanes } from "@/lib/agents";
import { cn } from "@/lib/utils";

const W = 1000;
const H = 545;
const REPLAY_MS = 30_000; // a finished job is replayed in about this long, whatever its real length
const HANDOFF_MS = 1200; // how long a hand-off dot takes to travel, in replay time

type Role = { icon: ComponentType<{ className?: string }>; label: string; x: number; y: number };
const ROLES: Record<string, Role> = {
  orchestrator: { icon: Sparkles, label: "Orchestrator", x: 500, y: 70 },
  "intent-writer": { icon: Lightbulb, label: "Intent writer", x: 90, y: 290 },
  "spec-writer": { icon: FileText, label: "Spec writer", x: 250, y: 290 },
  planner: { icon: ListChecks, label: "Planner", x: 410, y: 290 },
  builder: { icon: Hammer, label: "Builder", x: 570, y: 290 },
  "reviewer-security": { icon: ShieldCheck, label: "Security", x: 740, y: 140 },
  "reviewer-ux": { icon: MousePointerClick, label: "UX", x: 740, y: 250 },
  "reviewer-ui": { icon: Palette, label: "UI", x: 740, y: 360 },
  "reviewer-code": { icon: Code, label: "Code", x: 740, y: 470 },
  approver: { icon: BadgeCheck, label: "Approver", x: 910, y: 305 },
};
// Who hands to whom, besides the orchestrator starting everyone.
const FLOW: [string, string][] = [
  ["intent-writer", "spec-writer"], ["spec-writer", "planner"], ["planner", "builder"],
  ["builder", "reviewer-security"], ["builder", "reviewer-ux"], ["builder", "reviewer-ui"], ["builder", "reviewer-code"],
  ["reviewer-security", "approver"], ["reviewer-ux", "approver"], ["reviewer-ui", "approver"], ["reviewer-code", "approver"],
];

/** Pills show the action, with long paths cut down to the file name. */
const short = (t: string) => (t.startsWith("/") ? t.split("/").filter(Boolean).at(-1) ?? t : t);

function place(agent: string, extra: number): Role {
  return ROLES[agent] ?? { icon: Bot, label: agent, x: 120 + extra * 150, y: 470 };
}

const curve = (a: Role, b: Role) => ({ cx: (a.x + b.x) / 2, cy: Math.min(a.y, b.y) - (a.y === b.y ? 60 : 0) + (a.y === b.y ? 0 : 20) });
const bez = (a: Role, b: Role, p: number) => {
  const { cx, cy } = curve(a, b);
  const u = 1 - p;
  return { x: u * u * a.x + 2 * u * p * cx + p * p * b.x, y: u * u * a.y + 2 * u * p * cy + p * p * b.y };
};
const edgePath = (a: Role, b: Role) => {
  const { cx, cy } = curve(a, b);
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
};

/** Agents as role icons. The one working glows and shows its current action; hand-offs travel along the lines. */
export function AgentFlow({ view, events, jobKey, selected, onSelect }: { view: Lanes; events: AgentEvent[]; jobKey: string; selected: string | null; onSelect: (a: string) => void }) {
  const live = view.lanes.some((l) => l.spans.some((s) => s.open));
  const [t, setT] = useState<number>(view.t1);
  const [playing, setPlaying] = useState(true);
  const t0 = view.t0;
  const t1 = view.t1;
  const speed = Math.max(1, (t1 - t0) / REPLAY_MS);
  const last = useRef(0);
  const range = useRef({ t0, t1 });
  range.current = { t0, t1 };

  // A different job starts a fresh replay.
  useEffect(() => { setT(range.current.t0); setPlaying(true); }, [jobKey]);

  useEffect(() => {
    if (!playing && !live) return;
    let raf = 0;
    last.current = performance.now();
    const frame = (now: number) => {
      const dt = now - last.current;
      last.current = now;
      if (live) setT(Date.now());
      else
        setT((cur) => {
          const next = cur + dt * speed;
          if (next >= range.current.t1) { setPlaying(false); return range.current.t1; }
          return next;
        });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing, live, speed]);

  const at = Math.min(Math.max(t, t0), live ? Math.max(t, t1) : t1);
  const now = stateAt(view, events, at);
  // The orchestrator spans the whole job; it only "works" while nobody else is, otherwise it is waiting.
  const othersBusy = [...now].some(([a, n]) => a !== "orchestrator" && n.status === "active");
  const orchNow = now.get("orchestrator");
  if (orchNow && orchNow.status === "active" && othersBusy) now.set("orchestrator", { ...orchNow, status: "idle", doing: null });
  const hand = handoffsAt(view, at, HANDOFF_MS * (live ? 1 : speed));
  const present = view.lanes.map((l) => l.agent);
  const extras = present.filter((a) => !ROLES[a]);
  const roles = new Map(present.map((a) => [a, place(a, Math.max(extras.indexOf(a), 0))]));
  const orch = roles.get("orchestrator");
  const startedAt = (a: string) => view.lanes.find((l) => l.agent === a)?.spans[0]?.start ?? Infinity;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {live ? (
          <span className="flex items-center gap-1.5 text-claude"><span className="size-2 animate-pulse rounded-full bg-claude" /> Live</span>
        ) : (
          <>
            <Button size="sm" variant="secondary" onClick={() => { if (at >= t1) setT(t0); setPlaying((p) => !p); }}>
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />} {playing ? "Pause" : at >= t1 ? "Replay" : "Play"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setT(t0); setPlaying(true); }} aria-label="Restart"><RotateCcw className="size-4" /></Button>
          </>
        )}
        <input
          type="range" min={0} max={1000} value={Math.min(1000, Math.round(((at - t0) / Math.max(t1 - t0, 1)) * 1000))} disabled={live}
          onChange={(e) => { setPlaying(false); setT(t0 + (Number(e.target.value) / 1000) * (t1 - t0)); }}
          className="min-w-40 flex-1 accent-[var(--claude)]" aria-label="Job time"
        />
        <span className="tabular-nums text-xs text-muted-foreground">{fmtDur(Math.max(at - t0, 0))} / {fmtDur(t1 - t0)}</span>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <div className="relative min-w-[760px]" style={{ aspectRatio: `${W} / ${H}` }}>
          <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full" aria-hidden>
            {orch && present.filter((a) => a !== "orchestrator").map((a) => {
              const b = roles.get(a)!;
              const on = now.get(a)?.status === "active";
              return <path key={`o-${a}`} d={edgePath(orch, b)} fill="none" strokeWidth={on ? 2 : 1} strokeDasharray="4 8" className={cn(on ? "edge-live stroke-claude" : "stroke-border")} style={on ? { animation: "edge-flow 0.8s linear infinite" } : undefined} />;
            })}
            {FLOW.filter(([a, b]) => roles.has(a) && roles.has(b)).map(([a, b]) => {
              const reached = at >= startedAt(b);
              return <path key={`${a}-${b}`} d={`M ${roles.get(a)!.x} ${roles.get(a)!.y} L ${roles.get(b)!.x} ${roles.get(b)!.y}`} fill="none" strokeWidth={reached ? 2 : 1} className={reached ? "stroke-ok/60" : "stroke-border"} />;
            })}
            {orch && hand.map((h) => {
              const target = roles.get(h.agent)!;
              const p = 1 - (1 - h.progress) ** 2; // ease out
              const pt = bez(orch, target, p);
              const tail = bez(orch, target, Math.max(p - 0.08, 0));
              return (
                <g key={`${h.agent}-${Math.round(h.progress * 100)}`}>
                  <circle cx={tail.x} cy={tail.y} r={4} className="fill-claude/40" />
                  <circle cx={pt.x} cy={pt.y} r={7} className="fill-claude" />
                </g>
              );
            })}
          </svg>

          {present.map((a) => {
            const r = roles.get(a)!;
            const s = now.get(a)!;
            const Icon = r.icon;
            const big = a === "orchestrator";
            return (
              <button
                key={a}
                onClick={() => onSelect(a)}
                className="absolute flex w-36 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 text-center outline-none"
                style={{ left: `${(r.x / W) * 100}%`, top: `${(r.y / H) * 100}%` }}
              >
                <span
                  className={cn(
                    "relative grid place-items-center rounded-full border-2 bg-background transition-all duration-300",
                    big ? "size-16" : "size-14",
                    s.status === "idle" && (big ? "border-border text-foreground/70" : "border-border text-muted-foreground opacity-50"),
                    s.status === "active" && "agent-active scale-110 border-claude text-claude",
                    s.status === "done" && "border-ok/70 text-ok",
                    selected === a && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                  )}
                  style={s.status === "active" ? { animation: "agent-ring 1.4s ease-out infinite" } : undefined}
                >
                  <Icon className={big ? "size-7" : "size-6"} />
                  {s.status === "done" && <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-ok text-background"><Check className="size-3" /></span>}
                </span>
                <span className={cn("text-xs font-medium", s.status === "idle" && !big && "text-muted-foreground")}>{r.label}</span>
                {s.status === "active" && s.doing && (
                  <span className="max-w-full truncate rounded-full border border-claude/40 bg-claude/10 px-2 py-0.5 text-[10px] text-claude" title={s.doing}>{short(s.doing)}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
