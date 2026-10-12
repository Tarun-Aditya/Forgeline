// Tells the browser when something it shows has changed, so it can refetch at once instead of polling every few seconds.
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./paths.ts";

export type Topic = "jobs" | "activity" | "runs";

/** Watch the folders behind each topic. Returns a function that stops all watchers. */
export function watchRepo(repo: string, onChange: (topic: Topic) => void, debounceMs = 120): () => void {
  const timers = new Map<Topic, NodeJS.Timeout>();
  const watchers: fs.FSWatcher[] = [];
  const fire = (topic: Topic) => {
    if (timers.has(topic)) return;
    timers.set(topic, setTimeout(() => { timers.delete(topic); onChange(topic); }, debounceMs));
  };
  const watch = (dir: string, topic: Topic) => {
    try {
      fs.mkdirSync(dir, { recursive: true });
      watchers.push(fs.watch(dir, { recursive: true }, () => fire(topic)));
    } catch { /* unwatchable (permissions, unsupported): the client keeps polling slowly */ }
  };
  watch(path.join(repo, "factory", "jobs"), "jobs");
  watch(path.join(repo, "factory", "activity"), "activity");
  watch(path.join(DATA_DIR, "runs"), "runs");
  return () => {
    watchers.forEach((w) => w.close());
    timers.forEach((t) => clearTimeout(t));
  };
}
