"use client";
import { useState } from "react";
import { MessageResponse } from "@/components/ai-elements/message";
import { usePoll } from "@/components/use-poll";
import { cn } from "@/lib/utils";
import type { JobDiff } from "@/lib/jobdiff";

const MAX_LINES = 400;

type Block = { file: string; lines: string[] };

/** Split a unified diff into one block per file (without the `diff --git` / `index` preamble). */
export function splitPatch(patch: string): Block[] {
  const blocks: Block[] = [];
  for (const line of patch.split("\n")) {
    if (line.startsWith("diff --git ")) {
      blocks.push({ file: line.split(" b/").at(-1) ?? line, lines: [] });
      continue;
    }
    const cur = blocks.at(-1);
    if (!cur || /^(index |--- |\+\+\+ |new file|deleted file|similarity|rename )/.test(line)) continue;
    cur.lines.push(line);
  }
  return blocks;
}

function FileBlock({ block, stat }: { block: Block; stat?: { added: number | null; deleted: number | null } }) {
  const [all, setAll] = useState(false);
  const shown = all ? block.lines : block.lines.slice(0, MAX_LINES);
  return (
    <details className="rounded-md border" open={block.lines.length <= 120}>
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-1.5 font-mono text-xs">
        <span className="min-w-0 flex-1 truncate">{block.file}</span>
        {stat && <span className="text-ok">+{stat.added ?? "?"}</span>}
        {stat && <span className="text-destructive">−{stat.deleted ?? "?"}</span>}
      </summary>
      <pre className="overflow-x-auto border-t py-1 font-mono text-[11px] leading-relaxed">
        {shown.map((l, i) => (
          <div key={i} className={cn("px-3", l.startsWith("+") && "bg-ok/10 text-ok", l.startsWith("-") && "bg-destructive/10 text-destructive", l.startsWith("@@") && "text-muted-foreground")}>{l || " "}</div>
        ))}
      </pre>
      {!all && block.lines.length > MAX_LINES && (
        <button className="w-full border-t py-1 text-xs text-muted-foreground hover:bg-accent" onClick={() => setAll(true)}>Show all {block.lines.length} lines</button>
      )}
    </details>
  );
}

/** What the job changed in the code, and what the builder says it ran to check it. */
export function DiffView({ repo, job }: { repo: string; job: string }) {
  const { data, error } = usePoll<{ diff: JobDiff; validation: string }>(`/api/jobs/${encodeURIComponent(job)}?repo=${encodeURIComponent(repo)}&diff=1`, 10000, "jobs");
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading the change…</p>;
  const { diff, validation } = data;
  const added = diff.files.reduce((n, f) => n + (f.added ?? 0), 0);
  const deleted = diff.files.reduce((n, f) => n + (f.deleted ?? 0), 0);
  const stats = new Map(diff.files.map((f) => [f.file, f]));
  return (
    <div className="space-y-4">
      {validation && (
        <section>
          <h3 className="mb-1 text-sm font-medium">Checks the builder ran</h3>
          <div className="rounded-md border bg-muted/30 p-3 text-sm"><MessageResponse>{validation}</MessageResponse></div>
        </section>
      )}
      <section className="space-y-2">
        <h3 className="text-sm font-medium">
          Code change
          {diff.source !== "none" && (
            <span className="ml-2 font-normal text-muted-foreground">
              {diff.files.length} file{diff.files.length === 1 ? "" : "s"} · <span className="text-ok">+{added}</span> <span className="text-destructive">−{deleted}</span> · {diff.source === "merge" ? "from the merge commit on main" : "on the job branch, not merged yet"}
            </span>
          )}
        </h3>
        {diff.source === "none" ? (
          <p className="text-sm text-muted-foreground">No code change yet. It appears here once the builder commits to the job branch.</p>
        ) : (
          splitPatch(diff.patch).map((b) => <FileBlock key={b.file} block={b} stat={stats.get(b.file)} />)
        )}
        {diff.truncated && <p className="text-xs text-warn">The change is large, so only the first part is shown.</p>}
      </section>
    </div>
  );
}
