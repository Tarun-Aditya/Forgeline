import assert from "node:assert/strict";
import { test } from "node:test";
import { describeAction, isRetry, retryNote } from "../lib/tools.ts";

test("describeAction gives plain text for common tools", () => {
  assert.equal(describeAction("Edit", "/a/b/web/index.js"), "Editing index.js");
  assert.equal(describeAction("Read", "factory/jobs/001/spec.md"), "Reading spec.md");
  assert.equal(describeAction("Bash", "cd web && npm test 2>&1 | tail"), "Running tests");
  assert.equal(describeAction("Bash", "npx tsc --noEmit"), "Type-checking");
  assert.equal(describeAction("Bash", "git worktree add -b factory/001 ../x main"), "Setting up a worktree");
  assert.equal(describeAction("Bash", "python3 -I factory/scripts/jobctl.py set 001 --stage build"), "Updating job state");
  assert.equal(describeAction("Grep", "foo"), "Searching the code");
  assert.equal(describeAction("Bash", "somecmd --flag"), "Running somecmd");
});

test("isRetry only matches errors the agent recovers from", () => {
  assert.equal(isRetry("<tool_use_error>File has not been read yet. Read it first</tool_use_error>"), true);
  assert.equal(isRetry("Exit code 1\nboom"), false);
  assert.equal(isRetry(undefined), false);
  assert.match(retryNote("<tool_use_error>File has not been read yet.</tool_use_error>"), /read the file first/);
});
