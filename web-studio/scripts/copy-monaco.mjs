// Monaco (the editor behind the code view) is served from this app, not a CDN, so the code view works offline.
// Copies monaco-editor's minified AMD build to public/monaco/vs. Runs after install and before dev and build.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const from = path.join(root, "node_modules", "monaco-editor", "min", "vs");
const to = path.join(root, "public", "monaco", "vs");
if (!fs.existsSync(from)) {
  console.warn("copy-monaco: monaco-editor is not installed; the code view will not load.");
  process.exit(0);
}
fs.rmSync(to, { recursive: true, force: true });
fs.mkdirSync(path.dirname(to), { recursive: true });
fs.cpSync(from, to, { recursive: true });
console.log("copy-monaco: public/monaco/vs ready");
