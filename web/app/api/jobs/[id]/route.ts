import { fail, json, repoFrom } from "@/lib/http";
import { listJobFiles, readJobFile } from "@/lib/jobs";
import { jobDiff, validationSection } from "@/lib/jobdiff";
import { jobHandoffs } from "@/lib/jobsummary";
import { repoCost } from "@/lib/runcost";

export const dynamic = "force-dynamic";

/** GET ?repo=…            -> list of markdown files
 *  GET ?repo=…&file=a.md  -> that file's text
 *  GET ?repo=…&diff=1     -> the job's code change (branch or merge commit) and the builder's validation notes
 *  GET ?repo=…&cost=1     -> estimated cost per agent over the job's finished runs
 *  GET ?repo=…&handoffs=1 -> short labels for what each agent passed on */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const repo = repoFrom(req);
    const params = new URL(req.url).searchParams;
    if (params.get("diff")) return json({ diff: await jobDiff(repo, id), validation: validationSection(readJobFile(repo, id, "build.md")) });
    if (params.get("cost")) return json({ cost: repoCost(repo, id) });
    if (params.get("handoffs")) return json({ handoffs: jobHandoffs(repo, id) });
    const file = params.get("file");
    if (!file) return json({ files: listJobFiles(repo, id) });
    const text = readJobFile(repo, id, file);
    return text === null ? json({ error: "Not found." }, 404) : json({ file, text });
  } catch (e) {
    return fail(e);
  }
}
