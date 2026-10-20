import { fail, json } from "@/lib/http";
import { addRepo, listRepos } from "@/lib/repos";

export const dynamic = "force-dynamic";

export const GET = () => json({ repos: listRepos() });

export async function POST(req: Request) {
  try {
    const { path } = (await req.json()) as { path?: string };
    if (!path) throw new Error("path is required.");
    return json({ repo: addRepo(path) });
  } catch (e) {
    return fail(e);
  }
}
