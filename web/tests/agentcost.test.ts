import assert from "node:assert/strict";
import { test } from "node:test";
import { costByAgent } from "../lib/agentcost.ts";

const asst = (id: string, model: string, usage: object, parent?: string, content: object[] = []) =>
  JSON.stringify({ type: "assistant", parent_tool_use_id: parent ?? null, message: { id, model, usage, content } });

test("splits each model's real cost across agents by tokens and counts a repeated message once", () => {
  const lines = [
    asst("m1", "opus", { input_tokens: 0, output_tokens: 100 }, undefined, [{ type: "tool_use", name: "Task", id: "t1", input: { subagent_type: "builder" } }]),
    asst("m1", "opus", { input_tokens: 0, output_tokens: 100 }), // the same message again: not double counted
    asst("m2", "opus", { input_tokens: 0, output_tokens: 300 }, "t1"),
    asst("m3", "haiku", { input_tokens: 1000, output_tokens: 0 }, "t1"),
    JSON.stringify({ type: "result", modelUsage: { opus: { costUSD: 4 }, haiku: { costUSD: 1 } } }),
    JSON.stringify({ type: "result", modelUsage: { opus: { costUSD: 4 }, haiku: { costUSD: 1 } } }),
  ];
  const c = costByAgent(lines);
  assert.ok(Math.abs(c.orchestrator.costUsd - 1) < 1e-9, String(c.orchestrator.costUsd)); // 100 of 400 output tokens on opus
  assert.ok(Math.abs(c.builder.costUsd - 4) < 1e-9, String(c.builder.costUsd)); // 300/400 of opus (3) + all of haiku (1)
  assert.equal(Object.values(c).reduce((n, x) => n + x.costUsd, 0), 5); // adds up to the run's real cost
});

test("a run with no result yet has no cost", () => {
  assert.deepEqual(costByAgent([asst("m1", "opus", { output_tokens: 5 })]), {});
});
