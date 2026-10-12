// Which agent spent what. A run records the exact cost per model, and every message names its model and the subagent it
// came from, so each model's cost is split across agents by how many tokens they used. It is an estimate: the weights
// are the usual list-price ratios (output 5x input, cache reads 0.1x, cache writes 1.25x).

type Usage = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
export type AgentCost = { costUsd: number; tokens: number };

const weight = (u: Usage) => (u.input_tokens ?? 0) + 5 * (u.output_tokens ?? 0) + 0.1 * (u.cache_read_input_tokens ?? 0) + 1.25 * (u.cache_creation_input_tokens ?? 0);
const count = (u: Usage) => (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);

/** `lines`: a run's stream-json log, one JSON object per line. Returns {} when the run has no result yet. */
export function costByAgent(lines: Iterable<string>): Record<string, AgentCost> {
  const agentOf = new Map<string, string>(); // Task tool_use id -> subagent name
  const messages = new Map<string, { agent: string; model: string; usage: Usage }>(); // by message id: events repeat it, keep the last
  let modelCost: Record<string, number> | null = null;
  for (const line of lines) {
    if (!line.includes('"assistant"') && !line.includes('"result"')) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type === "assistant" && ev.message?.id) {
      for (const c of ev.message.content ?? []) {
        if ((c.name === "Task" || c.name === "Agent") && c.id) agentOf.set(c.id, c.input?.subagent_type || c.input?.description || "subagent");
      }
      const parent: string | undefined = ev.parent_tool_use_id ?? undefined;
      messages.set(ev.message.id, { agent: parent ? (agentOf.get(parent) ?? "subagent") : "orchestrator", model: ev.message.model ?? "unknown", usage: ev.message.usage ?? {} });
    } else if (ev.type === "result" && ev.modelUsage) {
      // Results repeat the running total, so the last one is the whole run.
      modelCost = Object.fromEntries(Object.entries(ev.modelUsage as Record<string, { costUSD?: number }>).map(([m, u]) => [m, u.costUSD ?? 0]));
    }
  }
  if (!modelCost) return {};
  const perModel = new Map<string, number>(); // total weight per model
  for (const m of messages.values()) perModel.set(m.model, (perModel.get(m.model) ?? 0) + weight(m.usage));
  const out: Record<string, AgentCost> = {};
  for (const m of messages.values()) {
    const total = perModel.get(m.model) ?? 0;
    const share = total > 0 ? (modelCost[m.model] ?? 0) * (weight(m.usage) / total) : 0;
    const a = (out[m.agent] ??= { costUsd: 0, tokens: 0 });
    a.costUsd += share;
    a.tokens += count(m.usage);
  }
  return out;
}

export function mergeCosts(into: Record<string, AgentCost>, add: Record<string, AgentCost>, scale = 1) {
  for (const [agent, c] of Object.entries(add)) {
    const a = (into[agent] ??= { costUsd: 0, tokens: 0 });
    a.costUsd += c.costUsd * scale;
    a.tokens += c.tokens * scale;
  }
  return into;
}
