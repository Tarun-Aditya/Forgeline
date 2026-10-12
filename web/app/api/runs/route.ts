import { fail, json } from "@/lib/http";
import { listJobs } from "@/lib/jobs";
import { resolveRepo } from "@/lib/repos";
import { launchRun } from "@/lib/runner";
import { lastMessage, listMeta, statusOf } from "@/lib/runs";
import { parseLog } from "@/lib/runs";

export const dynamic = "force-dynamic";

/** Recent runs with their state. A run whose process vanished without a result shows as lost. */
export function GET() {
  const runs = listMeta().slice(0, 50).map((m) => {
    const { status, record } = statusOf(m);
    const sessionId = record?.sessionId ?? parseLog(m.runId).sessionId;
    // While a run is going, its jobs are the ones it named plus any job that appeared since it started.
    const created = status === "running" ? listJobs(m.repo).map((j) => j.id).filter((id) => !m.before.includes(id)) : [];
    return {
      runId: m.runId, repo: m.repo, prompt: m.prompt, startedAt: m.startedAt, status,
      jobIds: record?.jobIds ?? [...new Set([...(m.key ? [m.key] : []), ...created])],
      costUsd: record?.costUsd, durationMs: record?.durationMs, sessionId,
      message: status === "running" ? undefined : lastMessage(m.runId),
    };
  });
  return json({ runs });
}

/** Start a run and return its id at once. Follow it with the stream route; any number can run together. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { repo?: string; text?: string; type?: "feature" | "bugfix"; ticket?: string; mcp?: string[] };
    const runId = launchRun({
      repo: resolveRepo(body.repo),
      text: body.text ?? "",
      type: body.type,
      ticket: body.ticket,
      mcp: Array.isArray(body.mcp) ? body.mcp : undefined,
    });
    return json({ runId });
  } catch (e) {
    return fail(e);
  }
}
