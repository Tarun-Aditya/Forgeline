import { fail, json, repoFrom } from "@/lib/http";
import { GRAPHOS_STAGES, listWorkspaces } from "@/lib/graphos";

export const dynamic = "force-dynamic";

/** GraphOS workspaces under graphos/, each with the stage and next agent graphos_state.py works out. */
export async function GET(req: Request) {
  try {
    return json({ workspaces: await listWorkspaces(repoFrom(req)), stages: GRAPHOS_STAGES });
  } catch (e) {
    return fail(e);
  }
}
