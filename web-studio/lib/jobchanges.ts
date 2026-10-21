// The code a job changed, for reading it in the job panel: which files, and each file before and after.
// Read-only git. The change is the job's branch while it exists, or its merge commit on the base branch afterwards.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const JOB_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_FILE = 400_000; // characters of one side of one file

export type ChangedFile = { path: string; status: "A" | "M" | "D"; added: number | null; deleted: number | null };
export type Commit = { hash: string; subject: string };
export type JobChanges = { source: "branch" | "merge" | "none"; base?: string; head?: string; files: ChangedFile[]; commits: Commit[] };
export type FileVersions = { path: string; status: ChangedFile["status"]; original: string; modified: string; binary: boolean; truncated: boolean };

async function git(repo: string, args: string[]): Promise<string | null> {
  try {
    return (await run("git", ["-C", repo, ...args], { timeout: 15000, maxBuffer: 20 * 1024 * 1024 })).stdout;
  } catch {
    return null;
  }
}

async function baseBranch(repo: string): Promise<string> {
  for (const b of ["main", "master"]) {
    if ((await git(repo, ["rev-parse", "--verify", "-q", `refs/heads/${b}`]))?.trim()) return b;
  }
  return "HEAD";
}

async function changeRange(repo: string, id: string): Promise<{ from: string; to: string; source: "branch" | "merge" } | null> {
  if (!JOB_ID.test(id)) throw new Error("Bad job id.");
  const main = await baseBranch(repo);
  const branch = `factory/${id}`;
  const tip = (await git(repo, ["rev-parse", "--verify", "-q", `refs/heads/${branch}`]))?.trim();
  if (tip) {
    const from = (await git(repo, ["merge-base", main, branch]))?.trim();
    // A branch whose tip is already the merge base has nothing new: it was merged, look for the merge commit.
    if (from && from !== tip) return { from, to: branch, source: "branch" };
  }
  const merge = (await git(repo, ["log", "--merges", "--first-parent", main, "--fixed-strings", `--grep=Merge ${branch}`, "-n1", "--format=%H"]))?.trim();
  return merge ? { from: `${merge}^1`, to: merge, source: "merge" } : null;
}

export async function jobChanges(repo: string, id: string): Promise<JobChanges> {
  const range = await changeRange(repo, id);
  if (!range) return { source: "none", files: [], commits: [] };
  const { from, to, source } = range;
  const status = new Map<string, ChangedFile["status"]>();
  for (const line of ((await git(repo, ["diff", "--name-status", "--no-renames", from, to])) ?? "").split("\n").filter(Boolean)) {
    const [s, ...p] = line.split("\t");
    status.set(p.join("\t"), s === "A" ? "A" : s === "D" ? "D" : "M");
  }
  const files: ChangedFile[] = [];
  for (const line of ((await git(repo, ["diff", "--numstat", "--no-renames", from, to])) ?? "").split("\n").filter(Boolean)) {
    const [a, d, ...p] = line.split("\t");
    const path = p.join("\t");
    files.push({ path, status: status.get(path) ?? "M", added: a === "-" ? null : Number(a), deleted: d === "-" ? null : Number(d) });
  }
  const commits: Commit[] = ((await git(repo, ["log", "--reverse", "-n", "60", "--format=%h%x09%s", `${from}..${to}`])) ?? "")
    .split("\n").filter(Boolean).map((l) => {
      const [hash, ...s] = l.split("\t");
      return { hash, subject: s.join("\t") };
    });
  return { source, base: from, head: to, files, commits };
}

/** Both sides of one changed file. Only files in the job's change can be asked for. */
export async function jobFile(repo: string, id: string, file: string): Promise<FileVersions> {
  const range = await changeRange(repo, id);
  const changes = range ? await jobChanges(repo, id) : null;
  const entry = changes?.files.find((f) => f.path === file);
  if (!range || !entry) throw new Error("That file is not part of this job's change.");
  const side = async (ref: string, present: boolean) => (present ? ((await git(repo, ["show", `${ref}:${file}`])) ?? "") : "");
  let original = await side(range.from, entry.status !== "A");
  let modified = await side(range.to, entry.status !== "D");
  const binary = original.includes("\0") || modified.includes("\0");
  const truncated = original.length > MAX_FILE || modified.length > MAX_FILE;
  if (binary) { original = ""; modified = ""; }
  return { path: file, status: entry.status, original: original.slice(0, MAX_FILE), modified: modified.slice(0, MAX_FILE), binary, truncated };
}
