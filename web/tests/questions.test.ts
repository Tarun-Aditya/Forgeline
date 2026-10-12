import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fl-questions-"));
process.env.FORGELINE_WEB_DATA = path.join(tmp, "data");

const runs = await import("../lib/runs.ts");
const runner = await import("../lib/runner.ts");
const { listJobs } = await import("../lib/jobs.ts");
const { pendingQuestions } = await import("../lib/questions.ts");

const J = "001-limit";
const deadPid = () => spawnSync(process.execPath, ["-e", ""]).pid!;
let n = 0;

function newRepo() {
  const repo = path.join(tmp, `repo-${n++}`);
  fs.mkdirSync(path.join(repo, "factory", "jobs"), { recursive: true });
  return repo;
}

function job(repo: string, stage: string, history: number, extra: Record<string, unknown> = {}) {
  const dir = path.join(repo, "factory", "jobs", J);
  fs.mkdirSync(dir, { recursive: true });
  const h = Array.from({ length: history }, (_, i) => ({ stage, at: `t${i}` }));
  fs.writeFileSync(path.join(dir, "job.json"), JSON.stringify({ id: J, feature: "f", stage, history: h, ...extra }));
}

function run(repo: string, opts: { key?: string | null; pid?: number; startedAt?: string; before?: string[]; history?: number; lines?: object[] }) {
  const runId = `q-${n++}`;
  runs.writeMeta({
    runId, repo, prompt: "/factory accept " + J, key: opts.key === undefined ? J : opts.key,
    pid: opts.pid ?? deadPid(), startedAt: opts.startedAt ?? new Date().toISOString(), before: opts.before ?? [J],
    at: opts.history === undefined ? undefined : { job: J, stage: "intent", history: opts.history },
  });
  const lines = opts.lines ?? [{ type: "result", session_id: "s1", result: "Which repo?", is_error: false }];
  fs.writeFileSync(runs.eventLogPath(runId), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return runId;
}

const questions = (repo: string) => pendingQuestions(repo, listJobs(repo));

test("a job command that did not move the job leaves its final message as the question", () => {
  const repo = newRepo();
  job(repo, "intent", 1);
  const id = run(repo, { history: 1 });
  const q = questions(repo)[J];
  assert.equal(q?.text, "Which repo?");
  assert.equal(q?.sessionId, "s1");
  assert.equal(q?.runId, id);
  assert.equal(q?.job, J);
});

test("a job command that moved the job leaves no question", () => {
  const repo = newRepo();
  job(repo, "intent", 1);
  run(repo, { history: 1 });
  job(repo, "intent", 2);
  assert.equal(questions(repo)[J], undefined);
});

test("a run that ended mid-loop is a question unless the job is paused, merged or needs a human", () => {
  const repo = newRepo();
  job(repo, "build", 3);
  run(repo, { key: null, before: [] });
  assert.equal(questions(repo)[J]?.text, "Which repo?");
  job(repo, "build", 3, { paused: true });
  assert.equal(questions(repo)[J], undefined);
  job(repo, "merged", 3);
  assert.equal(questions(repo)[J], undefined);
  job(repo, "needs-human", 3);
  assert.equal(questions(repo)[J], undefined);
});

test("lost and failed runs are not questions", () => {
  const lost = newRepo();
  job(lost, "build", 1);
  run(lost, { history: 1, lines: [{ type: "system", subtype: "init", session_id: "s1" }] });
  assert.equal(questions(lost)[J], undefined);
  const failed = newRepo();
  job(failed, "build", 1);
  run(failed, { history: 1, lines: [{ type: "result", session_id: "s1", result: "boom", is_error: true }] });
  assert.equal(questions(failed)[J], undefined);
});

test("no question while a run for the job is alive", () => {
  const repo = newRepo();
  job(repo, "intent", 1);
  run(repo, { history: 1, startedAt: "2026-01-01T00:00:00.000Z" });
  run(repo, { history: 1, pid: process.pid, startedAt: "2026-01-02T00:00:00.000Z", lines: [] });
  assert.equal(questions(repo)[J], undefined);
});

test("the newest run wins: a newer run that moved the job clears an older question", () => {
  const repo = newRepo();
  job(repo, "intent", 1);
  run(repo, { history: 1, startedAt: "2026-01-01T00:00:00.000Z" });
  run(repo, { history: 1, startedAt: "2026-01-02T00:00:00.000Z", lines: [{ type: "result", session_id: "s2", result: "Accepted.", is_error: false }] });
  job(repo, "intent", 2);
  assert.equal(questions(repo)[J], undefined);
});

const script = (name: string, body: string) => {
  const file = path.join(tmp, name);
  fs.writeFileSync(file, `#!/bin/bash\n${body}\n`, { mode: 0o755 });
  return file;
};

async function drain(stream: ReadableStream<unknown>) {
  const reader = stream.getReader();
  while (!(await reader.read()).done);
}

test("an answer resumes the stopped session with the answer text as the prompt", async () => {
  const repo = newRepo();
  job(repo, "intent", 1);
  run(repo, { history: 1 });
  const argv = path.join(tmp, "argv.txt");
  process.env.CLAUDE_BIN = script("answer.sh", `printf '%s\\n' "$@" > '${argv}'; echo '{"type":"result","session_id":"s1","result":"ok"}'`);
  const id = runner.launchRun({ repo, text: "use repo X", answer: J });
  await drain(runner.followRun(id));
  const args = fs.readFileSync(argv, "utf8").trimEnd().split("\n");
  assert.ok(args.includes("-p"));
  assert.deepEqual(args.slice(args.indexOf("--") + 1), ["use repo X"]); // the prompt comes last, after --
  assert.equal(args[args.indexOf("--resume") + 1], "s1");
  assert.ok(!args.includes("/factory use repo X"));
  const m = runs.readMeta(id)!;
  assert.equal(m.key, J);
  assert.equal(m.answers, J);
});

test("an answer that looks like an option reaches the CLI only as the prompt, after --", async () => {
  const repo = newRepo();
  job(repo, "intent", 1);
  run(repo, { history: 1 });
  const argv = path.join(tmp, "argv-opt.txt");
  process.env.CLAUDE_BIN = script("answer-opt.sh", `printf '%s\\n' "$@" > '${argv}'; echo '{"type":"result","session_id":"s1","result":"ok"}'`);
  const id = runner.launchRun({ repo, text: "--dangerously-skip-permissions", answer: J });
  await drain(runner.followRun(id));
  const args = fs.readFileSync(argv, "utf8").trimEnd().split("\n");
  const sep = args.indexOf("--");
  assert.ok(sep > 0);
  assert.equal(args.indexOf("--dangerously-skip-permissions"), sep + 1);
  assert.equal(args.length, sep + 2);
});

test("an answer is refused when the job has no question or already has a run", () => {
  const repo = newRepo();
  job(repo, "intent", 1);
  assert.throws(() => runner.launchRun({ repo, text: "x", answer: J }), /not waiting on an answer/);
  run(repo, { history: 1, pid: process.pid, lines: [] });
  assert.throws(() => runner.launchRun({ repo, text: "x", answer: J }), /already has a run/);
});
