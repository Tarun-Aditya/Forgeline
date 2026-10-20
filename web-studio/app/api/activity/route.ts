import { feed, status } from "@/lib/activity";
import { fail, json, repoFrom } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET ?repo=…[&job=…] -> { sessions, events } from the shared hook-written activity log. */
export async function GET(req: Request) {
  try {
    const repo = repoFrom(req);
    const job = new URL(req.url).searchParams.get("job");
    const [sessions, events] = await Promise.all([status(repo), feed(repo, job)]);
    return json({ sessions, events });
  } catch (e) {
    return fail(e);
  }
}
