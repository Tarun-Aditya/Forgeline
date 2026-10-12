import { NextResponse, type NextRequest } from "next/server";
import { refuse } from "@/lib/guard";

export function proxy(req: NextRequest) {
  const why = refuse(req.method, req.headers.get("host"), req.headers.get("origin"));
  return why ? NextResponse.json({ error: why }, { status: 403 }) : NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
