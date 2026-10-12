"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Theme = "system" | "light" | "dark";
const KEY = "forgeline.theme";
const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };

function apply(t: Theme) {
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** Cycles system, light, dark. The choice is remembered in this browser. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    try { const t = localStorage.getItem(KEY); if (t === "light" || t === "dark" || t === "system") setTheme(t); } catch { /* keep system */ }
  }, []);
  useEffect(() => {
    apply(theme);
    if (theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => apply("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [theme]);
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-label={`Theme: ${theme}`}
      title={`Theme: ${theme} (click for ${NEXT[theme]})`}
      onClick={() => { const n = NEXT[theme]; setTheme(n); try { localStorage.setItem(KEY, n); } catch { /* not remembered */ } }}
    >
      <Icon className="size-4" />
    </Button>
  );
}
