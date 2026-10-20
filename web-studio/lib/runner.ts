// Starts `claude -p "/factory ..."` as a detached process and streams its log to the browser.
// This is only a launcher: the orchestrator is still the /factory skill, and job state is
// still written by jobctl.py into factory/jobs/. Because the process is detached and writes
// to a file, a crashed or restarted web server never takes a running job down with it.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { createUIMessageStream, type UIMessageChunk } from "ai";
import { listJobs } from "./jobs.ts";
import { mcpArgs } from "./mcp.ts";
import { DATA_DIR, ensureDir } from "./paths.ts";
import { alive, errorTail, errLogPath, eventLogPath, finalize, listMeta, readMeta, reconcile, writeMeta } from "./runs.ts";
import { EventMapper, LineParser } from "./stream.ts";

/** The environment for the agent process. The web server runs with NODE_ENV=production and Next's own
 *  variables; passed on, they make the target repo's tests behave differently from a normal shell
 *  (React's act() fails under production, for one), so the merge gate sees a red baseline. */
export function agentEnv(base: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = { ...base };
  if (base.FORGELINE_ALLOW_API_KEY !== "1") delete env.ANTHROPIC_API_KEY; // use the subscription
  delete env.NODE_ENV;
  delete env.NEXT_RUNTIME;
  for (const k of Object.keys(env)) if (k.startsWith("__NEXT") || k.startsWith("NEXT_PRIVATE")) delete env[k];
  return env as NodeJS.ProcessEnv;
}

export type StartInput = {
  repo: string;
  text: string;
  type?: "feature" | "bugfix";
  ticket?: string;
  mcp?: string[];
};

const VERBS = "accept|approve-spec|respec|approve|rework|resume|stop|next|metrics|review";
const TICKET = /^[A-Z][A-Z0-9]+-\d+$/;
const JOB_VERB = new RegExp(`^/factory\\s+(?:${VERBS})\\s+(\\S+)`);

/** Anything starting with /factory is passed through; plain text becomes a new job. */
export function buildPrompt({ text, type, ticket }: Pick<StartInput, "text" | "type" | "ticket">): string {
  const t = text.trim();
  if (!t) throw new Error("Nothing to run.");
  if (t.startsWith("/factory")) return t;
  const key = ticket?.trim() || (TICKET.test(t) ? t : "");
  if (key && !TICKET.test(key)) throw new Error("Ticket must look like ABC-123.");
  return ["/factory", t, type === "bugfix" ? "--type bugfix" : "", key ? `--ticket ${key}` : ""]
    .filter(Boolean)
    .join(" ");
}

/** The job a command acts on, used to refuse two orchestrators on one job. */
export function jobKey(prompt: string): string | null {
  return JOB_VERB.exec(prompt)?.[1] ?? null;
}

export function activeRuns() {
  reconcile();
  return listMeta()
    .filter((m) => alive(m.pid))
    .map((m) => ({ runId: m.runId, jobKey: m.key, repo: m.repo }));
}

export function stopRun(runId: string): boolean {
  const meta = readMeta(runId);
  if (!meta || !alive(meta.pid)) return false;
  process.kill(meta.pid, "SIGINT");
  return true;
}

export function launchRun(input: StartInput): string {
  const prompt = buildPrompt(input);
  const key = jobKey(prompt);
  if (key && activeRuns().some((r) => r.jobKey === key && r.repo === input.repo)) {
    throw new Error(`Job ${key} already has a run in progress.`);
  }
  const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const mcpFile = path.join(ensureDir(path.join(DATA_DIR, "tmp")), `mcp-${runId}.json`);
  const args = [
    "-p", prompt,
    "--output-format", "stream-json",
    "--verbose",
    "--permission-mode", process.env.FORGELINE_PERMISSION_MODE ?? "auto",
    ...mcpArgs(input.repo, input.mcp, mcpFile),
  ];
  const env = agentEnv(process.env);

  const out = fs.openSync(eventLogPath(runId), "w");
  const err = fs.openSync(errLogPath(runId), "w");
  const child = spawn(process.env.CLAUDE_BIN ?? "claude", args, {
    cwd: input.repo, env, detached: true, stdio: ["ignore", out, err],
  });
  fs.closeSync(out);
  fs.closeSync(err);
  child.on("error", (e) => fs.appendFileSync(errLogPath(runId), String(e)));
  child.unref();
  if (!child.pid) {
    fs.rmSync(mcpFile, { force: true });
    throw new Error(`Could not start ${process.env.CLAUDE_BIN ?? "claude"}.`);
  }
  writeMeta({
    runId, repo: input.repo, prompt, key, pid: child.pid,
    startedAt: new Date().toISOString(),
    before: listJobs(input.repo).map((j) => j.id),
    mcpFile: fs.existsSync(mcpFile) ? mcpFile : undefined,
  });
  return runId;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Replay a run's log from the start, then follow it until the process ends. */
export function followRun(runId: string) {
  return createUIMessageStream({
    execute: async ({ writer }) => {
      const meta = readMeta(runId);
      if (!meta) throw new Error("Unknown run.");
      let gone = false; // the browser closed; the run itself carries on
      const send = (c: UIMessageChunk) => {
        try {
          writer.write(c);
        } catch {
          gone = true;
        }
      };
      send({ type: "data-run", data: { runId, prompt: meta.prompt, startedAt: meta.startedAt }, transient: true } as UIMessageChunk);

      const mapper = new EventMapper();
      const parser = new LineParser();
      const decoder = new StringDecoder("utf8");
      const handle = (events: ReturnType<LineParser["push"]>) => events.forEach((ev) => mapper.feed(ev).forEach(send));
      const log = eventLogPath(runId);
      let pos = 0;
      while (!gone) {
        const size = fs.existsSync(log) ? fs.statSync(log).size : 0;
        if (size > pos) {
          const fd = fs.openSync(log, "r");
          const buf = Buffer.alloc(size - pos);
          fs.readSync(fd, buf, 0, buf.length, pos);
          fs.closeSync(fd);
          pos = size;
          handle(parser.push(decoder.write(buf)));
          continue;
        }
        if (!alive(meta.pid)) {
          if ((fs.existsSync(log) ? fs.statSync(log).size : 0) > pos) continue; // late bytes
          break;
        }
        await sleep(150);
      }
      handle(parser.end());
      const rec = finalize(runId);
      if (!mapper.result) send({ type: "error", errorText: errorTail(runId) || "The run ended without a result (it was stopped or crashed)." });
      else if (rec && !rec.ok) send({ type: "error", errorText: "The run reported an error." });
    },
    onError: (e) => (e instanceof Error ? e.message : "Run failed."),
  });
}

export function startRun(input: StartInput) {
  return followRun(launchRun(input));
}
