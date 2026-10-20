import { listAgents } from "@/lib/agents";
import { fail, json, repoFrom } from "@/lib/http";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    return json({ agents: listAgents(repoFrom(req)) });
  } catch (e) {
    return fail(e);
  }
}
