"use client";
import { useEffect, useState } from "react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export type PaletteItem = { id: string; label: string; hint?: string; run: () => void };

/** ⌘K / Ctrl+K palette: jump to a view or open a job. */
export function CommandPalette({ items }: { items: PaletteItem[] }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
  const groups = [...new Set(items.map((i) => i.hint ?? "Go to"))];
  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Go to a view or open a job…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        {groups.map((g) => (
          <CommandGroup key={g} heading={g}>
            {items.filter((i) => (i.hint ?? "Go to") === g).map((i) => (
              <CommandItem key={i.id} value={`${i.label} ${i.id}`} onSelect={() => { setOpen(false); i.run(); }}>{i.label}</CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
