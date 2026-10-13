// Run bookkeeping. A run is a detached `claude -p` process whose output goes straight to
// <data>/runs/<id>.jsonl, so the web server can crash or restart without touching it.
// <id>.meta.json says who started it; runs.jsonl holds one summary per finished run.
import fs from "node:fs";
import path from "node:path";
import { listJobs } from "./jobs.ts";
import { DATA_DIR, ensureDir } from "./paths.ts";
import { EventMapper, LineParser, type RunResult } from "./stream.ts";

export type RunMeta = {
  runId: string;
  repo: string;
  prompt: string;
  key: string | null;
  pid: number;
  startedAt: string;
  before: string[];
  mcpFile?: string;
};

export type RunStatus = "running" | "ok" | "failed" | "lost";

export type RunRecord = {
  runId: string;
  repo: string;
  prompt: string;
  jobIds: string[];
  startedAt: string;
  endedAt: string;
  ok: boolean;
  lost?: boolean;
} & Partial<RunResult>;

const dir = () => ensureDir(path.join(DATA_DIR, "runs"));
const SUMMARY = () => path.join(DATA_DIR, "runs.jsonl");

export const eventLogPath = (id: string) => path.join(dir(), `${id}.jsonl`);
export const errLogPath = (id: string) => path.join(dir(), `${id}.err`);
const metaPath = (id: string) => path.join(dir(), `${id}.meta.json`);

export function writeMeta(meta: RunMeta) {
  fs.writeFileSync(metaPath(meta.runId), JSON.stringify(meta));
}

export function readMeta(id: string): RunMeta | null {
  if (!/^[a-z0-9-]+$/.test(id)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath(id), "utf8"));
  } catch {
    return null;
  }
}

export function listMeta(): RunMeta[] {
  return fs
    .readdirSync(dir())
    .filter((f) => f.endsWith(".meta.json"))
    .flatMap((f) => readMeta(f.replace(".meta.json", "")) ?? [])
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function loadRuns(): RunRecord[] {
  try {
    return fs
      .readFileSync(SUMMARY(), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

export function saveRun(rec: RunRecord) {
  ensureDir(DATA_DIR);
  fs.appendFileSync(SUMMARY(), JSON.stringify(rec) + "\n");
}

/** Read what a run printed so far. */
export function parseLog(id: string) {
  const mapper = new EventMapper();
  const parser = new LineParser();
  let text = "";
  try {
    text = fs.readFileSync(eventLogPath(id), "utf8");
  } catch {
    /* no output yet */
  }
  for (const ev of [...parser.push(text), ...parser.end()]) mapper.feed(ev);
  return mapper;
}

export const errorTail = (id: string) => {
  try {
    return fs.readFileSync(errLogPath(id), "utf8").slice(-4000).trim();
  } catch {
    return "";
  }
};

/** Write the summary of a run that has ended. Safe to call again; it only writes once.
 *  A process that is gone without a result event is recorded as lost (killed or crashed). */
export function finalize(id: string): RunRecord | null {
  const existing = loadRuns().find((r) => r.runId === id);
  if (existing) return existing;
  const meta = readMeta(id);
  if (!meta || alive(meta.pid)) return null;
  const { result } = parseLog(id);
  const created = listJobs(meta.repo).map((j) => j.id).filter((j) => !meta.before.includes(j));
  const rec: RunRecord = {
    runId: id,
    repo: meta.repo,
    prompt: meta.prompt,
    jobIds: meta.key ? [meta.key, ...created] : created,
    startedAt: meta.startedAt,
    endedAt: new Date().toISOString(),
    ok: !!result && !result.isError,
    lost: !result,
    ...result,
  };
  saveRun(rec);
  if (meta.mcpFile) fs.rmSync(meta.mcpFile, { force: true });
  return rec;
}

export function statusOf(meta: RunMeta): { status: RunStatus; record: RunRecord | null } {
  if (alive(meta.pid)) return { status: "running", record: null };
  const record = finalize(meta.runId);
  return { status: !record ? "lost" : record.lost ? "lost" : record.ok ? "ok" : "failed", record };
}

/** Settle every run whose process has ended, e.g. after the web server was down. */
export function reconcile() {
  for (const meta of listMeta()) statusOf(meta);
}
