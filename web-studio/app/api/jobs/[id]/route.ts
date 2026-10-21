import { fail, json, repoFrom } from "@/lib/http";
import { jobChanges, jobFile } from "@/lib/jobchanges";
import { listJobFiles, readJobFile } from "@/lib/jobs";

export const dynamic = "force-dynamic";

/** GET ?repo=…                       -> list of markdown files
 *  GET ?repo=…&file=a.md             -> that file's text
 *  GET ?repo=…&changes=1             -> the code the job changed: files, line counts, commits
 *  GET ?repo=…&changes=1&file=a/b.ts -> that file before and after (only files in the change) */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const repo = repoFrom(req);
    const params = new URL(req.url).searchParams;
    const file = params.get("file");
    if (params.get("changes")) return json(file ? await jobFile(repo, id, file) : await jobChanges(repo, id));
    if (!file) return json({ files: listJobFiles(repo, id) });
    const text = readJobFile(repo, id, file);
    return text === null ? json({ error: "Not found." }, 404) : json({ file, text });
  } catch (e) {
    return fail(e);
  }
}
