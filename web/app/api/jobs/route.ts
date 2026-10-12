import { fail, json, repoFrom } from "@/lib/http";
import { listJobs, STAGES } from "@/lib/jobs";
import { activeRuns } from "@/lib/runner";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const repo = repoFrom(req);
    return json({ jobs: listJobs(repo), stages: STAGES, active: activeRuns().filter((r) => r.repo === repo) });
  } catch (e) {
    return fail(e);
  }
}
