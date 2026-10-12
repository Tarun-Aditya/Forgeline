import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { checkRepo } from "../lib/repocheck.ts";

const git = (cwd: string, ...a: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd, stdio: "pipe" });

function repo(setup?: (dir: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rc-"));
  git(dir, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(dir, "AGENTS.md"), "x");
  setup?.(dir);
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "i");
  return dir;
}
const codes = async (dir: string, self?: string) => (await checkRepo(dir, self ?? "/nonexistent")).map((w) => w.code);

test("a clean repo on main with a project doc has no warnings besides verify", async () => {
  const dir = repo((d) => { fs.mkdirSync(path.join(d, "factory")); fs.writeFileSync(path.join(d, "factory", "policy.json"), JSON.stringify({ merge_policy: { verify_commands: ["npm test"] } })); });
  assert.deepEqual(await codes(dir), []);
});

test("uncommitted changes, another branch and a missing doc are flagged", async () => {
  const dir = repo();
  git(dir, "checkout", "-qb", "feat/x");
  fs.writeFileSync(path.join(dir, "new.txt"), "x");
  fs.rmSync(path.join(dir, "AGENTS.md"));
  const c = await codes(dir);
  assert.ok(c.includes("dirty") && c.includes("branch") && c.includes("no-doc"), c.join());
});

test("the repo this app lives in is flagged as itself; a repo with no commits is flagged", async () => {
  const dir = repo();
  assert.ok((await codes(dir, dir)).includes("self"));
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "rc-"));
  git(empty, "init", "-q", "-b", "main");
  assert.deepEqual(await codes(empty), ["no-commits"]);
});

test("an empty verify list is noted", async () => {
  const dir = repo((d) => { fs.mkdirSync(path.join(d, "factory")); fs.writeFileSync(path.join(d, "factory", "policy.json"), JSON.stringify({ merge_policy: { verify_commands: [] } })); });
  assert.ok((await codes(dir)).includes("no-verify"));
});
