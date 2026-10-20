import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, ensureDir } from "./paths.ts";

export type Repo = { path: string; name: string; ready: boolean };

const FILE = path.join(DATA_DIR, "repos.json");

function configured(): string[] {
  const env = process.env.FORGELINE_REPOS;
  if (env) return env.split(path.delimiter).filter(Boolean);
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    // Default: the repo this web app lives in.
    return [path.resolve(process.cwd(), "..")];
  }
}

/** A repo is ready when it carries the factory (policy + agents). */
export function describe(p: string): Repo {
  const ready =
    fs.existsSync(path.join(p, "factory", "policy.json")) && fs.existsSync(path.join(p, ".claude", "agents"));
  return { path: p, name: path.basename(p), ready };
}

export function listRepos(): Repo[] {
  return configured().filter((p) => fs.existsSync(p)).map(describe);
}

/** Only repos on the list may be used as a working directory. */
export function resolveRepo(p: string | undefined): string {
  const repos = listRepos();
  const hit = repos.find((r) => r.path === p) ?? (p ? undefined : repos[0]);
  if (!hit) throw new Error("Unknown repo. Add it to the list first.");
  if (!hit.ready) throw new Error(`${hit.name} has no factory/ and .claude/ yet.`);
  return hit.path;
}

export function addRepo(p: string): Repo {
  const abs = path.resolve(p);
  if (!fs.existsSync(path.join(abs, ".git"))) throw new Error("Not a git repository.");
  const next = [...new Set([...configured(), abs])];
  ensureDir(DATA_DIR);
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
  return describe(abs);
}
