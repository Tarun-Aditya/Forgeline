import { externalSessions } from "@/lib/external";
import { fail, json, repoFrom } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET ?repo=… -> sessions started outside the web app (terminal, VS Code, desktop), newest first. */
export async function GET(req: Request) {
  try {
    const sessions = (await externalSessions(repoFrom(req))).sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
    return json({ sessions });
  } catch (e) {
    return fail(e);
  }
}
