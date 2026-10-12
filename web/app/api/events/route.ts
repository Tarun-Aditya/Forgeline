import { fail, repoFrom } from "@/lib/http";
import { watchRepo } from "@/lib/changes";

export const dynamic = "force-dynamic";

/** GET ?repo=… -> server-sent events: `change` with {topic} whenever jobs, activity or runs change on disk. */
export function GET(req: Request) {
  let repo: string;
  try {
    repo = repoFrom(req);
  } catch (e) {
    return fail(e);
  }
  const enc = new TextEncoder();
  let stop = () => {};
  let beat: NodeJS.Timeout | undefined;
  const stream = new ReadableStream({
    start(controller) {
      const send = (s: string) => { try { controller.enqueue(enc.encode(s)); } catch { stop(); } };
      send("retry: 3000\n\n: connected\n\n");
      const close = watchRepo(repo, (topic) => send(`event: change\ndata: ${JSON.stringify({ topic })}\n\n`));
      beat = setInterval(() => send(": ping\n\n"), 20000);
      stop = () => { close(); if (beat) clearInterval(beat); try { controller.close(); } catch { /* already closed */ } };
      req.signal.addEventListener("abort", stop);
    },
    cancel() { stop(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
