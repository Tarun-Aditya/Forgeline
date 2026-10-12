// Turns the shared activity log into lanes: one per agent, with the spans it was active.
// Pure (no node imports) so the browser and the tests can both use it.
import { describeAction } from "./tools.ts";

export type AgentEvent = { ts: string; sid?: string; ev: string; agent: string; tool: string; text: string; job: string | null };
export type Span = { start: number; end: number; open: boolean };
export type Lane = { agent: string; spans: Span[]; tools: number; first: number; last: number };
export type Lanes = { t0: number; t1: number; lanes: Lane[] };

/** Pipeline order; agents not listed go after these, in order of first appearance. */
export const ORDER = ["orchestrator", "intent-writer", "spec-writer", "planner", "builder", "reviewer-security", "reviewer-ux", "reviewer-ui", "reviewer-code", "approver"];

/** An agent with a start but no stop is "running" only while the log keeps moving; after this it is treated as dead. */
export const STALE_MS = 120_000;

/** `alive`: ids of sessions that are still running. An agent whose session is gone was killed, not working. */
export function buildLanes(events: AgentEvent[], now = Date.now(), alive?: Set<string>): Lanes {
  const evs = events.map((e) => ({ ...e, t: Date.parse(e.ts) })).filter((e) => !Number.isNaN(e.t)).sort((a, b) => a.t - b.t);
  const byAgent = new Map<string, Lane>();
  const openStart = new Map<string, { t: number; sid?: string }[]>();
  const lane = (agent: string, t: number) => {
    let l = byAgent.get(agent);
    if (!l) byAgent.set(agent, (l = { agent, spans: [], tools: 0, first: t, last: t }));
    return l;
  };
  for (const e of evs) {
    const l = lane(e.agent, e.t);
    l.last = e.t;
    if (e.ev === "tool_done") l.tools++;
    if (e.ev === "subagent_start") (openStart.get(e.agent) ?? openStart.set(e.agent, []).get(e.agent)!).push({ t: e.t, sid: e.sid });
    if (e.ev === "subagent_stop") {
      const start = openStart.get(e.agent)?.shift()?.t ?? l.first;
      l.spans.push({ start, end: e.t, open: false });
    }
  }
  const last = evs.at(-1)?.t ?? now;
  const stale = now - last > STALE_MS; // nothing logged for a while: the agent was killed, not still working
  for (const [agent, starts] of openStart)
    for (const { t: start, sid } of starts) {
      const lane = byAgent.get(agent)!;
      const live = !stale && (!alive || (sid !== undefined && alive.has(sid)));
      lane.spans.push({ start, end: Math.max(live ? last : lane.last, start), open: live });
    }
  for (const l of byAgent.values()) {
    // The orchestrator (and anything with no start/stop pair) is shown from its first to last event.
    if (l.spans.length === 0) l.spans.push({ start: l.first, end: l.last, open: false });
    l.spans.sort((a, b) => a.start - b.start);
  }
  const rank = (a: string) => (ORDER.includes(a) ? ORDER.indexOf(a) : ORDER.length);
  const lanes = [...byAgent.values()].sort((a, b) => rank(a.agent) - rank(b.agent) || a.first - b.first);
  const t0 = evs[0]?.t ?? now;
  return { t0, t1: Math.max(last, t0 + 1000), lanes };
}

export const fmtDur = (ms: number) => (ms < 1000 ? `${ms}ms` : ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`);

export type Status = "idle" | "active" | "done";
export type AgentNow = { status: Status; doing: string | null; since: number | null };

/** What every agent is doing at time `t`: not started, working (and on what), or finished. */
export function stateAt(view: Lanes, events: AgentEvent[], t: number): Map<string, AgentNow> {
  const doing = new Map<string, string>(); // latest tool call per agent up to t
  for (const e of [...events].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))) {
    if (e.ev === "tool" && Date.parse(e.ts) <= t) doing.set(e.agent, describeAction(e.tool, e.text));
  }
  const out = new Map<string, AgentNow>();
  for (const l of view.lanes) {
    const span = l.spans.find((s) => t >= s.start && (t <= s.end || s.open));
    const started = l.spans.some((s) => s.start <= t);
    out.set(l.agent, { status: span ? "active" : started ? "done" : "idle", doing: span ? (doing.get(l.agent) ?? null) : null, since: span?.start ?? null });
  }
  return out;
}

/** Hand-offs in the `window` ms before `t`, with how far along (0..1) each is. One per agent: the most recent. */
export function handoffsAt(view: Lanes, t: number, window: number): { agent: string; progress: number }[] {
  const out: { agent: string; progress: number }[] = [];
  for (const l of view.lanes) {
    if (l.agent === "orchestrator") continue;
    const recent = l.spans.filter((s) => t >= s.start && t - s.start < window).map((s) => s.start).sort((a, b) => b - a)[0];
    if (recent !== undefined) out.push({ agent: l.agent, progress: (t - recent) / window });
  }
  return out;
}
