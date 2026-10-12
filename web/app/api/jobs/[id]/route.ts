import { fail, json, repoFrom } from "@/lib/http";
import { listJobFiles, readJobFile } from "@/lib/jobs";
import { jobHandoffs } from "@/lib/jobsummary";

export const dynamic = "force-dynamic";

/** GET ?repo=…            -> list of markdown files
 *  GET ?repo=…&file=a.md  -> that file's text
 *  GET ?repo=…&handoffs=1 -> short labels for what each agent passed on */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const repo = repoFrom(req);
    const params = new URL(req.url).searchParams;
    if (params.get("handoffs")) return json({ handoffs: jobHandoffs(repo, id) });
    const file = params.get("file");
    if (!file) return json({ files: listJobFiles(repo, id) });
    const text = readJobFile(repo, id, file);
    return text === null ? json({ error: "Not found." }, 404) : json({ file, text });
  } catch (e) {
    return fail(e);
  }
}
