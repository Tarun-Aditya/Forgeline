import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { lastAssistantText, projectDir, sessionMeta, sessionUsage } from "../lib/transcripts.ts";

const j = (o: object) => JSON.stringify(o);
const asst = (id: string, model: string, usage: object, content: object[], extra: object = {}) => j({ type: "assistant", message: { id, model, usage, content }, ...extra });

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tr-"));
  process.env.CLAUDE_PROJECTS_DIR = root;
  const repo = "/work/my.repo";
  const dir = projectDir(repo);
  fs.mkdirSync(path.join(dir, "s1", "subagents"), { recursive: true });
  fs.writeFileSync(path.join(dir, "s1.jsonl"), [
    j({ type: "user", entrypoint: "claude-vscode", timestamp: "2026-01-01T00:00:00Z", message: { content: "please add dark mode" } }),
    j({ type: "ai-title", aiTitle: "Add dark mode" }),
    asst("m1", "opus", { input_tokens: 10, output_tokens: 100 }, [{ type: "tool_use", name: "Task", id: "t" }]),
    asst("m1", "opus", { input_tokens: 10, output_tokens: 100 }, [{ type: "tool_use", name: "Task", id: "t" }]), // repeated event
    asst("m2", "opus", { input_tokens: 5, output_tokens: 50 }, [{ type: "text", text: "Which repo should I use?" }]),
  ].join("\n") + "\n");
  fs.writeFileSync(path.join(dir, "s1", "subagents", "agent-a.jsonl"), asst("b1", "sonnet", { input_tokens: 1, output_tokens: 20, cache_read_input_tokens: 1000 }, [{ type: "text", text: "x" }], { isSidechain: true }) + "\n");
  fs.writeFileSync(path.join(dir, "s1", "subagents", "agent-a.meta.json"), j({ agentType: "builder" }));
  return { repo, root };
}

test("the project folder name replaces every non-alphanumeric character", () => {
  process.env.CLAUDE_PROJECTS_DIR = "/p";
  assert.equal(projectDir("/Users/a.b/work/my repo"), "/p/-Users-a-b-work-my-repo");
});

test("sessionMeta names where it ran and what it was about", () => {
  const { repo } = setup();
  const m = sessionMeta(repo, "s1")!;
  assert.equal(m.source, "VS Code");
  assert.equal(m.title, "Add dark mode");
  assert.equal(m.startedAt, "2026-01-01T00:00:00Z");
  assert.equal(sessionMeta(repo, "nope"), null);
  assert.equal(sessionMeta(repo, "../etc"), null);
});

test("sessionUsage splits usage by agent and model and counts a repeated message once", () => {
  const { repo } = setup();
  const u = sessionUsage(repo, "s1");
  assert.deepEqual(Object.keys(u).sort(), ["builder", "orchestrator"]);
  assert.equal(u.orchestrator.opus.output_tokens, 150); // m1 once (100) + m2 (50)
  assert.equal(u.builder.sonnet.cache_read_input_tokens, 1000);
});

test("lastAssistantText returns what a session ended on, and nothing if it ended on a tool call", () => {
  const { repo } = setup();
  assert.equal(lastAssistantText(repo, "s1"), "Which repo should I use?");
  const dir = projectDir(repo);
  fs.appendFileSync(path.join(dir, "s1.jsonl"), asst("m3", "opus", {}, [{ type: "tool_use", name: "Bash", id: "u" }]) + "\n");
  assert.equal(lastAssistantText(repo, "s1"), "");
});

import { ranFactory } from "../lib/external.ts";

test("ranFactory tells a factory session from a person's own coding session", () => {
  assert.equal(ranFactory("/factory add dark mode", ["orchestrator"]), true);
  assert.equal(ranFactory("fix the css", ["orchestrator", "builder"]), true);
  assert.equal(ranFactory("fix the css for 003-agent-questions-badge", ["orchestrator"]), false);
  assert.equal(ranFactory(undefined, ["orchestrator", "Explore"]), false);
});
