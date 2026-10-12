// Sessions as the hook-written activity log records them (factory/activity/<sid>.jsonl and <sid>.job), read directly so it is
// synchronous. The same files `activity.py` reads for the Activity tab.
import fs from "node:fs";
import path from "node:path";

export type LoggedSession = { sid: string; job: string | null; lastTs: string | null; lastEv: string | null; ended: boolean };

function tailLine(file: string): string {
  try {
    const fd = fs.openSync(file, "r");
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, 8192);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    fs.closeSync(fd);
    return buf.toString("utf8").trimEnd().split("\n").at(-1) ?? "";
  } catch {
    return "";
  }
}

export function loggedSessions(repo: string): LoggedSession[] {
  const dir = path.join(repo, "factory", "activity");
  let names: string[] = [];
  try { names = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")); } catch { return []; }
  return names.map((f) => {
    const sid = f.replace(/\.jsonl$/, "");
    let job: string | null = null;
    try { job = fs.readFileSync(path.join(dir, `${sid}.job`), "utf8").trim() || null; } catch { /* no job yet */ }
    let last: { ts?: string; ev?: string } = {};
    try { last = JSON.parse(tailLine(path.join(dir, f))); } catch { /* an empty or partly written file */ }
    return { sid, job, lastTs: last.ts ?? null, lastEv: last.ev ?? null, ended: last.ev === "session_end" };
  });
}
