// Sessions the web app did not start: terminal, VS Code and desktop, found through the hook-written activity log and
// described from their transcripts. Runs the web app launched (`claude -p`, marked "web") are covered by its own run files.
import { count, mergeCosts, weight, type AgentCost } from "./agentcost.ts";
import { status, type SessionState } from "./activity.ts";
import { modelRates } from "./rates.ts";
import { loadRuns } from "./runs.ts";
import { sessionMeta, sessionUsage } from "./transcripts.ts";

export type ExternalSession = {
  sid: string; source: string; title: string; job: string | null; state: SessionState["state"];
  startedAt: string | null; lastAt: string | null; ageSeconds: number; last: string;
};

export async function externalSessions(repo: string): Promise<ExternalSession[]> {
  const webSids = new Set(loadRuns().map((r) => r.sessionId).filter((s): s is string => !!s));
  const out: ExternalSession[] = [];
  for (const s of await status(repo)) {
    const meta = sessionMeta(repo, s.session);
    if (webSids.has(s.session) || meta?.source === "web") continue;
    out.push({
      sid: s.session, source: meta?.source ?? "unknown", title: meta?.title || s.last, job: s.job, state: s.state,
      startedAt: meta?.startedAt ?? null, lastAt: s.last_ts, ageSeconds: s.age_seconds, last: s.last,
    });
  }
  return out;
}

// Subagents the factory starts. A session that ran any of these, or began with a /factory command, was doing factory work.
const FACTORY_AGENTS = /^(intent-writer|spec-writer|planner|builder|reviewer-\w+|approver|diagnoser|scanner-\w+|onboarder|pr-reviewer)$/;

/** The activity log ties a session to a job when it merely mentions it, so a person's own coding session can look like
 *  it is working a job. Cost only counts for sessions that actually ran the factory. */
export function ranFactory(firstPrompt: string | undefined, agents: string[]): boolean {
  return /^\/factory\b/.test((firstPrompt ?? "").trim()) || agents.some((a) => FACTORY_AGENTS.test(a));
}

/** Estimated cost per agent over sessions started outside the web app, priced from what web runs cost per model. */
export async function externalCost(repo: string, job?: string): Promise<Record<string, AgentCost>> {
  const rates = modelRates();
  const out: Record<string, AgentCost> = {};
  for (const s of await externalSessions(repo)) {
    if (job && s.job !== job) continue;
    const per: Record<string, AgentCost> = {};
    const usage = sessionUsage(repo, s.sid);
    if (!ranFactory(sessionMeta(repo, s.sid)?.firstPrompt, Object.keys(usage))) continue;
    for (const [agent, models] of Object.entries(usage)) {
      const a = (per[agent] = { costUsd: 0, tokens: 0 });
      for (const [model, u] of Object.entries(models)) {
        a.tokens += count(u);
        a.costUsd += weight(u) * (rates[model] ?? 0); // a model never seen in a web run has no price yet: tokens only
      }
    }
    mergeCosts(out, per);
  }
  return out;
}
