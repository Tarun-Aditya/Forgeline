// Which jobs are waiting on a person. A `claude -p` run cannot wait for input, so an
// orchestrator that needs an answer ends the run; its final message is the question. Worked
// out from the web app's own run files and job.json, plus sessions started elsewhere (terminal, VS Code,
// desktop) that ended mid-loop, read from the activity log and the session transcript.
import { loggedSessions } from "./activitylog.ts";
import type { Job } from "./jobs.ts";
import { alive, listMeta, loadRuns, parseLog, reconcile } from "./runs.ts";
import { lastAssistantText } from "./transcripts.ts";

export type Question = { job: string; runId: string; sessionId: string; text: string; askedAt: string };

const DONE = new Set(["merged", "split", "needs-human"]);
// The loop moves through these on its own, so a run that ended here stopped for the person.
const MID_LOOP = new Set(["spec", "plan", "build", "review", "approve"]);

export function pendingQuestions(repo: string, jobs: Job[]): Record<string, Question> {
  reconcile();
  const metas = listMeta().filter((m) => m.repo === repo); // newest first
  const live = new Map(metas.map((m) => [m.runId, alive(m.pid)]));
  const records = new Map(loadRuns().map((r) => [r.runId, r]));
  const out: Record<string, Question> = {};
  for (const job of jobs) {
    const J = job.id;
    if (job.paused || DONE.has(job.stage)) continue;
    const mine = metas.filter((m) =>
      m.key === J || m.answers === J || records.get(m.runId)?.jobIds.includes(J) || (live.get(m.runId) && !m.before.includes(J)));
    if (mine.length === 0 || mine.some((m) => live.get(m.runId))) continue;
    const m = mine[0];
    const rec = records.get(m.runId);
    if (!rec || rec.lost || !rec.ok) continue;
    const actedOn = m.key === J || m.answers === J;
    const unmoved = actedOn && m.at?.job === J && (job.history?.length ?? 0) === m.at.history;
    if (!MID_LOOP.has(job.stage) && !unmoved) continue;
    let text = rec.finalText;
    let sessionId = rec.sessionId;
    if (text === undefined) {
      // Recorded before finalText existed: read it from this one run's log.
      const log = parseLog(m.runId);
      text = log.finalText?.slice(0, 8000);
      sessionId ??= log.sessionId;
    }
    if (!text?.trim() || !sessionId) continue;
    out[J] = { job: J, runId: m.runId, sessionId, text, askedAt: rec.endedAt };
  }
  return { ...out, ...externalQuestions(repo, jobs, out, new Set([...records.values()].map((r) => r.sessionId).filter((s): s is string => !!s)), metas.some((m) => live.get(m.runId))) };
}

const RECENT_MS = 5 * 60_000; // a session that logged within this long and has not ended is taken to be working

/** Sessions started outside the web app that ended mid-loop on a job. Only a clean end (session_end) counts: a killed session is "crashed", not a question. */
function externalQuestions(repo: string, jobs: Job[], web: Record<string, Question>, webSids: Set<string>, webLive: boolean): Record<string, Question> {
  const out: Record<string, Question> = {};
  if (webLive) return out;
  const sessions = loggedSessions(repo).filter((s) => !webSids.has(s.sid));
  for (const job of jobs) {
    if (job.paused || !MID_LOOP.has(job.stage)) continue;
    const mine = sessions.filter((s) => s.job === job.id && s.lastTs).sort((a, b) => (b.lastTs! > a.lastTs! ? 1 : -1));
    if (mine.length === 0) continue;
    if (mine.some((s) => !s.ended && Date.now() - Date.parse(s.lastTs!) < RECENT_MS)) continue; // someone is on it
    const newest = mine[0];
    if (!newest.ended) continue;
    const text = lastAssistantText(repo, newest.sid);
    if (!text) continue;
    const asked = web[job.id];
    if (asked && asked.askedAt >= newest.lastTs!) continue; // a web run on the job is newer
    out[job.id] = { job: job.id, runId: `session-${newest.sid}`, sessionId: newest.sid, text, askedAt: newest.lastTs! };
  }
  return out;
}
