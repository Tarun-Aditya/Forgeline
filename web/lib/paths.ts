import fs from "node:fs";
import path from "node:path";

/** web/.data holds the web layer's own state (never committed). */
export const DATA_DIR = process.env.FORGELINE_WEB_DATA ?? path.join(process.cwd(), ".data");

export function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** True when `child` is `parent` or inside it, after resolving symlinks in both. */
export function isInside(parent: string, child: string): boolean {
  const rel = path.relative(fs.realpathSync(parent), fs.realpathSync(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
