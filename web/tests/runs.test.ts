import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fl-runs-"));
process.env.FORGELINE_WEB_DATA = path.join(tmp, "data");
const repo = path.join(tmp, "repo");
fs.mkdirSync(path.join(repo, "factory", "jobs"), { recursive: true });

const runs = await import("../lib/runs.ts");
const runner = await import("../lib/runner.ts");

const deadPid = () => spawnSync(process.execPath, ["-e", ""]).pid!;
const meta = (runId: string, pid: number) =>
  runs.writeMeta({ runId, repo, prompt: "/factory x", key: null, pid, startedAt: new Date().toISOString(), before: [] });

const RESULT = JSON.stringify({ type: "result", session_id: "s1", total_cost_usd: 0.5, duration_ms: 10, num_turns: 1, usage: {} });

test("a finished run with a result is recorded once, as ok", () => {
  meta("a-1", deadPid());
  fs.writeFileSync(runs.eventLogPath("a-1"), RESULT + "\n");
  const first = runs.finalize("a-1");
  assert.equal(first?.ok, true);
  assert.equal(first?.costUsd, 0.5);
  runs.finalize("a-1");
  assert.equal(runs.loadRuns().filter((r) => r.runId === "a-1").length, 1);
});

test("a run whose process is gone without a result is lost", () => {
  meta("a-2", deadPid());
  fs.writeFileSync(runs.eventLogPath("a-2"), '{"type":"system","subtype":"init","session_id":"s2"}\n');
  const { status, record } = runs.statusOf(runs.readMeta("a-2")!);
  assert.equal(status, "lost");
  assert.equal(record?.ok, false);
});

test("a run whose process is alive is running and not finalized", () => {
  meta("a-3", process.pid);
  assert.equal(runs.statusOf(runs.readMeta("a-3")!).status, "running");
  assert.equal(runs.finalize("a-3"), null);
});

test("bad run ids are not read from disk", () => {
  assert.equal(runs.readMeta("../../etc/passwd"), null);
});

const script = (name: string, body: string) => {
  const file = path.join(tmp, name);
  fs.writeFileSync(file, `#!/bin/bash\n${body}\n`, { mode: 0o755 });
  return file;
};

async function drain(stream: ReadableStream<{ type: string }>) {
  const types: string[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return types;
    types.push(value.type);
  }
}

test("launch is detached and follow replays the log to the end", async () => {
  process.env.CLAUDE_BIN = script("ok.sh", `echo '{"type":"assistant","message":{"content":[{"type":"text","text":"hi"}]}}'; sleep 0.3; echo '${RESULT}'`);
  const id = runner.launchRun({ repo, text: "do a thing" });
  const types = await drain(runner.followRun(id));
  assert.ok(types.includes("text-delta") && types.includes("data-result"), types.join(","));
  assert.equal(runs.loadRuns().find((r) => r.runId === id)?.ok, true);
  // Following again after the end replays the same log.
  assert.ok((await drain(runner.followRun(id))).includes("data-result"));
});

test("a run killed mid-way ends the follow with an error and is recorded as lost", async () => {
  process.env.CLAUDE_BIN = script("kill.sh", `echo '{"type":"assistant","message":{"content":[{"type":"text","text":"partial"}]}}'; kill -9 $$`);
  const id = runner.launchRun({ repo, text: "crashy" });
  const types = await drain(runner.followRun(id));
  assert.ok(types.includes("error"), types.join(","));
  assert.equal(runs.loadRuns().find((r) => r.runId === id)?.lost, true);
});

test("a second run for the same job is refused while one is alive", async () => {
  process.env.CLAUDE_BIN = script("slow.sh", `sleep 3`);
  const id = runner.launchRun({ repo, text: "/factory approve 007-x" });
  assert.throws(() => runner.launchRun({ repo, text: "/factory rework 007-x again" }), /already has a run/);
  assert.equal(runner.stopRun(id), true);
  await drain(runner.followRun(id));
});
