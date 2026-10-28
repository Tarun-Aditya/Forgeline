// GraphOS mode: workspaces that turn a REST API into an Apollo Connectors subgraph.
// A workspace is a folder `graphos/<name>/` (its own Git repo) holding the third-party
// `graphos-factory` skill's record: pinned sources, the inventory, the selection, decisions and
// findings, and the evidence each validation layer produced. This module only reads that record
// and answers a person's choices through the skill's own CLI (the same commands an agent uses).
// Which stage a workspace is in comes from factory/scripts/graphos_state.py, so the /graphos skill
// and this board never disagree.
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export const GRAPHOS_STAGES = [
  { key: "inventory", label: "Inventory", who: "intake" },
  { key: "scope", label: "Scope", who: "you pick" },
  { key: "design", label: "Design", who: "you decide" },
  { key: "apply", label: "Apply", who: "author" },
  { key: "validate", label: "Validate", who: "validator · reviewer" },
  { key: "export", label: "Export", who: "exporter" },
] as const;

export type GraphosState = {
  path: string;
  name: string;
  service: string | null;
  intake: string | null;
  source_kind: string | null;
  context_mode: string | null;
  ops_total: number;
  selection: { included: number; excluded: number } | null;
  decisions: { open: number; resolved: number };
  evidence: { run_at: string | null; layers: Record<string, string>; failed: string[]; not_run: string[] } | null;
  review?: string | null; // VERDICT line of review.md
  stage: string;
  gate: boolean;
  next: string | null;
  reason: string;
  refresh: boolean;
  exported: boolean;
};

export type Choice = { id: string; label: string; detail?: string };
export type Decision = {
  id: string;
  title: string;
  question?: string;
  status: string;
  phase?: string;
  context?: string;
  choices: Choice[];
  multiple?: boolean;
  resolution?: { chosen: string[]; note?: string; by?: string; at?: string };
};
export type Finding = { id: string; title: string; body?: string; date?: string; status?: string; source?: string };
export type Operation = {
  key: string;
  operationId: string;
  method: string;
  path: string;
  summary: string;
  tags: string[];
  semantics: string;
  deprecated: boolean;
  readHint?: string; // a POST whose name suggests it only reads
  support?: string; // supported | needs_review | unsupported
  include: boolean | null; // null: selection.yaml does not list it
  reason?: string;
  graphqlName?: string;
  root?: string;
};
export type Workspace = {
  state: GraphosState;
  api: { title?: string; version?: string; baseUrls: string[]; pagination?: string };
  operations: Operation[];
  decisions: Decision[];
  findings: Finding[];
  evidence: unknown;
  schema: { file: string; text: string } | null;
  review: string | null;
  handEdits: string[]; // schema spans someone edited by hand since the last apply
  memory: string | null;
  commits: { hash: string; subject: string; date: string }[];
};

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DECISION_ID = /^D-[A-Za-z0-9]+$/;

export const validName = (n: string) => NAME.test(n);

export function graphosDir(repo: string): string {
  return path.join(repo, process.env.FORGELINE_GRAPHOS_DIR || "graphos");
}

export function workspacePath(repo: string, name: string): string {
  if (!validName(name)) throw new Error("Bad workspace name.");
  const dir = path.join(graphosDir(repo), name);
  if (!fs.existsSync(path.join(dir, ".factory", "workspace.yaml"))) throw new Error(`No GraphOS workspace named ${name}.`);
  return dir;
}

/** The skill's CLI: an explicit env var, then the bootstrap cache, then PATH. */
export function graphosBin(): string {
  const cached = path.join(os.homedir(), ".cache", "graphos-factory-core", "apollographql-graphos-factory", "bin", "graphos-factory-core");
  return process.env.GRAPHOS_FACTORY_CORE_BIN || (fs.existsSync(cached) ? cached : "graphos-factory-core");
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function readText(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** Records of a log: the legacy file's list plus one file per record. */
function records<T>(factory: string, folder: string, legacy: string, key: string): T[] {
  const out: T[] = [];
  const old = readJson<Record<string, T[]>>(path.join(factory, legacy));
  if (old && Array.isArray(old[key + "s"])) out.push(...old[key + "s"]);
  const dir = path.join(factory, folder);
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
      const doc = readJson<Record<string, T>>(path.join(dir, f));
      if (doc && doc[key]) out.push(doc[key]);
    }
  }
  return out;
}

export function parseDecisions(factory: string): Decision[] {
  type Raw = Omit<Decision, "choices" | "resolution"> & { choices?: Choice[]; resolution?: Decision["resolution"] };
  return records<Raw>(factory, "decisions", "decisions.json", "decision").map((d) => ({ ...d, choices: d.choices ?? [] }));
}

