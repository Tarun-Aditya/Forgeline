import fs from "node:fs";
import path from "node:path";
import { isInside } from "./paths.ts";

export const STAGES = [
  { key: "intent", label: "Intent", who: "intent-writer" },
  { key: "spec", label: "Spec", who: "spec-writer" },
  { key: "spec-approval", label: "Approve spec", who: "human" },
  { key: "plan", label: "Plan", who: "planner" },
  { key: "build", label: "Build", who: "builder" },
  { key: "review", label: "Review", who: "sec · ux · ui · code" },
  { key: "approve", label: "Approve", who: "approver" },
  { key: "split", label: "Split", who: "children" },
  { key: "merged", label: "Merged", who: "main" },
  { key: "needs-human", label: "Needs human", who: "approve · rework" },
] as const;

export type Job = {
  id: string;
  feature: string;
  type: string;
  ticket?: string | null;
  branch: string;
  stage: string;
  round: number;
  reviews: Record<string, string>;
  paused?: boolean;
  intent_waived?: boolean;
  parent?: string | null;
  children?: string[];
  depends_on?: string[];
  created?: string;
  history?: { stage: string; at: string }[];
};

const JOB_ID = /^[A-Za-z0-9._-]+$/;

export function listJobs(repo: string): Job[] {
  const dir = path.join(repo, "factory", "jobs");
  if (!fs.existsSync(dir)) return [];
  const jobs: Job[] = [];
  for (const name of fs.readdirSync(dir).sort()) {
    try {
      jobs.push(JSON.parse(fs.readFileSync(path.join(dir, name, "job.json"), "utf8")));
    } catch {
      // A job folder being created has no job.json yet; skip it.
    }
  }
  return jobs;
}

export function listJobFiles(repo: string, id: string): string[] {
  if (!JOB_ID.test(id)) return [];
  const root = path.join(repo, "factory", "jobs", id);
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name), `${prefix}${e.name}/`);
      else if (e.name.endsWith(".md")) out.push(prefix + e.name);
    }
  };
  walk(root, "");
  return out.sort();
}

/** Read one markdown file from a job folder; refuses anything that leaves it. */
export function readJobFile(repo: string, id: string, rel: string): string | null {
  if (!JOB_ID.test(id) || !rel.endsWith(".md")) return null;
  const root = path.join(repo, "factory", "jobs", id);
  const file = path.resolve(root, rel);
  if (!fs.existsSync(file) || !isInside(root, file)) return null;
  return fs.readFileSync(file, "utf8");
}
