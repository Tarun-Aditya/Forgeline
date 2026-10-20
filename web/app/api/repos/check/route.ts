import { fail, json, repoFrom } from "@/lib/http";
import { checkRepo } from "@/lib/repocheck";

export const dynamic = "force-dynamic";

/** GET ?repo=… -> { warnings } for the repo's state (dirty tree, wrong branch, missing docs). */
export async function GET(req: Request) {
  try {
    return json({ warnings: await checkRepo(repoFrom(req)) });
  } catch (e) {
    return fail(e);
  }
}
