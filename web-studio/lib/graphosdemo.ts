// Starts and stops the Lumen Books demo API (demo/graphos/server.py) so the GraphOS demos have a real service to read.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, ensureDir } from "./paths.ts";

const PORT = Number(process.env.FORGELINE_DEMO_PORT ?? 4010);
const PIDFILE = () => path.join(DATA_DIR, "demo-api.json");

export type DemoStatus = { running: boolean; port: number; apiVersion?: number; available: boolean };

const script = (repo: string) => path.join(repo, "demo", "graphos", "server.py");

export async function demoStatus(repo: string): Promise<DemoStatus> {
  const available = fs.existsSync(script(repo));
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/health`, { signal: AbortSignal.timeout(800) });
    const body = (await res.json()) as { apiVersion?: number };
    return { running: true, port: PORT, apiVersion: body.apiVersion, available };
  } catch {
    return { running: false, port: PORT, available };
  }
}

function stopKnown() {
  try {
    const { pid } = JSON.parse(fs.readFileSync(PIDFILE(), "utf8")) as { pid: number };
    process.kill(pid, "SIGTERM");
  } catch {
    // not running, or not started by this app
  }
  fs.rmSync(PIDFILE(), { force: true });
}

export async function startDemo(repo: string, version: 1 | 2): Promise<DemoStatus> {
  if (!fs.existsSync(script(repo))) throw new Error("This repo has no demo/graphos/server.py.");
  stopKnown();
  await new Promise((r) => setTimeout(r, 300));
  const log = fs.openSync(path.join(ensureDir(DATA_DIR), "demo-api.log"), "w");
  const child = spawn("python3", [script(repo), "--port", String(PORT), "--api-version", String(version)], { detached: true, stdio: ["ignore", log, log] });
  fs.closeSync(log);
  child.unref();
  if (!child.pid) throw new Error("Could not start the demo API.");
  fs.writeFileSync(PIDFILE(), JSON.stringify({ pid: child.pid, version }));
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 150));
    const s = await demoStatus(repo);
    if (s.running && s.apiVersion === version) return s;
  }
  throw new Error(`The demo API did not come up on port ${PORT}. Is something else using it?`);
}

export function stopDemo() {
  stopKnown();
}
