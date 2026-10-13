// Read-only view of the repo's subagents (.claude/agents/*.md): frontmatter plus the opening of the prompt.
import fs from "node:fs";
import path from "node:path";

export type AgentInfo = { name: string; description: string; tools: string[]; model: string | null; file: string; prompt: string };

export function parseAgent(file: string, text: string): AgentInfo {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  const front: Record<string, string> = {};
  for (const line of (m?.[1] ?? "").split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) front[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return {
    name: front.name || path.basename(file, ".md"),
    description: front.description ?? "",
    tools: (front.tools ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    model: front.model || null,
    file: path.join(".claude", "agents", path.basename(file)),
    prompt: (m?.[2] ?? text).trim().slice(0, 1500),
  };
}

export function listAgents(repo: string): AgentInfo[] {
  const dir = path.join(repo, ".claude", "agents");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => parseAgent(f, fs.readFileSync(path.join(dir, f), "utf8")));
}
