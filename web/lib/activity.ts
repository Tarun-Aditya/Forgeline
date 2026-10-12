// The activity log is written by hooks in every Claude Code surface and read here through
// the same script a terminal uses, so there is one definition of "running" and "stalled".
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export type ActivityEvent = {
  ts: string; sid: string; ev: string; agent: string; tool: string; text: string; job: string | null; ms?: number;
};
export type SessionState = {
  session: string; state: "running" | "idle" | "ended" | "stalled" | "crashed"; job: string | null; agent: string;
  last: string; last_ts: string; age_seconds: number; events: number;
};

async function script(repo: string, args: string[]): Promise<string> {
  const file = path.join(repo, "factory", "scripts", "activity.py");
  const { stdout } = await run("python3", ["-I", file, "--project", repo, ...args], { timeout: 10000 });
  return stdout;
}

export async function feed(repo: string, job?: string | null, last = 150): Promise<ActivityEvent[]> {
  if (job && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(job)) throw new Error("Bad job id.");
  const out = await script(repo, ["feed", "--json", "-n", String(last), ...(job ? ["--job", job] : [])]);
  return out.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

export async function status(repo: string): Promise<SessionState[]> {
  return JSON.parse(await script(repo, ["status", "--json"]));
}
