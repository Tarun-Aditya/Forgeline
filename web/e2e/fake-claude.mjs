#!/usr/bin/env node
// A stand-in for `claude -p` so the fixture tests run offline. It logs its arguments, then plays one of two scripts:
// a job command that stops to ask "which repo?", and the answer that continues it and moves the job on.
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const prompt = args.at(-1) ?? "";
const resume = args.includes("--resume") ? args[args.indexOf("--resume") + 1] : null;
if (process.env.FAKE_CLAUDE_LOG) fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify({ args, cwd: process.cwd() }) + "\n");

const sid = resume ?? "fake-session-1";
const out = (o) => console.log(JSON.stringify({ session_id: sid, ...o }));
const say = (text) => {
  out({ type: "system", subtype: "init", model: "fake" });
  out({ type: "assistant", message: { id: `m-${Date.now()}`, model: "fake", content: [{ type: "text", text }], usage: { input_tokens: 1, output_tokens: 1 } } });
  out({ type: "result", subtype: "success", is_error: false, result: text, total_cost_usd: 0, duration_ms: 50, num_turns: 1, usage: { input_tokens: 1, output_tokens: 1 }, modelUsage: {} });
};

if (resume) {
  // The answer: move the one job still at intent on to spec.
  const dir = path.join(process.cwd(), "factory", "jobs");
  for (const id of fs.readdirSync(dir)) {
    const file = path.join(dir, id, "job.json");
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    if (j.stage !== "intent") continue;
    j.stage = "spec";
    j.history = [...(j.history ?? []), { stage: "spec", at: new Date().toISOString() }];
    fs.writeFileSync(file, JSON.stringify(j));
  }
  setTimeout(() => say("Thanks, continuing with that repo."), 200);
} else {
  setTimeout(() => say("Which repo should this job target? Reply with a path."), 300);
}
