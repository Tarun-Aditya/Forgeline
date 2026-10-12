import assert from "node:assert/strict";
import { test } from "node:test";
import { computeHandoffs } from "../lib/handoffs.ts";

const spec = "# S\n\n## Requirements\n1. a\n2. b\n\n## Acceptance criteria\n1. one\n2. two\n3. three\n\n## Out of scope\n- x\n";

test("counts criteria, steps and checked boxes from the job files", () => {
  const h = computeHandoffs({
    text: {
      "intent.md": "## Success criteria\n- a\n- b\n\n## Assumptions\n- c\n",
      "spec.md": spec,
      "plan.md": "## Approach\ntext\n\n## Steps\n1. x\n2. y\n3. z\n4. w\n\n## Proof\n- p\n",
      "build.md": "## Summary\n\n## Acceptance criteria\n1. [x] a\n2. [x] b\n3. [ ] c\n",
      "decision.md": "ESCALATE\n\n## Why\n",
    },
    round: 2,
    verdicts: { security: "PASS", code: "CHANGES" },
  });
  assert.equal(h["intent-writer>spec-writer"], "intent: 2 success criteria");
  assert.equal(h["spec-writer>planner"], "spec: 3 acceptance criteria");
  assert.equal(h["planner>builder"], "plan: 4 steps");
  assert.equal(h["builder>reviewers"], "round 2 · 2/3 criteria checked");
  assert.equal(h["reviewer-security>approver"], "PASS");
  assert.equal(h["reviewer-code>approver"], "CHANGES");
  assert.equal(h["reviewer-ux>approver"], undefined);
  assert.equal(h["approver"], "sent to a person");
});

test("falls back to requirements and gives nothing for a job with no files", () => {
  assert.equal(computeHandoffs({ text: { "spec.md": "## Requirements\n1. a\n" }, round: 0, verdicts: {} })["spec-writer>planner"], "spec: 1 requirement");
  assert.deepEqual(computeHandoffs({ text: {}, round: 0, verdicts: {} }), {});
});
