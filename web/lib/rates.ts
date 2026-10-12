// A transcript has token counts but no price. Runs started from the web app record the real cost per model, so the
// price per (weighted) token for each model is worked out from those, and used for sessions that have no cost.
import { weight, type Usage } from "./agentcost.ts";
import { loadRuns } from "./runs.ts";

export type Rates = Record<string, number>; // dollars per weighted token, by model

export function modelRates(): Rates {
  const sum: Record<string, { cost: number; w: number }> = {};
  for (const r of loadRuns())
    for (const [model, u] of Object.entries(r.models ?? {})) {
      const usage: Usage = { input_tokens: u.input, output_tokens: u.output, cache_read_input_tokens: u.cacheRead, cache_creation_input_tokens: u.cacheWrite };
      const s = (sum[model] ??= { cost: 0, w: 0 });
      s.cost += u.costUsd ?? 0;
      s.w += weight(usage);
    }
  return Object.fromEntries(Object.entries(sum).filter(([, s]) => s.w > 0 && s.cost > 0).map(([m, s]) => [m, s.cost / s.w]));
}
