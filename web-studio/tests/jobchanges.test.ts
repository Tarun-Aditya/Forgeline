import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { jobChanges, jobFile } from "../lib/jobchanges.ts";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fl-changes-"));
const repo = path.join(tmp, "repo");
const git = (...a: string[]) => execFileSync("git", ["-C", repo, ...a], { encoding: "utf8" });
const write = (f: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(repo, f)), { recursive: true });
  fs.writeFileSync(path.join(repo, f), text);
};

fs.mkdirSync(repo);
git("init", "-q", "-b", "main");
git("config", "user.email", "t@example.com");
git("config", "user.name", "t");
write("server/store.ts", "export const a = 1\n");
write("web/App.tsx", "export const App = 1\n");
write("old.txt", "going away\n");
write("secret.txt", "not part of any job\n");
git("add", "-A");
git("commit", "-qm", "base");

git("checkout", "-q", "-b", "factory/001-demo");
write("server/store.ts", "export const a = 1\nexport const b = 2\n");
git("commit", "-qam", "Server: add b");
write("web/App.tsx", "export const App = 2\n");
write("web/New.tsx", "export const New = 1\n");
fs.rmSync(path.join(repo, "old.txt"));
git("add", "-A");
git("commit", "-qm", "Web: use b");
git("checkout", "-q", "main");

test("a job's branch lists changed files with status, line counts and commits", async () => {
  const c = await jobChanges(repo, "001-demo");
  assert.equal(c.source, "branch");
  const by = Object.fromEntries(c.files.map((f) => [f.path, f]));
  assert.deepEqual(Object.keys(by).sort(), ["old.txt", "server/store.ts", "web/App.tsx", "web/New.tsx"]);
  assert.deepEqual([by["server/store.ts"].status, by["server/store.ts"].added, by["server/store.ts"].deleted], ["M", 1, 0]);
  assert.equal(by["web/New.tsx"].status, "A");
  assert.equal(by["old.txt"].status, "D");
  assert.deepEqual(c.commits.map((x) => x.subject), ["Server: add b", "Web: use b"]);
});

test("a file comes back as before and after; added and deleted files have an empty side", async () => {
  const m = await jobFile(repo, "001-demo", "server/store.ts");
  assert.equal(m.original, "export const a = 1\n");
  assert.equal(m.modified, "export const a = 1\nexport const b = 2\n");
  const added = await jobFile(repo, "001-demo", "web/New.tsx");
  assert.deepEqual([added.original, added.modified], ["", "export const New = 1\n"]);
  const gone = await jobFile(repo, "001-demo", "old.txt");
  assert.deepEqual([gone.original, gone.modified], ["going away\n", ""]);
});

test("only files in the job's change can be read, and the job id is checked", async () => {
  await assert.rejects(() => jobFile(repo, "001-demo", "secret.txt"), /not part of this job/);
  await assert.rejects(() => jobFile(repo, "001-demo", "../../etc/passwd"), /not part of this job/);
  await assert.rejects(() => jobChanges(repo, "../x"), /Bad job id/);
});

test("after the merge, with the branch deleted, the merge commit holds the change", async () => {
  git("merge", "--no-ff", "-q", "-m", "Merge factory/001-demo", "factory/001-demo");
  git("branch", "-q", "-D", "factory/001-demo");
  const c = await jobChanges(repo, "001-demo");
  assert.equal(c.source, "merge");
  assert.equal(c.files.length, 4);
  const f = await jobFile(repo, "001-demo", "web/App.tsx");
  assert.deepEqual([f.original, f.modified], ["export const App = 1\n", "export const App = 2\n"]);
});

test("a job with no branch and no merge has no changes", async () => {
  const c = await jobChanges(repo, "002-none");
  assert.deepEqual(c, { source: "none", files: [], commits: [] });
});
