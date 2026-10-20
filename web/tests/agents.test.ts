import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLanes } from "../lib/agents.ts";

const ev = (ts: string, e: string, agent: string) => ({ ts: `2026-01-01T00:00:${ts}Z`, ev: e, agent, tool: "", text: "", job: "001-x" });

test("pairs subagent start and stop into spans, ordered by pipeline", () => {
  const l = buildLanes([
    ev("00.000", "prompt", "orchestrator"),
    ev("01.000", "subagent_start", "planner"),
    ev("02.000", "tool_done", "planner"),
    ev("05.000", "subagent_stop", "planner"),
    ev("05.500", "subagent_start", "spec-writer"),
    ev("06.000", "subagent_stop", "spec-writer"),
  ]);
  assert.deepEqual(l.lanes.map((x) => x.agent), ["orchestrator", "spec-writer", "planner"]);
  const planner = l.lanes.find((x) => x.agent === "planner")!;
  assert.equal(planner.tools, 1);
  assert.equal(planner.spans[0].end - planner.spans[0].start, 4000);
  assert.equal(planner.spans[0].open, false);
});

test("an agent that has started but not stopped is an open span while the log is fresh", () => {
  const now = Date.parse("2026-01-01T00:00:10.000Z");
  const l = buildLanes([ev("00.000", "subagent_start", "builder"), ev("03.000", "tool_done", "builder")], now);
  assert.equal(l.lanes[0].spans[0].open, true);
  assert.equal(l.t1, Date.parse("2026-01-01T00:00:03.000Z"));
});

test("reviewers that run together overlap", () => {
  const l = buildLanes([
    ev("00.000", "subagent_start", "reviewer-ux"), ev("00.100", "subagent_start", "reviewer-ui"),
    ev("04.000", "subagent_stop", "reviewer-ux"), ev("05.000", "subagent_stop", "reviewer-ui"),
  ]);
  const [ux, ui] = [l.lanes.find((x) => x.agent === "reviewer-ux")!, l.lanes.find((x) => x.agent === "reviewer-ui")!];
  assert.ok(ui.spans[0].start < ux.spans[0].end);
});

test("empty log gives no lanes", () => {
  assert.equal(buildLanes([]).lanes.length, 0);
});

import { handoffsAt, stateAt } from "../lib/agents.ts";

test("stateAt reports idle, active (with what it is doing) and done", () => {
  const events = [
    ev("00.000", "subagent_start", "planner"),
    { ...ev("01.000", "tool", "planner"), text: "Read spec.md" },
    ev("02.000", "subagent_stop", "planner"),
    ev("03.000", "subagent_start", "builder"),
    ev("04.000", "subagent_stop", "builder"),
  ];
  const view = buildLanes(events);
  const at = (s: number) => stateAt(view, events, Date.parse(`2026-01-01T00:00:0${s}.500Z`));
  assert.equal(at(1).get("planner")?.status, "active");
  assert.equal(at(1).get("planner")?.doing, "Read spec.md");
  assert.equal(at(1).get("builder")?.status, "idle");
  assert.equal(at(2).get("planner")?.status, "done");
  assert.equal(at(3).get("builder")?.status, "active");
});

test("handoffsAt only returns hand-offs inside the window", () => {
  const events = [ev("00.000", "subagent_start", "planner"), ev("02.000", "subagent_stop", "planner")];
  const view = buildLanes(events);
  const t0 = Date.parse("2026-01-01T00:00:00.000Z");
  assert.equal(handoffsAt(view, t0 + 300, 900).length, 1);
  assert.equal(handoffsAt(view, t0 + 1500, 900).length, 0);
});

test("an agent that never stopped and went quiet is treated as dead, not live", () => {
  const events = [ev("00.000", "subagent_start", "builder"), ev("03.000", "tool_done", "builder")];
  const l = buildLanes(events, Date.parse("2026-01-01T00:10:00.000Z"));
  assert.equal(l.lanes[0].spans[0].open, false);
  assert.equal(stateAt(l, events, Date.parse("2026-01-01T00:09:00.000Z")).get("builder")?.status, "done");
});

test("an agent whose session is no longer running is not live even while others keep logging", () => {
  const events = [
    { ...ev("00.000", "subagent_start", "builder"), sid: "dead" },
    { ...ev("02.000", "tool_done", "builder"), sid: "dead" },
    { ...ev("09.000", "tool_done", "orchestrator"), sid: "other" },
  ];
  const now = Date.parse("2026-01-01T00:00:10.000Z");
  assert.equal(buildLanes(events, now, new Set(["other"])).lanes.find((l) => l.agent === "builder")!.spans[0].open, false);
  assert.equal(buildLanes(events, now, new Set(["dead"])).lanes.find((l) => l.agent === "builder")!.spans[0].open, true);
  assert.equal(buildLanes(events, now, new Set()).lanes.find((l) => l.agent === "builder")!.spans[0].open, false);
});

test("handoffsAt returns one hand-off per agent even when it started many times", () => {
  const events = ["01", "02", "03"].flatMap((n) => [ev(`${n}.000`, "subagent_start", "builder"), ev(`${n}.200`, "subagent_stop", "builder")]);
  const view = buildLanes(events);
  const h = handoffsAt(view, Date.parse("2026-01-01T00:00:03.500Z"), 5000);
  assert.equal(h.length, 1);
  assert.ok(Math.abs(h[0].progress - 0.1) < 0.01);
});

import { jobStats } from "../lib/agents.ts";

test("jobStats sums agent time without the orchestrator and totals cost", () => {
  const events = [
    ev("00.000", "prompt", "orchestrator"), ev("09.000", "tool_done", "orchestrator"),
    ev("01.000", "subagent_start", "planner"), ev("03.000", "tool_done", "planner"), ev("05.000", "subagent_stop", "planner"),
    ev("05.000", "subagent_start", "builder"), ev("08.000", "subagent_stop", "builder"),
  ];
  const s = jobStats(buildLanes(events), { planner: { costUsd: 1.5 }, builder: { costUsd: 2 }, approver: { costUsd: 0.5 } });
  assert.equal(s.agentTime, 7000);
  assert.equal(s.elapsed, 9000);
  assert.equal(s.agents, 3);
  assert.equal(s.toolCalls, 2);
  assert.equal(s.costUsd, 4);
  assert.equal(s.perAgent.approver.ms, 0); // a cost with no activity still shows
});
