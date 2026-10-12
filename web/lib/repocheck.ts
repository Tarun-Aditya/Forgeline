// Things worth knowing before a task is sent to a repo. None of them block; they explain the stuck jobs we have seen.
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export type Warning = { level: "warn" | "info"; code: string; text: string };

async function git(repo: string, args: string[]): Promise<string | null> {
  try {
    return (await run("git", ["-C", repo, ...args], { timeout: 8000 })).stdout.trim();
  } catch {
    return null;
  }
}

export async function checkRepo(repo: string, selfDir = path.resolve(process.cwd(), "..")): Promise<Warning[]> {
  const out: Warning[] = [];
  const head = await git(repo, ["rev-parse", "--verify", "HEAD"]);
  if (head === null) return [{ level: "warn", code: "no-commits", text: "This repo has no commits yet. Jobs branch from main, so commit once first." }];

  const status = await git(repo, ["status", "--porcelain"]);
  const dirty = status ? status.split("\n").filter(Boolean).length : 0;
  if (dirty > 0)
    out.push({ level: "warn", code: "dirty", text: `${dirty} uncommitted change${dirty === 1 ? "" : "s"} in the main checkout. A job can build, but the merge gate refuses to merge until they are committed or stashed.` });

  const branch = await git(repo, ["branch", "--show-current"]);
  if (branch && branch !== "main")
    out.push({ level: "warn", code: "branch", text: `The checkout is on "${branch}", not main. Jobs branch from main and merge into it, so they will not see this branch's work.` });

  let self = false;
  try {
    self = fs.realpathSync(repo) === fs.realpathSync(selfDir);
  } catch { /* the repo path is gone; the git checks above already failed */ }
  if (self) out.push({ level: "info", code: "self", text: "This is the Forgeline repo itself, so a task here changes the factory and this app." });

  if (!["AGENTS.md", "CLAUDE.md"].some((f) => fs.existsSync(path.join(repo, f))))
    out.push({ level: "warn", code: "no-doc", text: "No AGENTS.md or CLAUDE.md. The agents carry nothing repo-specific, so they will guess how to build and test." });

  try {
    const policy = JSON.parse(fs.readFileSync(path.join(repo, "factory", "policy.json"), "utf8"));
    if (!policy.merge_policy?.verify_commands?.length)
      out.push({ level: "info", code: "no-verify", text: "No verify commands in factory/policy.json, so nothing runs your build and tests on a job before it merges." });
  } catch { /* not a factory repo; the repo list already marks it */ }
  return out;
}
