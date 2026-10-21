"use client";
// The code a job changed, inside the job: the changed files, each one as a diff or as the finished code,
// and the commits. The editor is Monaco (the engine behind VS Code), served from /monaco so it works offline.
import { DiffEditor, Editor, loader } from "@monaco-editor/react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { usePoll } from "@/components/use-poll";
import { addedLines } from "@/lib/linediff";
import type { ChangedFile, FileVersions, JobChanges } from "@/lib/jobchanges";
import { cn } from "@/lib/utils";

loader.config({ paths: { vs: "/monaco/vs" } });

const LANG: Record<string, string> = { ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", mjs: "javascript", json: "json", css: "css", md: "markdown", py: "python", html: "html", yml: "yaml", yaml: "yaml", sh: "shell", go: "go", rs: "rust", java: "java", sql: "sql", graphql: "graphql" };
const languageOf = (p: string) => LANG[p.split(".").pop() ?? ""] ?? "plaintext";

const isRecord = (p: string) => p.startsWith("factory/audit/") || p.startsWith("docs/");
const isTest = (p: string) => /\.(test|spec)\.|(^|\/)tests?\//.test(p);
const groupOf = (p: string) => (isRecord(p) ? "the record" : p.includes("/") ? p.split("/")[0] + "/" : "(root)");

/** Code first, tests after it, the record the factory wrote last. */
function grouped(files: ChangedFile[]) {
  const rank = (f: ChangedFile) => (isRecord(f.path) ? 2 : 0) + (isTest(f.path) ? 1 : 0);
  const sorted = [...files].sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));
  const out: { name: string; files: ChangedFile[] }[] = [];
  for (const f of sorted) {
    const name = groupOf(f.path);
    const g = out.find((x) => x.name === name);
    if (g) g.files.push(f);
    else out.push({ name, files: [f] });
  }
  return out.sort((a, b) => Number(a.name === "the record") - Number(b.name === "the record"));
}

const STATUS_COLOR = { A: "text-emerald-400", M: "text-amber-300", D: "text-red-400" } as const;

function useDark() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const q = window.matchMedia("(prefers-color-scheme: dark)");
    const set = () => setDark(q.matches || document.documentElement.classList.contains("dark"));
    set();
    q.addEventListener("change", set);
    return () => q.removeEventListener("change", set);
  }, []);
  return dark;
}

function Toggle<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; text: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 rounded-full bg-muted/40 p-0.5">
      {options.map((o) => (
        <Button key={o.id} size="sm" variant={o.id === value ? "default" : "ghost"} aria-pressed={o.id === value} onClick={() => onChange(o.id)}>{o.text}</Button>
      ))}
    </div>
  );
}

