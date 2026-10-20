import assert from "node:assert/strict";
import { test } from "node:test";
import { newAttention } from "../lib/attention.ts";
import type { Job } from "../lib/jobs.ts";

const job = (id: string, stage: string) => ({ id, stage, feature: "", type: "feature", branch: "", round: 0, reviews: {} }) as Job;

test("the first look is quiet; a job reaching a human stage is reported once", () => {
  const none = new Map<string, string>();
  const first = newAttention(null, [job("001-add-x", "spec-approval")], none, new Set());
  assert.deepEqual(first.events, []);

  const same = newAttention(first.next, [job("001-add-x", "spec-approval")], none, new Set());
  assert.deepEqual(same.events, []);

  const moved = newAttention(same.next, [job("001-add-x", "build"), job("002-other-thing", "needs-human")], none, new Set());
  assert.equal(moved.events.length, 1);
  assert.equal(moved.events[0].title, "Needs your call");
  assert.equal(moved.events[0].body, "002 · other thing");
});

test("trouble and questions are reported, and trouble wins over the stage", () => {
  const prev = newAttention(null, [job("001-a", "build")], new Map(), new Set()).next;
  const r = newAttention(prev, [job("001-a", "build")], new Map([["001-a", "stalled"]]), new Set(["001-a"]));
  assert.deepEqual(r.events.map((e) => e.title), ["A job stalled"]);
  const q = newAttention(prev, [job("001-a", "build")], new Map(), new Set(["001-a"]));
  assert.deepEqual(q.events.map((e) => e.title), ["An agent has a question"]);
});
