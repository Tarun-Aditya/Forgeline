// The API can start agents on this machine, so it only answers to the local app itself.
const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Returns an error message when the request must be refused, else null. */
export function refuse(method: string, host: string | null, origin: string | null): string | null {
  const hostname = (host ?? "").replace(/:\d+$/, "");
  if (!LOCAL.has(hostname)) return "Only localhost is allowed."; // blocks DNS rebinding
  if (method === "GET" || method === "HEAD") return null;
  if (!origin) return "Missing Origin.";
  try {
    if (new URL(origin).host !== host) return "Cross-origin request refused."; // blocks CSRF from other sites
  } catch {
    return "Bad Origin.";
  }
  return null;
}
