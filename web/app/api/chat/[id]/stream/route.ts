import { createUIMessageStreamResponse } from "ai";
import { followRun } from "@/lib/runner";
import { readMeta } from "@/lib/runs";

export const dynamic = "force-dynamic";

/** Used by useChat({ id: runId, resume: true }): replays the run's log, then follows it. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!readMeta(id)) return new Response(null, { status: 204 });
  return createUIMessageStreamResponse({ stream: followRun(id) });
}
