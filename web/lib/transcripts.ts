// Claude Code writes every session (terminal, VS Code, desktop and `claude -p`) to ~/.claude/projects/<repo>/<session>.jsonl,
// and each subagent to <session>/subagents/agent-*.jsonl with a .meta.json naming it. That is how the web app can see
// sessions it did not start: who ran, what they spent, and what they last said.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Usage } from "./agentcost.ts";

export const PROJECTS = () => process.env.CLAUDE_PROJECTS_DIR ?? path.join(os.homedir(), ".claude", "projects");
/** Claude Code names a project folder after the repo path with every non-alphanumeric character as "-". */
export const projectDir = (repo: string) => path.join(PROJECTS(), repo.replace(/[^a-zA-Z0-9]/g, "-"));
const SID = /^[A-Za-z0-9-]+$/;
const sessionFile = (repo: string, sid: string) => (SID.test(sid) ? path.join(projectDir(repo), `${sid}.jsonl`) : null);

export type SessionMeta = { sid: string; source: string; title: string; firstPrompt: string; startedAt: string | null; lastAt: string | null };

const SOURCES: Record<string, string> = { cli: "terminal", "claude-vscode": "VS Code", "claude-desktop": "desktop", "sdk-cli": "web" };

function lines(file: string, max = Infinity): string[] {
  try {
    const fd = fs.openSync(file, "r");
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, max);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, 0);
    fs.closeSync(fd);
    return buf.toString("utf8").split("\n");
  } catch {
    return [];
  }
}

const text = (c: unknown): string =>
  typeof c === "string" ? c : Array.isArray(c) ? c.map((b) => (b && typeof b === "object" && (b as { type?: string }).type === "text" ? (b as { text?: string }).text ?? "" : "")).join(" ") : "";

const metaCache = new Map<string, { size: number; meta: SessionMeta }>();

/** Where a session ran, what it is called, and when. Reads only the start of the file. */
export function sessionMeta(repo: string, sid: string): SessionMeta | null {
  const file = sessionFile(repo, sid);
  if (!file || !fs.existsSync(file)) return null;
  const stat = fs.statSync(file);
  const hit = metaCache.get(sid);
  if (hit && hit.size === stat.size) return hit.meta;
  let entry = "";
  let title = "";
  let first = "";
  let startedAt: string | null = null;
  for (const l of lines(file, 1_500_000)) {
    if (!l.startsWith("{")) continue;
    try {
      const d = JSON.parse(l);
      if (!entry && d.entrypoint) entry = d.entrypoint;
      if (!startedAt && d.timestamp) startedAt = d.timestamp;
      if (d.type === "ai-title" && d.aiTitle) title = d.aiTitle;
      if (!first && d.type === "user" && !d.isSidechain && !d.isMeta) first = text(d.message?.content).trim();
    } catch { /* a cut-off line at the end of the slice */ }
  }
  const lastAt = new Date(stat.mtimeMs).toISOString();
  const meta = { sid, source: SOURCES[entry] ?? (entry || "unknown"), title: (title || first).replace(/\s+/g, " ").slice(0, 120), firstPrompt: first.slice(0, 200), startedAt, lastAt };
  metaCache.set(sid, { size: stat.size, meta });
  return meta;
}

type ModelUsage = Record<string, Usage>; // by model
const usageCache = new Map<string, { key: string; out: Record<string, ModelUsage> }>();

function fold(file: string, agent: string, into: Record<string, Record<string, Usage>>) {
  const byMessage = new Map<string, { model: string; usage: Usage }>(); // events repeat a message; keep the last
  for (const l of lines(file)) {
    if (!l.includes('"assistant"')) continue;
    try {
      const d = JSON.parse(l);
      if (d.type === "assistant" && d.message?.id && d.message.usage) byMessage.set(d.message.id, { model: d.message.model ?? "unknown", usage: d.message.usage });
    } catch { /* partial line */ }
  }
  for (const { model, usage } of byMessage.values()) {
    const a = ((into[agent] ??= {})[model] ??= {});
    for (const k of ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"] as const) a[k] = (a[k] ?? 0) + (usage[k] ?? 0);
  }
}

/** Token usage of one session by agent, then by model. Subagents are named by their .meta.json; the session itself is the orchestrator. */
export function sessionUsage(repo: string, sid: string): Record<string, ModelUsage> {
  const file = sessionFile(repo, sid);
  if (!file || !fs.existsSync(file)) return {};
  const dir = path.join(projectDir(repo), sid, "subagents");
  const subs = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")) : [];
  const key = [file, ...subs.map((f) => path.join(dir, f))].map((f) => { try { return fs.statSync(f).size; } catch { return 0; } }).join(",");
  const hit = usageCache.get(sid);
  if (hit && hit.key === key) return hit.out;
  const out: Record<string, ModelUsage> = {};
  fold(file, "orchestrator", out);
  for (const f of subs) {
    let agent = "subagent";
    try { agent = JSON.parse(fs.readFileSync(path.join(dir, f.replace(/\.jsonl$/, ".meta.json")), "utf8")).agentType || agent; } catch { /* no meta */ }
    fold(path.join(dir, f), agent, out);
  }
  usageCache.set(sid, { key, out });
  return out;
}

const lastCache = new Map<string, { size: number; text: string }>();

/** The session's last assistant message, if the session ended on text (not on a tool call). */
export function lastAssistantText(repo: string, sid: string): string {
  const file = sessionFile(repo, sid);
  if (!file) return "";
  let size = 0;
  try { size = fs.statSync(file).size; } catch { return ""; }
  const hit = lastCache.get(sid);
  if (hit && hit.size === size) return hit.text;
  const text = findLastText(lines(file));
  lastCache.set(sid, { size, text });
  return text;
}

function findLastText(all: string[]): string {
  for (let i = all.length - 1; i >= 0; i--) {
    const l = all[i];
    if (!l.includes('"assistant"')) continue;
    try {
      const d = JSON.parse(l);
      if (d.type !== "assistant" || d.isSidechain) continue;
      const blocks = Array.isArray(d.message?.content) ? d.message.content : [];
      if (blocks.some((b: { type?: string }) => b.type === "tool_use")) return ""; // it stopped mid-work, not to say something
      const t = text(blocks).trim();
      if (t) return t.slice(0, 8000);
    } catch { /* partial */ }
  }
  return "";
}
