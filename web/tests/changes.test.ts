import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { watchRepo, type Topic } from "../lib/changes.ts";

test("writes under factory/jobs and factory/activity are reported as topics, debounced", async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "ch-"));
  const seen: Topic[] = [];
  const stop = watchRepo(repo, (t) => seen.push(t), 40);
  await new Promise((r) => setTimeout(r, 100));
  fs.mkdirSync(path.join(repo, "factory", "jobs", "001-x"), { recursive: true });
  for (let i = 0; i < 5; i++) fs.writeFileSync(path.join(repo, "factory", "jobs", "001-x", "job.json"), String(i));
  fs.writeFileSync(path.join(repo, "factory", "activity", "s.jsonl"), "{}");
  await new Promise((r) => setTimeout(r, 400));
  stop();
  assert.ok(seen.includes("jobs"), seen.join());
  assert.ok(seen.includes("activity"), seen.join());
  assert.ok(seen.filter((t) => t === "jobs").length <= 2, "a burst of writes is one or two events, not five");
});
