import { fail, json, repoFrom } from "@/lib/http";
import { listJobs, STAGES } from "@/lib/jobs";
import { pendingQuestions } from "@/lib/questions";
import { activeRuns } from "@/lib/runner";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const repo = repoFrom(req);
    const jobs = listJobs(repo);
    const active = activeRuns().filter((r) => r.repo === repo);
    return json({ jobs, stages: STAGES, active, questions: pendingQuestions(repo, jobs) });
  } catch (e) {
    return fail(e);
  }
}