export function parseFindings(factory: string): Finding[] {
  return records<Finding>(factory, "findings", "findings.json", "finding");
}

/** Include flag and names per operation, from the selection file. One line per operation is what the skill's `selection set` edits. */
export function parseSelection(text: string | null): Map<string, { include: boolean; reason?: string; name?: string; root?: string }> {
  const out = new Map<string, { include: boolean; reason?: string; name?: string; root?: string }>();
  if (!text) return out;
  const lines = text.split("\n");
  let current: string | null = null;
  let inOps = false;
  for (const line of lines) {
    if (/^\S/.test(line)) { // only the operations: section; links: has its own include flags
      inOps = line.startsWith("operations:");
      current = null;
      continue;
    }
    if (!inOps) continue;
    const flow = /^\s{2}"?([a-z]+:\/[^"\s]*?)"?:\s*\{(.*)\}\s*$/.exec(line);
    if (flow) {
      const body = flow[2];
      const inc = /include:\s*(true|false)/.exec(body);
      out.set(flow[1], {
        include: inc?.[1] === "true",
        reason: /reason:\s*"([^"]*)"/.exec(body)?.[1],
        name: /name:\s*([A-Za-z0-9_]+)/.exec(body)?.[1],
        root: /root:\s*(query|mutation)/.exec(body)?.[1],
      });
      current = null;
      continue;
    }
    const block = /^\s{2}"?([a-z]+:\/[^"\s]*?)"?:\s*$/.exec(line);
    if (block) {
      current = block[1];
      out.set(current, { include: false });
      continue;
    }
    if (current) {
      const inc = /^\s{4}include:\s*(true|false)/.exec(line);
      if (inc) out.get(current)!.include = inc[1] === "true";
      const name = /^\s+(?:graphql:.*?[{,]\s*)?name:\s*([A-Za-z0-9_]+)/.exec(line);
      if (name) out.get(current)!.name = name[1];
      const root = /^\s+(?:graphql:.*?[{,]\s*)?root:\s*(query|mutation)/.exec(line);
      if (root) out.get(current)!.root = root[1];
      const reason = /^\s{4}reason:\s*"?([^"]*)"?\s*$/.exec(line);
      if (reason) out.get(current)!.reason = reason[1];
    }
  }
  return out;
}

type RawInventory = {
  api?: { title?: string; version?: string; base_urls?: string[]; pagination?: { style?: string } };
  operations?: { key: string; operation_id?: string; method: string; path: string; summary?: string; tags?: string[]; semantics?: string; deprecated?: boolean; read_hint?: string; support?: string }[];
};

export function parseOperations(inv: RawInventory | null, selectionText: string | null): Operation[] {
  const sel = parseSelection(selectionText);
  return (inv?.operations ?? []).map((o) => {
    const s = sel.get(o.key);
    return {
      key: o.key,
      operationId: o.operation_id ?? o.key,
      method: o.method,
      path: o.path,
      summary: o.summary ?? "",
      tags: o.tags ?? [],
      semantics: o.semantics ?? "unknown",
      deprecated: !!o.deprecated,
      readHint: o.read_hint,
      support: o.support,
      include: s ? s.include : null,
      reason: s?.reason,
      graphqlName: s?.name,
      root: s?.root,
    };
  });
}

async function python(repo: string, args: string[]) {
  const file = path.join(repo, "factory", "scripts", "graphos_state.py");
  const { stdout } = await run("python3", ["-I", file, ...args], { timeout: 15000 });
  return JSON.parse(stdout);
}

export async function listWorkspaces(repo: string): Promise<GraphosState[]> {
  const dir = graphosDir(repo);
  if (!fs.existsSync(dir)) return [];
  return (await python(repo, ["list", dir, "--json"])).workspaces;
}

async function git(ws: string, args: string[]) {
  try {
    return (await run("git", args, { cwd: ws, timeout: 10000 })).stdout;
  } catch {
    return "";
  }
}

/** Spans of the schema edited by hand since the last lock, from the skill's own check. */
async function handEdits(ws: string): Promise<string[]> {
  if (!fs.existsSync(path.join(ws, ".factory", "applied.lock.yaml"))) return [];
  try {
    const out = JSON.parse(await core(ws, ["lock", ".", "--check", "--json"])) as { hand_edits?: unknown[] };
    return (out.hand_edits ?? []).map((h) => (typeof h === "string" ? h : String((h as { key?: string; span?: string }).key ?? (h as { span?: string }).span ?? JSON.stringify(h))));
  } catch {
    return []; // lock --check exits non-zero when it finds drift; the next line handles that output
  }
}

