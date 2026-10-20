"use client";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type Tab = "board" | "agents" | "activity" | "runs" | "metrics";

const TAB_KEYS: Record<string, Tab> = { b: "board", a: "agents", c: "activity", r: "runs", m: "metrics" };

const typing = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  return !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
};

/** `g` then a letter switches tab, `n` jumps to the new-task box, `?` shows this list. Ignored while typing. */
export function useShortcuts(setTab: (t: Tab) => void, openHelp: () => void) {
  const chord = useRef<number | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return; // dialogs own the keyboard
      if (chord.current) {
        window.clearTimeout(chord.current);
        chord.current = null;
        const tab = TAB_KEYS[e.key.toLowerCase()];
        if (tab) { e.preventDefault(); setTab(tab); }
        return;
      }
      if (e.key === "g") chord.current = window.setTimeout(() => { chord.current = null; }, 1000);
      else if (e.key === "n") {
        // The side panel stays mounted (hidden) on small screens, so take the box that is actually showing.
        const box = [...document.querySelectorAll<HTMLTextAreaElement>('textarea[placeholder^="Describe a task"]')].find((el) => el.offsetParent !== null);
        if (box) { e.preventDefault(); box.focus(); }
      } else if (e.key === "?") { e.preventDefault(); openHelp(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setTab, openHelp]);
}

const LIST: [string, string][] = [
  ["g b", "Board"], ["g a", "Agents"], ["g c", "Activity"], ["g r", "Runs"], ["g m", "Metrics"],
  ["n", "Write a new task"], ["?", "Show this list"],
];

export function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>They work anywhere except while you are typing in a box.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5 text-sm">
          {LIST.map(([keys, what]) => (
            <li key={keys} className="flex items-center justify-between">
              <span>{what}</span>
              <span className="flex gap-1">{keys.split(" ").map((k) => <kbd key={k} className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">{k}</kbd>)}</span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function useHelp() {
  const [open, setOpen] = useState(false);
  return { open, show: () => setOpen(true), hide: () => setOpen(false) };
}
