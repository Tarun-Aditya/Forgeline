import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const ROOT = path.join(os.tmpdir(), "forgeline-e2e");
export const FIXTURE = path.join(ROOT, "repo");
export const DATA = path.join(ROOT, "data");
export const FAKE_LOG = path.join(ROOT, "fake-claude.log");
export const PROJECTS = path.join(ROOT, "projects"); // stands in for ~/.claude/projects

const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const job = (id: string, stage: string, feature: string, history: { stage: string; at: string }[]) =>
  JSON.stringify({ id, feature, type: "feature", branch: `factory/${id}`, stage, round: stage === "merged" ? 1 : 0, reviews: {}, history });

/** A throwaway repo with the factory markers, one job waiting at intent and one finished job with a recorded agent history. */
export function buildFixture() {
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(path.join(FIXTURE, ".claude", "agents"), { recursive: true });
  fs.mkdirSync(DATA, { recursive: true });
  write(path.join(FIXTURE, "factory", "policy.json"), "{}");
  write(path.join(FIXTURE, "AGENTS.md"), "# fixture\n");
  // The app reads the activity log through the repo's own script, so use the real one.
  fs.mkdirSync(path.join(FIXTURE, "factory", "scripts"), { recursive: true });
  fs.copyFileSync(path.join(process.cwd(), "..", "factory", "scripts", "activity.py"), path.join(FIXTURE, "factory", "scripts", "activity.py"));

  const at = new Date(Date.now() - 3600_000).toISOString();
  write(path.join(FIXTURE, "factory", "jobs", "001-add-search", "job.json"), job("001-add-search", "intent", "Add a search box", [{ stage: "intent", at }]));
  write(path.join(FIXTURE, "factory", "jobs", "001-add-search", "intent.md"), "INTENT: DRAFT\n\n## Success criteria\n- finds things\n");

  write(path.join(FIXTURE, "factory", "jobs", "002-dark-mode", "job.json"), job("002-dark-mode", "merged", "Add dark mode", [{ stage: "intent", at }, { stage: "merged", at }]));
  write(path.join(FIXTURE, "factory", "jobs", "002-dark-mode", "spec.md"), "# Dark mode\n\n## Acceptance criteria\n1. a toggle exists\n2. it remembers the choice\n");
  write(path.join(FIXTURE, "factory", "jobs", "002-dark-mode", "decision.md"), "APPROVE\n\n## Why\nfine\n");

  // Agent history for 002, ten minutes in total, every agent finishing before the next starts (reviewers overlap).
  // Sessions the app did not start, as Claude Code would have written them: a terminal session that ran job 002,
  // and a VS Code session that stopped on a question while job 003 was at plan.
  const projectDir = path.join(PROJECTS, FIXTURE.replace(/[^a-zA-Z0-9]/g, "-"));
  const msg = (id: string, text: string) => JSON.stringify({ type: "assistant", message: { id, model: "m", content: [{ type: "text", text }], usage: {} } });
  write(path.join(projectDir, "s-demo.jsonl"), [
    JSON.stringify({ type: "user", entrypoint: "cli", timestamp: new Date().toISOString(), message: { content: "/factory add dark mode" } }),
    JSON.stringify({ type: "ai-title", aiTitle: "Add dark mode" }),
    msg("a1", "All done."),
  ].join("\n") + "\n");
  write(path.join(projectDir, "s-ask.jsonl"), [
    JSON.stringify({ type: "user", entrypoint: "claude-vscode", timestamp: new Date().toISOString(), message: { content: "/factory approve-spec 003-add-export" } }),
    JSON.stringify({ type: "ai-title", aiTitle: "Add an export button" }),
    msg("b1", "Which file format should the export use?"),
  ].join("\n") + "\n");
  write(path.join(FIXTURE, "factory", "jobs", "003-add-export", "job.json"), job("003-add-export", "plan", "Add an export button", [{ stage: "plan", at }]));
  const askEvents = [["session_start", 120, "startup"], ["prompt", 119, "/factory approve-spec 003-add-export"], ["session_end", 100, ""]].map(([e, ago, text]) =>
    JSON.stringify({ ts: new Date(Date.now() - Number(ago) * 1000).toISOString(), sid: "s-ask", ev: e, agent: "orchestrator", tool: "", text, job: "003-add-export", pid: 1 }));
  write(path.join(FIXTURE, "factory", "activity", "s-ask.jsonl"), askEvents.join("\n") + "\n");
  write(path.join(FIXTURE, "factory", "activity", "s-ask.job"), "003-add-export");

  const sid = "s-demo";
  const t0 = Date.now() - 1800_000;
  const events: object[] = [];
  const ev = (sec: number, e: string, agent: string, tool = "", text = "") =>
    events.push({ ts: new Date(t0 + sec * 1000).toISOString(), sid, ev: e, agent, tool, text, job: "002-dark-mode", pid: 1 });
  ev(0, "session_start", "orchestrator");
  ev(1, "prompt", "orchestrator", "", "/factory add dark mode");
  const steps: [string, number, number][] = [["intent-writer", 5, 60], ["spec-writer", 70, 150], ["planner", 160, 240], ["builder", 250, 480], ["reviewer-security", 490, 540], ["reviewer-ux", 490, 550], ["reviewer-ui", 490, 545], ["reviewer-code", 490, 560], ["approver", 570, 620]];
  for (const [agent, a, b] of steps) {
    ev(a, "subagent_start", agent, "", agent);
    ev(a + 5, "tool", agent, "Edit", "/repo/web/theme.ts");
    ev(a + 6, "tool_done", agent, "Edit", "/repo/web/theme.ts");
    ev(b, "subagent_stop", agent, "", agent);
  }
  ev(625, "session_end", "orchestrator");
  write(path.join(FIXTURE, "factory", "activity", `${sid}.jsonl`), events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  write(path.join(FIXTURE, "factory", "activity", `${sid}.job`), "002-dark-mode");
}
