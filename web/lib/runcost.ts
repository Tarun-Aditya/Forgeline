import fs from "node:fs";
import { costByAgent, mergeCosts, type AgentCost } from "./agentcost.ts";
import { eventLogPath, listMeta, statusOf } from "./runs.ts";

const cache = new Map<string, { size: number; cost: Record<string, AgentCost> }>();

/** Cost per agent for one finished run, cached by log size (a finished log never changes). */
export function runCost(runId: string): Record<string, AgentCost> {
  let size = 0;
  try { size = fs.statSync(eventLogPath(runId)).size; } catch { return {}; }
  const hit = cache.get(runId);
  if (hit && hit.size === size) return hit.cost;
  const cost = costByAgent(fs.readFileSync(eventLogPath(runId), "utf8").split("\n"));
  cache.set(runId, { size, cost });
  return cost;
}

/** Cost per agent over every finished run on `repo`, optionally only those for one job (a run on several jobs is split evenly). */
export function repoCost(repo: string, job?: string): Record<string, AgentCost> {
  const out: Record<string, AgentCost> = {};
  for (const m of listMeta()) {
    if (m.repo !== repo) continue;
    const { status, record } = statusOf(m);
    if (status === "running") continue;
    const ids = record?.jobIds ?? (m.key ? [m.key] : []);
    if (job && !ids.includes(job)) continue;
    mergeCosts(out, runCost(m.runId), job ? 1 / ids.length : 1);
  }
  return out;
}
