import { execFileSync } from "node:child_process";
import path from "node:path";
import { fail, json, repoFrom } from "@/lib/http";
import { runMetrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const repo = repoFrom(req);
    let factory: unknown = null;
    try {
      factory = JSON.parse(
        execFileSync("python3", [path.join(repo, "factory/scripts/metrics.py"), "--factory", path.join(repo, "factory"), "--json"], {
          encoding: "utf8",
          timeout: 15000,
        }),
      );
    } catch {
      /* repo without metrics.py: usage numbers still work */
    }
    return json({ factory, usage: runMetrics() });
  } catch (e) {
    return fail(e);
  }
}
