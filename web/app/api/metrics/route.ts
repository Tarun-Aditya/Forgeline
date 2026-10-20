import { execFileSync } from "node:child_process";
import path from "node:path";
import { fail, json, repoFrom } from "@/lib/http";
import { runMetrics } from "@/lib/metrics";
import { externalCost } from "@/lib/external";
import { mergeCosts } from "@/lib/agentcost";
import { repoCost } from "@/lib/runcost";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
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
    return json({ factory, usage: runMetrics(), byAgent: mergeCosts(repoCost(repo), await externalCost(repo)) });
  } catch (e) {
    return fail(e);
  }
}
