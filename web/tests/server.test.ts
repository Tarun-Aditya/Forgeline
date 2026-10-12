import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { refuse } from "../lib/guard.ts";
import { listJobFiles, readJobFile } from "../lib/jobs.ts";
import { buildPrompt, jobKey } from "../lib/runner.ts";
import { summarize } from "../lib/metrics.ts";

test("guard: only localhost, and writes need a same-origin Origin", () => {
  assert.equal(refuse("GET", "localhost:3000", null), null);
  assert.ok(refuse("GET", "evil.com", null));
  assert.ok(refuse("POST", "localhost:3000", null));
  assert.ok(refuse("POST", "localhost:3000", "https://evil.com"));
  assert.equal(refuse("POST", "localhost:3000", "http://localhost:3000"), null);
});

test("buildPrompt: plain text becomes a job, /factory passes through", () => {
  assert.equal(buildPrompt({ text: "fix login" }), "/factory fix login");
  assert.equal(buildPrompt({ text: "fix login", type: "bugfix", ticket: "AB-12" }), "/factory fix login --type bugfix --ticket AB-12");
  assert.equal(buildPrompt({ text: "PROJ-42" }), "/factory PROJ-42 --ticket PROJ-42");
  assert.equal(buildPrompt({ text: "/factory approve 003-x" }), "/factory approve 003-x");
  assert.throws(() => buildPrompt({ text: "x", ticket: "bad key" }));
  assert.throws(() => buildPrompt({ text: "  " }));
});

test("jobKey finds the job a command acts on", () => {
  assert.equal(jobKey("/factory approve 003-x"), "003-x");
  assert.equal(jobKey("/factory respec 003-x make it smaller"), "003-x");
  assert.equal(jobKey("/factory add a button"), null);
});

test("job files: listing and traversal guard", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "fl-"));
  const dir = path.join(repo, "factory/jobs/001-a");
  fs.mkdirSync(path.join(dir, "round-1"), { recursive: true });
  fs.writeFileSync(path.join(dir, "spec.md"), "S");
  fs.writeFileSync(path.join(dir, "round-1/review-code.md"), "R");
  fs.writeFileSync(path.join(repo, "secret.md"), "NO");
  assert.deepEqual(listJobFiles(repo, "001-a"), ["round-1/review-code.md", "spec.md"]);
  assert.equal(readJobFile(repo, "001-a", "spec.md"), "S");
  assert.equal(readJobFile(repo, "001-a", "../../../secret.md"), null);
  assert.equal(readJobFile(repo, "../x", "spec.md"), null);
});

test("summarize totals cost and tokens by model, day and job", () => {
  const base = { repo: "r", prompt: "p", endedAt: "", ok: true };
  const s = summarize([
    { ...base, runId: "1", jobIds: ["001"], startedAt: "2026-10-12T01:00:00Z", costUsd: 1, usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 }, models: { m: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, costUsd: 1 } } },
    { ...base, runId: "2", jobIds: ["001"], startedAt: "2026-10-12T02:00:00Z", costUsd: 2, ok: false },
  ]);
  assert.equal(s.total.costUsd, 3);
  assert.equal(s.failed, 1);
  assert.equal(s.byJob["001"].runs, 2);
  assert.equal(s.byModel.m.output, 2);
  assert.equal(s.byDay["2026-10-12"].runs, 2);
});
