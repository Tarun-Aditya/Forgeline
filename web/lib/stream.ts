// Maps `claude -p --output-format stream-json` events to AI SDK UI message chunks.
// Pure and synchronous so it can be tested without spawning anything.
import type { UIMessageChunk } from "ai";

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number };

export type RunResult = {
  sessionId?: string;
  costUsd: number;
  durationMs: number;
  turns: number;
  isError: boolean;
  usage: Usage;
  models: Record<string, Usage & { costUsd: number }>;
};

type Block = {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
};

type ClaudeEvent = {
  type: string;
  subtype?: string;
  session_id?: string;
  parent_tool_use_id?: string | null;
  message?: { content?: Block[] | string };
  model?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
  is_error?: boolean;
  result?: string;
  usage?: Record<string, number>;
  modelUsage?: Record<string, Record<string, number>>;
};

const num = (v: unknown) => (typeof v === "number" ? v : 0);

function toUsage(u: Record<string, number> = {}): Usage {
  return {
    input: num(u.input_tokens ?? u.inputTokens),
    output: num(u.output_tokens ?? u.outputTokens),
    cacheRead: num(u.cache_read_input_tokens ?? u.cacheReadInputTokens),
    cacheWrite: num(u.cache_creation_input_tokens ?? u.cacheCreationInputTokens),
  };
}

function stringify(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (c && typeof c === "object" && "text" in c ? String((c as { text: unknown }).text) : JSON.stringify(c)))
      .join("\n");
  }
  return content == null ? "" : JSON.stringify(content);
}

// Tools that are plumbing between a subagent and its caller, not work worth showing.
const HIDDEN_TOOLS = new Set(["SubagentHandback"]);

export class EventMapper {
  result: RunResult | undefined;
  sessionId: string | undefined;
  private seq = 0;
  private hidden = new Set<string>();
  // A run can emit several result events (a second turn starts when a background subagent
  // hands back). Cost and per-model usage are cumulative across them and include subagents;
  // `usage`, duration and turns are per turn and add up.
  private results: ClaudeEvent[] = [];

  /** Turn one parsed stream-json line into zero or more UI chunks. */
  feed(ev: ClaudeEvent): UIMessageChunk[] {
    if (ev.session_id) this.sessionId ??= ev.session_id;

    if (ev.type === "system" && ev.subtype === "init") {
      return [{ type: "data-session", data: { sessionId: ev.session_id, model: ev.model }, transient: true } as UIMessageChunk];
    }

    const content = ev.message?.content;
    if (ev.type === "assistant" && Array.isArray(content)) {
      const out: UIMessageChunk[] = [];
      const sub = ev.parent_tool_use_id ? `[subagent] ` : "";
      for (const block of content) {
        if (block.type === "text" && block.text?.trim()) {
          const id = `t${this.seq++}`;
          out.push({ type: "text-start", id }, { type: "text-delta", id, delta: block.text }, { type: "text-end", id });
        } else if (block.type === "thinking" && block.thinking?.trim()) {
          const id = `r${this.seq++}`;
          out.push({ type: "reasoning-start", id }, { type: "reasoning-delta", id, delta: block.thinking }, { type: "reasoning-end", id });
        } else if (block.type === "tool_use" && block.id && block.name) {
          if (HIDDEN_TOOLS.has(block.name)) {
            this.hidden.add(block.id);
            continue;
          }
          out.push({
            type: "tool-input-available",
            toolCallId: block.id,
            toolName: block.name,
            input: block.input,
            dynamic: true,
            title: sub + toolTitle(block.name, block.input),
          });
        }
      }
      return out;
    }

    if (ev.type === "user" && Array.isArray(content)) {
      const out: UIMessageChunk[] = [];
      for (const block of content) {
        if (block.type !== "tool_result" || !block.tool_use_id || this.hidden.has(block.tool_use_id)) continue;
        const text = stringify(block.content);
        out.push(
          block.is_error
            ? { type: "tool-output-error", toolCallId: block.tool_use_id, errorText: text, dynamic: true }
            : { type: "tool-output-available", toolCallId: block.tool_use_id, output: text, dynamic: true },
        );
      }
      return out;
    }

    if (ev.type === "result") {
      this.results.push(ev);
      this.result = aggregate(this.results);
      // One data part with a fixed id: each later result replaces the earlier one on screen.
      const out: UIMessageChunk[] = [{ type: "data-result", id: "result", data: this.result } as UIMessageChunk];
      if (ev.is_error) out.push({ type: "error", errorText: ev.result || "The run failed." });
      return out;
    }
    return [];
  }
}

function aggregate(results: ClaudeEvent[]): RunResult {
  const last = results[results.length - 1];
  const models: RunResult["models"] = {};
  for (const r of results) {
    for (const [name, u] of Object.entries(r.modelUsage ?? {})) {
      models[name] = { ...toUsage(u), costUsd: num(u.costUSD) }; // cumulative: the latest wins
    }
  }
  const sum = (k: keyof Usage) => results.reduce((n, r) => n + toUsage(r.usage)[k], 0);
  const fromModels = (k: keyof Usage) => Object.values(models).reduce((n, m) => n + m[k], 0);
  const usage: Usage = Object.keys(models).length
    ? { input: fromModels("input"), output: fromModels("output"), cacheRead: fromModels("cacheRead"), cacheWrite: fromModels("cacheWrite") }
    : { input: sum("input"), output: sum("output"), cacheRead: sum("cacheRead"), cacheWrite: sum("cacheWrite") };
  return {
    sessionId: last.session_id,
    costUsd: Math.max(...results.map((r) => num(r.total_cost_usd))),
    durationMs: results.reduce((n, r) => n + num(r.duration_ms), 0),
    turns: results.reduce((n, r) => n + num(r.num_turns), 0),
    isError: Boolean(last.is_error),
    usage,
    models,
  };
}

export function toolTitle(name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  const pick = (k: string) => (typeof i[k] === "string" ? (i[k] as string) : "");
  if (name === "Bash") return `Bash: ${(pick("description") || pick("command")).slice(0, 80)}`;
  if (name === "Task" || name === "Agent") return `Agent: ${pick("subagent_type") || pick("description")}`;
  if (name === "Read" || name === "Edit" || name === "Write") return `${name}: ${pick("file_path")}`;
  if (name === "Skill") return `Skill: ${pick("skill")}`;
  return name;
}

/** Split a byte stream into complete JSON lines, ignoring blanks and non-JSON noise. */
export class LineParser {
  private buf = "";
  push(chunk: string): ClaudeEvent[] {
    this.buf += chunk;
    const lines = this.buf.split("\n");
    this.buf = lines.pop() ?? "";
    return lines.flatMap((l) => parseLine(l));
  }
  end(): ClaudeEvent[] {
    const rest = this.buf;
    this.buf = "";
    return parseLine(rest);
  }
}

function parseLine(line: string): ClaudeEvent[] {
  const t = line.trim();
  if (!t.startsWith("{")) return [];
  try {
    return [JSON.parse(t)];
  } catch {
    return [];
  }
}
