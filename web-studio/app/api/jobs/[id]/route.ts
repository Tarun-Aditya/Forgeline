import { fail, json, repoFrom } from "@/lib/http";
import { listJobFiles, readJobFile } from "@/lib/jobs";

export const dynamic = "force-dynamic";

/** GET ?repo=…            -> list of markdown files
 *  GET ?repo=…&file=a.md  -> that file's text */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const repo = repoFrom(req);
    const file = new URL(req.url).searchParams.get("file");
    if (!file) return json({ files: listJobFiles(repo, id) });
    const text = readJobFile(repo, id, file);
    return text === null ? json({ error: "Not found." }, 404) : json({ file, text });
  } catch (e) {
    return fail(e);
  }
}
