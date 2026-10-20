import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { fail } from "@/lib/http";
import { resolveRepo } from "@/lib/repos";
import { startRun } from "@/lib/runner";

export const dynamic = "force-dynamic";

type Body = {
  messages: UIMessage[];
  repo?: string;
  type?: "feature" | "bugfix";
  ticket?: string;
  mcp?: string[];
  answer?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const last = body.messages.filter((m) => m.role === "user").at(-1);
    const text = last?.parts.map((p) => (p.type === "text" ? p.text : "")).join("") ?? "";
    const stream = startRun({
      repo: resolveRepo(body.repo),
      text,
      type: body.type,
      ticket: body.ticket,
      mcp: Array.isArray(body.mcp) ? body.mcp : undefined,
      answer: typeof body.answer === "string" ? body.answer : undefined,
    });
    return createUIMessageStreamResponse({ stream });
  } catch (e) {
    return fail(e);
  }
}
