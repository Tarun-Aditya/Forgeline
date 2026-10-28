import { fail, json, repoFrom } from "@/lib/http";
import { readWorkspace, resolveDecision, setSelection } from "@/lib/graphos";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await ctx.params;
    return json(await readWorkspace(repoFrom(req), name));
  } catch (e) {
    return fail(e);
  }
}

/** A person's choices, applied with the skill's own CLI:
 *  { action: "selection", ops: [{ key, include }] }
 *  { action: "resolve", id, chosen: [choiceId], note? } */
export async function POST(req: Request, ctx: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await ctx.params;
    const repo = repoFrom(req);
    const body = (await req.json()) as { action?: string; ops?: { key: string; include: boolean }[]; id?: string; chosen?: string[]; note?: string };
    if (body.action === "selection") {
      if (!Array.isArray(body.ops) || body.ops.some((o) => typeof o?.key !== "string" || typeof o?.include !== "boolean")) throw new Error("ops must be [{ key, include }].");
      await setSelection(repo, name, body.ops);
    } else if (body.action === "resolve") {
      if (typeof body.id !== "string" || !Array.isArray(body.chosen) || body.chosen.some((c) => typeof c !== "string")) throw new Error("id and chosen are required.");
      await resolveDecision(repo, name, body.id, body.chosen, typeof body.note === "string" ? body.note : undefined);
    } else {
      throw new Error("Unknown action.");
    }
    return json(await readWorkspace(repo, name));
  } catch (e) {
    return fail(e);
  }
}
