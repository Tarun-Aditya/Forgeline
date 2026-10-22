import { fail, json, repoFrom } from "@/lib/http";
import { demoStatus, startDemo, stopDemo } from "@/lib/graphosdemo";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    return json(await demoStatus(repoFrom(req)));
  } catch (e) {
    return fail(e);
  }
}

/** { action: "start", version: 1 | 2 } or { action: "stop" } */
export async function POST(req: Request) {
  try {
    const repo = repoFrom(req);
    const body = (await req.json()) as { action?: string; version?: number };
    if (body.action === "start") {
      if (body.version !== 1 && body.version !== 2) throw new Error("version must be 1 or 2.");
      return json(await startDemo(repo, body.version));
    }
    if (body.action === "stop") {
      stopDemo();
      return json(await demoStatus(repo));
    }
    throw new Error("Unknown action.");
  } catch (e) {
    return fail(e);
  }
}
