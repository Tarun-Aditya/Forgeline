import { computeHandoffs, type JobFiles } from "./handoffs.ts";
import { listJobFiles, readJobFile } from "./jobs.ts";

/** Read the job folder (latest review round only) and compute the hand-off labels. */
export function jobHandoffs(repo: string, id: string): Record<string, string> {
  const files = listJobFiles(repo, id);
  const text: JobFiles["text"] = {};
  for (const f of ["intent.md", "spec.md", "plan.md", "build.md", "decision.md"]) if (files.includes(f)) text[f] = readJobFile(repo, id, f) ?? undefined;
  const rounds = [...new Set(files.map((f) => /^round-(\d+)\//.exec(f)?.[1]).filter((n): n is string => !!n))].map(Number).sort((a, b) => a - b);
  const round = rounds.at(-1) ?? 0;
  const verdicts: JobFiles["verdicts"] = {};
  for (const lens of ["security", "ux", "ui", "code"] as const) {
    const t = round ? readJobFile(repo, id, `round-${round}/review-${lens}.md`) : null;
    const v = t && /^VERDICT:\s*(\w+)/m.exec(t)?.[1];
    if (v) verdicts[lens] = v.toUpperCase();
  }
  return computeHandoffs({ text, round, verdicts });
}
