import { json } from "@/lib/http";
import { listMeta, statusOf } from "@/lib/runs";
import { parseLog } from "@/lib/runs";

export const dynamic = "force-dynamic";

/** Recent runs with their state. A run whose process vanished without a result shows as lost. */
export function GET() {
  const runs = listMeta().slice(0, 50).map((m) => {
    const { status, record } = statusOf(m);
    const sessionId = record?.sessionId ?? parseLog(m.runId).sessionId;
    return {
      runId: m.runId, repo: m.repo, prompt: m.prompt, startedAt: m.startedAt, status,
      jobIds: record?.jobIds ?? (m.key ? [m.key] : []),
      costUsd: record?.costUsd, durationMs: record?.durationMs, sessionId,
    };
  });
  return json({ runs });
}
