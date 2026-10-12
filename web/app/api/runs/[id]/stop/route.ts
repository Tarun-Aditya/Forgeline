import { json } from "@/lib/http";
import { stopRun } from "@/lib/runner";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return stopRun(id) ? json({ stopped: true }) : json({ error: "No such running run." }, 404);
}
