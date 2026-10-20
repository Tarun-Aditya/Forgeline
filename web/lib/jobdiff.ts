// The code change behind a job, for reviewing it without leaving the app. Read-only git.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const JOB_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_PATCH = 400_000;

export type FileStat = { file: string; added: number | null; deleted: number | null };
export type JobDiff = { source: "branch" | "merge" | "none"; base?: string; head?: string; files: FileStat[]; patch: string; truncated: boolean };

async function git(repo: string, args: string[]): Promise<string | null> {
  try {
    return (await run("git", ["-C", repo, ...args], { timeout: 15000, maxBuffer: 20 * 1024 * 1024 })).stdout;
  } catch {
    return null;
  }
}

export async function jobDiff(repo: string, id: string, main = "main"): Promise<JobDiff> {
  if (!JOB_ID.test(id)) throw new Error("Bad job id.");
  const branch = `factory/${id}`;
  let from: string | null = null;
  let to: string | null = null;
  let source: JobDiff["source"] = "none";

  if ((await git(repo, ["rev-parse", "--verify", "-q", `refs/heads/${branch}`]))?.trim()) {
    from = (await git(repo, ["merge-base", main, branch]))?.trim() || null;
    to = branch;
    source = "branch";
  }
  if (!from || !to || from === (await git(repo, ["rev-parse", branch]))?.trim()) {
    // The branch is gone or has nothing new: the merge commit on main holds the change.
    const merge = (await git(repo, ["log", "--merges", "--first-parent", main, "--fixed-strings", `--grep=Merge ${branch}`, "-n1", "--format=%H"]))?.trim();
    if (merge) { from = `${merge}^1`; to = merge; source = "merge"; }
    else if (!from || !to) return { source: "none", files: [], patch: "", truncated: false };
  }
  const range = [from!, to!];
  const stat = (await git(repo, ["diff", "--numstat", ...range])) ?? "";
  const files: FileStat[] = stat.split("\n").filter(Boolean).map((l) => {
    const [a, d, ...f] = l.split("\t");
    return { file: f.join("\t"), added: a === "-" ? null : Number(a), deleted: d === "-" ? null : Number(d) };
  });
  let patch = (await git(repo, ["diff", "--no-color", "-U3", ...range])) ?? "";
  const truncated = patch.length > MAX_PATCH;
  if (truncated) patch = patch.slice(0, MAX_PATCH);
  return { source, base: from!, head: to!, files, patch, truncated };
}

/** The `## Validation` section of build.md: the commands the builder ran and what they printed. */
export function validationSection(buildMd: string | null): string {
  if (!buildMd) return "";
  const m = /^## Validation\s*\n([\s\S]*?)(?=^## |\s*$(?![\s\S]))/m.exec(buildMd);
  return m ? m[1].trim() : "";
}
