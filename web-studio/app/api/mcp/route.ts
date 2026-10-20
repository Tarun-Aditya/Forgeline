import { fail, json, repoFrom } from "@/lib/http";
import { listMcp } from "@/lib/mcp";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    return json({ servers: listMcp(repoFrom(req)) });
  } catch (e) {
    return fail(e);
  }
}
