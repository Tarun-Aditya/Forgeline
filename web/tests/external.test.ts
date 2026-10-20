import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fl-external-"));
process.env.FORGELINE_WEB_DATA = path.join(tmp, "data");
process.env.CLAUDE_PROJECTS_DIR = path.join(tmp, "projects");

const { listJobs } = await import("../lib/jobs.ts");
const { pendingQuestions } = await import("../lib/questions.ts");
const { projectDir } = await import("../lib/transcripts.ts");
const { loggedSessions } = await import("../lib/activitylog.ts");

const J = "001-limit";
let n = 0;
const j = (o: object) => JSON.stringify(o);

/** A repo with one job, and a session on it that logged `events` and wrote `transcript`. */
function repoWith(stage: string, sid: string, events: { ev: string; ago: number }[], transcript: object[]) {
  const repo = path.join(tmp, `repo-${n++}`);
  fs.mkdirSync(path.join(repo, "factory", "jobs", J), { recursive: true });
  fs.mkdirSync(path.join(repo, "factory", "activity"), { recursive: true });
  fs.writeFileSync(path.join(repo, "factory", "jobs", J, "job.json"), j({ id: J, feature: "f", stage, history: [{ stage, at: "t" }] }));
  fs.writeFileSync(path.join(repo, "factory", "activity", `${sid}.jsonl`), events.map((e) => j({ ts: new Date(Date.now() - e.ago).toISOString(), sid, ev: e.ev, agent: "orchestrator", job: J })).join("\n") + "\n");
  fs.writeFileSync(path.join(repo, "factory", "activity", `${sid}.job`), J);
  fs.mkdirSync(projectDir(repo), { recursive: true });
  fs.writeFileSync(path.join(projectDir(repo), `${sid}.jsonl`), transcript.map(j).join("\n") + "\n");
  return repo;
}
const say = (text: string) => ({ type: "assistant", message: { id: `m${n++}`, content: [{ type: "text", text }], usage: {} } });
const act = () => ({ type: "assistant", message: { id: `m${n++}`, content: [{ type: "tool_use", name: "Bash", id: "t" }], usage: {} } });
const questions = (repo: string) => pendingQuestions(repo, listJobs(repo));

test("loggedSessions reads the job and whether the session ended", () => {
  const repo = repoWith("plan", "s1", [{ ev: "prompt", ago: 5000 }, { ev: "session_end", ago: 1000 }], [say("hi")]);
  const [s] = loggedSessions(repo);
  assert.equal(s.job, J);
  assert.equal(s.ended, true);
});

test("a terminal session that ended mid-loop on text is a question, with its session id", () => {
  const repo = repoWith("plan", "s1", [{ ev: "prompt", ago: 60_000 }, { ev: "session_end", ago: 30_000 }], [say("Which repo should this target?")]);
  const q = questions(repo)[J];
  assert.equal(q.sessionId, "s1");
  assert.equal(q.text, "Which repo should this target?");
  assert.equal(q.runId, "session-s1");
});

test("no question while the session is still going, if it ended on a tool call, or if the job is not mid-loop", () => {
  assert.deepEqual(questions(repoWith("plan", "s1", [{ ev: "prompt", ago: 20_000 }, { ev: "tool", ago: 5_000 }], [say("working")])), {}); // still running
  assert.deepEqual(questions(repoWith("plan", "s2", [{ ev: "session_end", ago: 30_000 }], [say("done"), act()])), {}); // stopped on a tool call
  assert.deepEqual(questions(repoWith("intent", "s3", [{ ev: "session_end", ago: 30_000 }], [say("Which repo?")])), {}); // intent waits for accept, not an answer
  assert.deepEqual(questions(repoWith("merged", "s4", [{ ev: "session_end", ago: 30_000 }], [say("Which repo?")])), {});
});

test("a killed session (no session_end) is not a question", () => {
  assert.deepEqual(questions(repoWith("plan", "s1", [{ ev: "prompt", ago: 3_600_000 }, { ev: "tool", ago: 3_500_000 }], [say("Which repo?")])), {});
});
