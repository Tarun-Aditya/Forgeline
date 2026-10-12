import { loadRuns, type RunRecord } from "./runs.ts";

type Bucket = { runs: number; costUsd: number; input: number; output: number; cacheRead: number; cacheWrite: number };
const empty = (): Bucket => ({ runs: 0, costUsd: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

function add(b: Bucket, u: Partial<Bucket> & { costUsd?: number }, runs = 0) {
  b.runs += runs;
  b.costUsd += u.costUsd ?? 0;
  b.input += u.input ?? 0;
  b.output += u.output ?? 0;
  b.cacheRead += u.cacheRead ?? 0;
  b.cacheWrite += u.cacheWrite ?? 0;
}

export function summarize(runs: RunRecord[]) {
  const total = empty();
  const byModel: Record<string, Bucket> = {};
  const byDay: Record<string, Bucket> = {};
  const byJob: Record<string, Bucket> = {};
  let failed = 0;
  let durationMs = 0;
  for (const r of runs) {
    const flat = { costUsd: r.costUsd, ...(r.usage ?? {}) };
    add(total, flat, 1);
    durationMs += r.durationMs ?? 0;
    if (!r.ok) failed++;
    add((byDay[r.startedAt.slice(0, 10)] ??= empty()), flat, 1);
    for (const id of r.jobIds) add((byJob[id] ??= empty()), flat, 1);
    for (const [m, u] of Object.entries(r.models ?? {})) add((byModel[m] ??= empty()), u, 1);
  }
  return { total, failed, durationMs, byModel, byDay, byJob };
}

export const runMetrics = () => summarize(loadRuns());
