// Plain-language text for what an agent is doing, and which tool errors are just a retry.

const base = (p: string) => p.split("/").filter(Boolean).at(-1) ?? p;
const firstPath = (t: string) => t.match(/(?:^|\s)((?:\/|\.\/|\.\.\/)?[\w@.-]+(?:\/[\w@.-]+)+\.\w+)/)?.[1];

/** "Editing index.js", "Running tests", ... from a tool name and the text the log keeps for it. */
export function describeAction(tool: string, text: string): string {
  const t = (text ?? "").trim();
  switch (tool) {
    case "Edit": case "MultiEdit": case "NotebookEdit": return `Editing ${base(t) || "a file"}`;
    case "Write": return `Writing ${base(t) || "a file"}`;
    case "Read": return `Reading ${base(t) || "a file"}`;
    case "Grep": case "Glob": return "Searching the code";
    case "WebFetch": case "WebSearch": return "Looking something up";
    case "Skill": return `Using skill ${t || ""}`.trim();
    case "Task": case "Agent": return "Handing work to an agent";
    case "TodoWrite": return "Updating its to-do list";
    case "Bash": break;
    default: if (!tool) return t.length > 40 ? `${t.slice(0, 38)}…` : t;
  }
  const c = t.toLowerCase();
  if (/(^|[\s;&|])(npm|pnpm|yarn)\s+(run\s+)?test|\bpytest\b|\bava\b|node --.*--test|run_evals|\bvitest\b|\bjest\b/.test(c)) return "Running tests";
  if (/\btsc\b|typecheck/.test(c)) return "Type-checking";
  if (/\bxo\b|eslint|\blint\b|prettier/.test(c)) return "Linting";
  if (/npm (install|ci)|pnpm install|yarn install|pip install/.test(c)) return "Installing packages";
  if (/git worktree/.test(c)) return "Setting up a worktree";
  if (/git commit/.test(c)) return "Committing";
  if (/git (diff|log|status|show)/.test(c)) return "Checking git";
  if (/git (merge|rebase)/.test(c)) return "Merging";
  if (/jobctl|merge_gate|snapshot_audit|policy_check|review_branch/.test(c)) return "Updating job state";
  if (/agent-browser/.test(c)) return "Checking the UI in a browser";
  if (/curl |wget /.test(c)) return "Making a web request";
  if (/\bmkdir\b|\bcp\b|\bmv\b|\brm\b/.test(c)) return "Moving files around";
  const file = firstPath(t);
  if (/^(cat|head|tail|sed|ls|find|grep|rg)\b/.test(c)) return file ? `Looking at ${base(file)}` : "Looking around the repo";
  const word = t.split(/\s+/)[0]?.replace(/^.*\//, "");
  return word ? `Running ${word}` : "Working";
}

/** Errors an agent recovers from on its own (it re-reads the file and tries again); not worth a red mark. */
export function isRetry(errorText: string | undefined): boolean {
  if (!errorText) return false;
  return /<tool_use_error>/.test(errorText) || /File has not been read yet|File has been modified since read|String to replace not found/.test(errorText);
}

export function retryNote(errorText: string): string {
  const m = errorText.replace(/<\/?tool_use_error>/g, "").trim();
  if (/not been read yet/.test(m)) return "Retried: it had to read the file first";
  if (/modified since read/.test(m)) return "Retried: the file changed, so it re-read it";
  if (/not found/.test(m)) return "Retried: the text to replace was not found";
  return `Retried: ${m.split("\n")[0].slice(0, 80)}`;
}
