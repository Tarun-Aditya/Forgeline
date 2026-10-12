// What each agent handed to the next, read from the files the factory writes into the job folder.
// Pure: give it the files' text and it returns short labels keyed "from>to" (or an agent name for a note on that agent).

const LENSES = ["security", "ux", "ui", "code"] as const;

/** List items (1. or -) under the first `## heading` that matches, up to the next `## `. */
function items(md: string | undefined, heading: RegExp): string[] {
  if (!md) return [];
  const out: string[] = [];
  let inside = false;
  for (const line of md.split("\n")) {
    if (/^##\s/.test(line)) {
      if (inside) break;
      inside = heading.test(line.replace(/^##\s+/, ""));
      continue;
    }
    if (inside && /^(\d+\.|[-*])\s/.test(line)) out.push(line);
  }
  return out;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export type JobFiles = { text: Record<string, string | undefined>; round: number; verdicts: Partial<Record<(typeof LENSES)[number], string>> };

export function computeHandoffs({ text, round, verdicts }: JobFiles): Record<string, string> {
  const out: Record<string, string> = {};
  const success = items(text["intent.md"], /^success criteria/i).length;
  if (success) out["intent-writer>spec-writer"] = `intent: ${plural(success, "success criterion", "success criteria")}`;

  const accept = items(text["spec.md"], /^acceptance criteria/i).length;
  const reqs = items(text["spec.md"], /^requirements/i).length;
  if (accept) out["spec-writer>planner"] = `spec: ${plural(accept, "acceptance criterion", "acceptance criteria")}`;
  else if (reqs) out["spec-writer>planner"] = `spec: ${plural(reqs, "requirement")}`;

  const steps = items(text["plan.md"], /^steps/i).length;
  if (steps) out["planner>builder"] = `plan: ${plural(steps, "step")}`;

  const crit = items(text["build.md"], /^acceptance criteria/i);
  if (crit.length) {
    const done = crit.filter((l) => /\[x\]/i.test(l)).length;
    out["builder>reviewers"] = `${round > 0 ? `round ${round} · ` : ""}${done}/${crit.length} criteria checked`;
  }
  for (const lens of LENSES) {
    const v = verdicts[lens];
    if (v) out[`reviewer-${lens}>approver`] = v;
  }
  const decision = text["decision.md"]?.trim().split(/\s/)[0]?.toUpperCase();
  if (decision === "APPROVE" || decision === "ESCALATE") out["approver"] = decision === "APPROVE" ? "approved" : "sent to a person";
  return out;
}
