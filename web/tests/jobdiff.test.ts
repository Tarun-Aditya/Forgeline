import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { jobDiff, validationSection } from "../lib/jobdiff.ts";

const git = (cwd: string, ...a: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd, stdio: "pipe" }).toString();
const write = (d: string, f: string, t: string) => fs.writeFileSync(path.join(d, f), t);

test("diffs an open job branch, then the merge commit once the branch is gone", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jd-"));
  git(dir, "init", "-q", "-b", "main");
  write(dir, "a.txt", "one\n");
  git(dir, "add", "-A"); git(dir, "commit", "-qm", "init");
  git(dir, "checkout", "-qb", "factory/001-x");
  write(dir, "a.txt", "one\ntwo\n"); write(dir, "b.txt", "new\n");
  git(dir, "add", "-A"); git(dir, "commit", "-qm", "change");
  git(dir, "checkout", "-q", "main");

  const open = await jobDiff(dir, "001-x");
  assert.equal(open.source, "branch");
  assert.deepEqual(open.files.map((f) => [f.file, f.added, f.deleted]).sort(), [["a.txt", 1, 0], ["b.txt", 1, 0]]);
  assert.match(open.patch, /\+two/);

  git(dir, "merge", "--no-ff", "-qm", "Merge factory/001-x", "factory/001-x");
  git(dir, "branch", "-qD", "factory/001-x");
  const merged = await jobDiff(dir, "001-x");
  assert.equal(merged.source, "merge");
  assert.equal(merged.files.length, 2);

  assert.deepEqual(await jobDiff(dir, "009-none"), { source: "none", files: [], patch: "", truncated: false });
  await assert.rejects(jobDiff(dir, "../etc"));
});

test("validationSection returns the Validation block only", () => {
  const md = "# B\n\n## Summary\nx\n\n## Validation\n- `npm test`: 40 pass\n- `tsc`: ok\n\n## Definition of done\n- y\n";
  assert.equal(validationSection(md), "- `npm test`: 40 pass\n- `tsc`: ok");
  assert.equal(validationSection("# no sections"), "");
});