export async function readWorkspace(repo: string, name: string): Promise<Workspace> {
  const ws = workspacePath(repo, name);
  const factory = path.join(ws, ".factory");
  const state = (await python(repo, ["show", ws, "--json"])) as GraphosState;
  const meta = readText(path.join(factory, "workspace.yaml")) ?? "";
  const directory = /^directory:\s*(\S+)/m.exec(meta)?.[1];
  const inv = readJson<RawInventory>(path.join(factory, "inventory.json"));
  const schemaFile = directory ? `${directory}.graphql` : null;
  const schemaText = schemaFile ? readText(path.join(ws, schemaFile)) : null;
  const log = (await git(ws, ["log", "--pretty=format:%h\t%s\t%cI", "-n", "30"])).split("\n").filter(Boolean);
  return {
    state,
    api: {
      title: inv?.api?.title,
      version: inv?.api?.version,
      baseUrls: inv?.api?.base_urls ?? [],
      pagination: inv?.api?.pagination?.style,
    },
    operations: parseOperations(inv, readText(path.join(factory, "selection.yaml"))),
    decisions: parseDecisions(factory),
    findings: parseFindings(factory).filter((f) => (f.status ?? "current") === "current"),
    evidence: readJson(path.join(factory, "evidence", "latest.json")),
    schema: schemaFile && schemaText !== null ? { file: schemaFile, text: schemaText } : null,
    review: readText(path.join(ws, "review.md")),
    handEdits: await handEdits(ws),
    memory: readText(path.join(factory, "memory.md")),
    commits: log.map((l) => {
      const [hash, subject, date] = l.split("\t");
      return { hash, subject, date };
    }),
  };
}

/** Commit what a person's answer changed, so the next agent's `reconcile --baseline HEAD` sees it. */
async function commit(ws: string, message: string) {
  await git(ws, ["add", "-A"]);
  await git(ws, ["-c", "user.name=Forgeline", "-c", "user.email=forgeline@localhost", "commit", "-q", "-m", message]);
}

async function core(ws: string, args: string[]) {
  const env = { ...process.env, PATH: `${path.dirname(graphosBin())}:${process.env.PATH}` };
  try {
    return (await run(graphosBin(), args, { cwd: ws, env, timeout: 20000 })).stdout;
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string; message: string };
    if (args[0] === "lock" && err.stdout?.trim().startsWith("{")) return err.stdout; // --check reports drift with a non-zero exit
    throw new Error((err.stderr || err.message).trim().split("\n").slice(-3).join(" "));
  }
}

/** Include or leave out operations. Only keys the inventory lists are accepted. */
export async function setSelection(repo: string, name: string, ops: { key: string; include: boolean }[]) {
  const ws = workspacePath(repo, name);
  const inv = readJson<RawInventory>(path.join(ws, ".factory", "inventory.json"));
  const known = new Set((inv?.operations ?? []).map((o) => o.key));
  for (const o of ops) if (!known.has(o.key)) throw new Error(`Unknown operation ${o.key}.`);
  for (const include of [true, false]) {
    const keys = ops.filter((o) => o.include === include).map((o) => o.key);
    if (keys.length) await core(ws, ["selection", "set", ".", ...keys.flatMap((k) => ["--op", k]), "--include", String(include)]);
  }
  await commit(ws, "select: change scope");
}

/** Answer an open decision with one or more of its own choices. */
export async function resolveDecision(repo: string, name: string, id: string, chosen: string[], note?: string) {
  const ws = workspacePath(repo, name);
  if (!DECISION_ID.test(id)) throw new Error("Bad decision id.");
  const d = parseDecisions(path.join(ws, ".factory")).find((x) => x.id === id);
  if (!d) throw new Error(`No decision ${id}.`);
  if (d.status !== "open") throw new Error(`${id} is already ${d.status}.`);
  if (chosen.length === 0) throw new Error("Pick an answer.");
  if (chosen.length > 1 && !d.multiple) throw new Error("This question takes one answer.");
  const ids = new Set(d.choices.map((c) => c.id));
  for (const c of chosen) if (!ids.has(c)) throw new Error(`${c} is not a choice for ${id}.`);
  await core(ws, ["decisions", "resolve", ".", "--id", id, ...chosen.flatMap((c) => ["--chosen", c]), ...(note?.trim() ? ["--note", note.trim().slice(0, 500)] : []), "--by", "user"]);
  await commit(ws, `decide: ${d.title.slice(0, 60)}`);
}
