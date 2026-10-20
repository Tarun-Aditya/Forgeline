/* Layout adapted from Mastra Studio's AppShell and MainCard (Apache-2.0). See THIRD_PARTY_NOTICES.md. */
import type { ReactNode } from "react";
import { frameSurfaceStyle } from "@/lib/ds/raised-surface";
import { cn } from "@/lib/utils";

/** Sidebar column on the canvas, content in rounded cards beside it. */
export function AppFrame({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  return (
    <div data-slot="app-shell" className="grid h-full min-h-0 grid-cols-[auto_minmax(0,1fr)] bg-sidebar">
      {sidebar}
      <div className="flex min-h-0 min-w-0 gap-2 py-2 pr-2">{children}</div>
    </div>
  );
}

/** The app frame surface: one rim, one elevation, one step below a card. */
export function MainCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div data-slot="main-card" className={cn("relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-studio-frame p-px", frameSurfaceStyle, className)}>
      {children}
    </div>
  );
}
