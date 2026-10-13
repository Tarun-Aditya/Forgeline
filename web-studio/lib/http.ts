import { resolveRepo } from "./repos.ts";

export const json = (body: unknown, status = 200) => Response.json(body, { status });

/** Repo from `?repo=`, validated against the allowed list. */
export function repoFrom(req: Request): string {
  return resolveRepo(new URL(req.url).searchParams.get("repo") ?? undefined);
}

export function fail(e: unknown, status = 400) {
  return json({ error: e instanceof Error ? e.message : "Request failed." }, status);
}
