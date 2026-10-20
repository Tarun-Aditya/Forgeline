// High-level view of the MCP servers Claude Code already knows about.
// Only names and kinds leave this module; server configs (which can hold secrets) never do.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type McpServer = { name: string; type: string; scope: "user" | "project" | "repo" };
type Config = Record<string, { type?: string; command?: string; url?: string }>;

function readJson(file: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function collect(repo: string): Map<string, { cfg: Config[string]; scope: McpServer["scope"] }> {
  const out = new Map<string, { cfg: Config[string]; scope: McpServer["scope"] }>();
  const user = readJson(path.join(os.homedir(), ".claude.json"));
  const add = (cfgs: unknown, scope: McpServer["scope"]) => {
    for (const [name, cfg] of Object.entries((cfgs ?? {}) as Config)) out.set(name, { cfg, scope });
  };
  add(user.mcpServers, "user");
  add(((user.projects ?? {}) as Record<string, { mcpServers?: Config }>)[repo]?.mcpServers, "project");
  add(readJson(path.join(repo, ".mcp.json")).mcpServers, "repo");
  return out;
}

export function listMcp(repo: string): McpServer[] {
  return [...collect(repo)].map(([name, { cfg, scope }]) => ({
    name,
    scope,
    type: cfg.type ?? (cfg.url ? "http" : "stdio"),
  }));
}

/** Write a config holding only the chosen servers; returns the CLI flags, or [] to leave defaults. */
export function mcpArgs(repo: string, chosen: string[] | undefined, file: string): string[] {
  if (!chosen) return [];
  const all = collect(repo);
  const mcpServers: Config = {};
  for (const name of chosen) {
    const hit = all.get(name);
    if (hit) mcpServers[name] = hit.cfg;
  }
  fs.writeFileSync(file, JSON.stringify({ mcpServers }), { mode: 0o600 });
  return ["--strict-mcp-config", "--mcp-config", file];
}
