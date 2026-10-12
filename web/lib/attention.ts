// Which jobs have just started needing a person. Pure, so it can be tested without a browser.
import type { Job } from "./jobs.ts";

export type Attention = { key: string; title: string; body: string };

const label = (j: Job) => j.id.replace(/^\d+-/, "").replace(/-/g, " ");

/** One state string per job, or null when the job needs nothing from a person right now. */
function needs(j: Job, trouble?: string, question?: boolean): { state: string; title: string } | null {
  if (trouble) return { state: `trouble:${trouble}`, title: trouble === "crashed" ? "An agent crashed" : "A job stalled" };
  if (question) return { state: "question", title: "An agent has a question" };
  if (j.stage === "spec-approval") return { state: "spec-approval", title: "Spec ready for approval" };
  if (j.stage === "needs-human") return { state: "needs-human", title: "Needs your call" };
  if (j.stage === "intent") return { state: "intent", title: "Intent ready to accept" };
  return null;
}

export type Snapshot = Map<string, string>;

export function snapshot(jobs: Job[], trouble: Map<string, string>, questions: Set<string>): Snapshot {
  const out: Snapshot = new Map();
  for (const j of jobs) {
    const n = needs(j, trouble.get(j.id), questions.has(j.id));
    if (n) out.set(j.id, n.state);
  }
  return out;
}

/** What is new in `next` compared with `prev`. The first snapshot (prev null) reports nothing, so opening the page is quiet. */
export function newAttention(prev: Snapshot | null, jobs: Job[], trouble: Map<string, string>, questions: Set<string>): { next: Snapshot; events: Attention[] } {
  const next = snapshot(jobs, trouble, questions);
  const events: Attention[] = [];
  if (prev)
    for (const j of jobs) {
      const state = next.get(j.id);
      if (state && prev.get(j.id) !== state) {
        const n = needs(j, trouble.get(j.id), questions.has(j.id))!;
        events.push({ key: `${j.id}:${state}`, title: n.title, body: `${j.id.split("-")[0]} · ${label(j)}` });
      }
    }
  return { next, events };
}
