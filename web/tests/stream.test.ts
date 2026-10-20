import assert from "node:assert/strict";
import test from "node:test";
import { EventMapper, LineParser } from "../lib/stream.ts";

const tool = { type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "echo hi", description: "Say hi" } }] } };

test("assistant text becomes a text part", () => {
  const out = new EventMapper().feed({ type: "assistant", message: { content: [{ type: "text", text: "hello" }] } });
  assert.deepEqual(out.map((c) => c.type), ["text-start", "text-delta", "text-end"]);
});

test("tool_use and tool_result pair up by id", () => {
  const m = new EventMapper();
  const [use] = m.feed(tool);
  assert.equal(use.type, "tool-input-available");
  assert.equal((use as { title: string }).title, "Bash: Say hi");
  const [res] = m.feed({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "hi", is_error: false }] } });
  assert.deepEqual(res, { type: "tool-output-available", toolCallId: "t1", output: "hi", dynamic: true });
});

test("a failing tool result becomes an output error", () => {
  const [res] = new EventMapper().feed({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "boom", is_error: true }] } });
  assert.equal(res.type, "tool-output-error");
});

test("subagent tool calls are marked in the title", () => {
  const [use] = new EventMapper().feed({ ...tool, parent_tool_use_id: "p1" });
  assert.match((use as { title: string }).title, /^\[subagent\]/);
});

test("result event records cost, usage and per-model usage", () => {
  const m = new EventMapper();
  m.feed({
    type: "result", session_id: "s1", total_cost_usd: 0.12, duration_ms: 5000, num_turns: 3,
    usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 30, cache_creation_input_tokens: 40 },
    modelUsage: { "claude-x": { inputTokens: 1, outputTokens: 2, costUSD: 0.1 } },
  });
  assert.equal(m.result?.costUsd, 0.12);
  assert.deepEqual(m.result?.usage, { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 }, "per-model usage wins: it includes subagents");
  assert.equal(m.result?.models["claude-x"].costUsd, 0.1);
  const bare = new EventMapper();
  bare.feed({ type: "result", usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 30, cache_creation_input_tokens: 40 } });
  assert.deepEqual(bare.result?.usage, { input: 10, output: 20, cacheRead: 30, cacheWrite: 40 }, "without per-model usage, fall back to the turn usage");
});

test("an error result adds an error chunk", () => {
  const out = new EventMapper().feed({ type: "result", is_error: true, result: "nope" });
  assert.ok(out.some((c) => c.type === "error"));
});

test("LineParser handles split lines and skips noise", () => {
  const p = new LineParser();
  assert.deepEqual(p.push('{"type":"a"}\nnot json\n{"ty'), [{ type: "a" }]);
  assert.deepEqual(p.push('pe":"b"}\n'), [{ type: "b" }]);
  assert.deepEqual(p.end(), []);
});

test("several result events are combined: cost is cumulative, turns and time add up", () => {
  const m = new EventMapper();
  m.feed({ type: "result", session_id: "s", total_cost_usd: 0.18, duration_ms: 13000, num_turns: 4, usage: { input_tokens: 8, output_tokens: 785 },
           modelUsage: { x: { inputTokens: 20, outputTokens: 3035, cacheReadInputTokens: 100, cacheCreationInputTokens: 5, costUSD: 0.18 } } });
  const out = m.feed({ type: "result", session_id: "s", total_cost_usd: 0.18, duration_ms: 7000, num_turns: 2, usage: { input_tokens: 6, output_tokens: 408 },
           modelUsage: { x: { inputTokens: 20, outputTokens: 3035, cacheReadInputTokens: 100, cacheCreationInputTokens: 5, costUSD: 0.18 } } });
  assert.equal(m.result?.costUsd, 0.18, "cost must not be counted twice");
  assert.equal(m.result?.durationMs, 20000);
  assert.equal(m.result?.turns, 6);
  assert.equal(m.result?.usage.output, 3035, "tokens come from the cumulative per-model usage, which includes subagents");
  assert.equal((out[0] as { id?: string }).id, "result", "later results replace the earlier data part");
});

test("subagent hand-back plumbing is hidden", () => {
  const m = new EventMapper();
  assert.deepEqual(m.feed({ type: "assistant", message: { content: [{ type: "tool_use", id: "h1", name: "SubagentHandback", input: {} }] } }), []);
  assert.deepEqual(m.feed({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "h1", content: "ok" }] } }), []);
});

test("finalText is the result string of the last result event", () => {
  const m = new EventMapper();
  assert.equal(m.finalText, undefined);
  m.feed({ type: "result", session_id: "s", result: "first" });
  m.feed({ type: "result", session_id: "s", result: "second" });
  assert.equal(m.finalText, "second");
});
