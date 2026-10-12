import { feed, status } from "@/lib/activity";
import { fail, json, repoFrom } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET ?repo=…[&job=…] -> { sessions, events } from the shared hook-written activity log. */
export async function GET(req: Request) {
  try {
    const repo = repoFrom(req);
    const params = new URL(req.url).searchParams;
    const job = params.get("job");
    const limit = Math.min(Math.max(Number(params.get("limit")) || 150, 1), 2000);
    const [sessions, events] = await Promise.all([status(repo), feed(repo, job, limit)]);
    return json({ sessions, events });
  } catch (e) {
    return fail(e);
  }
}