export function CodeChanges({ repo, job }: { repo: string; job: string }) {
  const q = encodeURIComponent(repo);
  const base = `/api/jobs/${encodeURIComponent(job)}?repo=${q}&changes=1`;
  const { data, error } = usePoll<JobChanges>(base, 5000);
  const [picked, setPicked] = useState<string | null>(null);
  const [view, setView] = useState<"diff" | "code">("diff");
  const [layout, setLayout] = useState<"split" | "inline">("split");
  const dark = useDark();

  const files = data?.files ?? [];
  const groups = useMemo(() => grouped(files), [files]);
  // Until one is picked, start on the first file in reading order (code first), not the first git lists.
  const current = files.find((f) => f.path === picked) ?? groups[0]?.files[0];
  // Refetch a file when its line counts change (the branch moved on), not on every poll.
  const fileKey = current ? `${current.path}:${current.added}:${current.deleted}` : null;
  const [versions, setVersions] = useState<FileVersions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    if (!current) return;
    let stop = false;
    setLoadError(null);
    fetch(`${base}&file=${encodeURIComponent(current.path)}`, { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        if (!stop) setVersions(body);
      })
      .catch((e) => !stop && setLoadError(e instanceof Error ? e.message : "Could not load the file."));
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileKey, base]);

  const shown = versions && current && versions.path === current.path ? versions : null;
  const marks = useMemo(() => (shown && shown.status !== "D" ? addedLines(shown.original, shown.modified) : null), [shown]);
  const totals = files.reduce((a, f) => ({ add: a.add + (f.added ?? 0), del: a.del + (f.deleted ?? 0) }), { add: 0, del: 0 });
  const theme = dark ? "vs-dark" : "light";
  const common = { readOnly: true, minimap: { enabled: false }, automaticLayout: true, fontSize: 13, lineHeight: 20, scrollBeyondLastLine: false, renderOverviewRuler: false } as const;

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Reading the change…</p>;
  if (data.source === "none")
    return <p className="text-sm text-muted-foreground">No code yet. The builder works on <span className="font-mono">factory/{job}</span>; its changes show here as soon as it has committed.</p>;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-body-sm">
        <span className="text-muted-foreground">
          {data.source === "branch" ? <>On branch <span className="font-mono">factory/{job}</span></> : <>Merged into main</>} · {files.length} file{files.length === 1 ? "" : "s"} · <span className="text-emerald-400">+{totals.add}</span> <span className="text-red-400">−{totals.del}</span> · {data.commits.length} commit{data.commits.length === 1 ? "" : "s"}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {view === "diff" && <Toggle label="Diff layout" value={layout} onChange={setLayout} options={[{ id: "split", text: "Side by side" }, { id: "inline", text: "Inline" }]} />}
          <Toggle label="View" value={view} onChange={setView} options={[{ id: "diff", text: "Diff" }, { id: "code", text: "Code" }]} />
        </span>
      </div>
      <div className="flex min-h-0 flex-1 gap-3">
        <nav aria-label="Changed files" className="w-64 shrink-0 space-y-3 overflow-y-auto text-sm">
          {groups.map((g) => (
            <div key={g.name}>
              <p className="px-2 pb-1 font-mono text-caption text-muted-foreground">{g.name}</p>
              {g.files.map((f) => (
                <button key={f.path} data-path={f.path} onClick={() => setPicked(f.path)} aria-current={f.path === current?.path}
                  className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1 text-left font-mono text-caption hover:bg-muted/50", f.path === current?.path && "bg-muted")}>
                  <span className={cn("w-3 text-center font-bold", STATUS_COLOR[f.status])}>{f.status}</span>
                  <span className="min-w-0 flex-1 truncate" title={f.path}>{f.path.split("/").slice(isRecord(f.path) ? -1 : 1).join("/") || f.path}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground"><span className="text-emerald-400">+{f.added ?? "·"}</span> <span className="text-red-400">−{f.deleted ?? "·"}</span></span>
                </button>
              ))}
            </div>
          ))}
          <div>
            <p className="px-2 pb-1 font-mono text-caption text-muted-foreground">commits</p>
            <ul className="space-y-1 px-2 font-mono text-[11px] text-muted-foreground">
              {data.commits.map((c) => <li key={c.hash} className="flex gap-2"><span className="shrink-0 text-emerald-400">{c.hash}</span><span className="break-words">{c.subject}</span></li>)}
            </ul>
          </div>
        </nav>
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-background">
          <div className="flex h-8 items-center gap-2 border-b border-border px-3 font-mono text-caption">
            <span className="truncate">{current?.path}</span>
            {current && <span className="text-muted-foreground">{current.status === "A" ? "new file" : current.status === "D" ? "deleted" : "modified"}</span>}
          </div>
          <div className="h-[calc(100%-2rem)]">
            {loadError ? <p className="p-3 text-sm text-destructive">{loadError}</p>
              : !shown ? <p className="p-3 text-sm text-muted-foreground">Loading…</p>
              : shown.binary ? <p className="p-3 text-sm text-muted-foreground">Binary file: no text to show.</p>
              : view === "diff" ? (
                <DiffEditor key={`d:${shown.path}:${layout}`} height="100%" theme={theme} language={languageOf(shown.path)} original={shown.original} modified={shown.modified}
                  originalModelPath={`original/${shown.path}`} modifiedModelPath={`modified/${shown.path}`}
                  options={{ ...common, renderSideBySide: layout === "split", useInlineViewWhenSpaceIsLimited: false, originalEditable: false }} />
              ) : (
                <Editor key={`c:${shown.path}`} height="100%" theme={theme} language={languageOf(shown.path)} path={`code/${shown.path}`}
                  value={shown.status === "D" ? shown.original : shown.modified} options={common}
                  onMount={(editor, monaco) => {
                    if (!marks?.length) return;
                    editor.createDecorationsCollection(marks.map((l) => ({ range: new monaco.Range(l, 1, l, 1), options: { isWholeLine: true, className: "fl-added-line", linesDecorationsClassName: "fl-added-gutter" } })));
                    editor.revealLineNearTop(Math.max(1, marks[0] - 3));
                  }} />
              )}
          </div>
        </div>
      </div>
      {view === "code" && shown && !shown.binary && (
        <p className="text-caption text-muted-foreground">
          {shown.status === "D" ? "This file was deleted; showing it as it was." : marks === null ? "The finished file. (Too much changed to mark the new lines.)" : "The finished file, with the lines this job added or changed marked in green."}
          {shown.truncated && " Shown truncated."}
        </p>
      )}
    </div>
  );
}
