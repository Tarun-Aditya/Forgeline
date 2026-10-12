"use client";
import { Bell, BellOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { newAttention, type Snapshot } from "@/lib/attention";
import type { Job } from "@/lib/jobs";

const KEY = "forgeline.notify";
const read = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
const write = (on: boolean) => { try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* private window: the choice just is not remembered */ } };

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.4);
    setTimeout(() => ctx.close(), 600);
  } catch { /* no audio available */ }
}

/** The tab title always counts what needs you. When alerts are on, a new item also pops a notification and a short sound while the tab is in the background. */
export function useAttention(repo: string | null, jobs: Job[], trouble: Map<string, string>, questions: Set<string>, count: number) {
  const [on, setOn] = useState(false);
  const [blocked, setBlocked] = useState(false); // read after mount: the server cannot know the browser permission
  const prev = useRef<Snapshot | null>(null);
  useEffect(() => {
    setOn(read());
    setBlocked(typeof Notification !== "undefined" && Notification.permission === "denied");
  }, []);
  useEffect(() => { prev.current = null; }, [repo]); // another repo: start quiet again

  useEffect(() => {
    document.title = count > 0 ? `(${count}) Forgeline` : "Forgeline";
  }, [count]);

  useEffect(() => {
    if (jobs.length === 0 && prev.current === null) return; // nothing loaded yet
    const { next, events } = newAttention(prev.current, jobs, trouble, questions);
    prev.current = next;
    if (!on || events.length === 0 || (document.hasFocus() && !document.hidden)) return;
    beep();
    if (typeof Notification !== "undefined" && Notification.permission === "granted")
      for (const e of events) new Notification(e.title, { body: e.body, tag: e.key });
  }, [jobs, trouble, questions, on]);

  const toggle = async () => {
    if (on) { setOn(false); write(false); return; }
    if (typeof Notification !== "undefined" && Notification.permission === "default") await Notification.requestPermission();
    setBlocked(typeof Notification !== "undefined" && Notification.permission === "denied");
    setOn(true);
    write(true);
    beep(); // lets you hear what it sounds like, and unlocks audio
  };
  return { on, toggle, blocked };
}

export function NotifyButton({ on, toggle, blocked }: { on: boolean; toggle: () => void; blocked: boolean }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? "Alerts on" : "Alerts off"}
      title={blocked ? "Browser notifications are blocked for this site; you will only hear the sound" : on ? "Alerts on: a sound and a notification when something needs you" : "Turn on alerts for when something needs you"}
    >
      {on ? <Bell className="size-4 text-claude" /> : <BellOff className="size-4" />}
    </Button>
  );
}
