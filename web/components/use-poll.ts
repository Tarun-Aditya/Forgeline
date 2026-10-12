"use client";
import { createContext, createElement, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Topic } from "@/lib/changes";

type Changes = { connected: boolean; counts: Record<Topic, number> };
const Ctx = createContext<Changes>({ connected: false, counts: { jobs: 0, activity: 0, runs: 0 } });

/** One server-sent-events connection per repo. While it is up, polls slow down and refetch the moment their topic changes. */
export function ChangesProvider({ repo, children }: { repo: string | null; children: ReactNode }) {
  const [state, setState] = useState<Changes>({ connected: false, counts: { jobs: 0, activity: 0, runs: 0 } });
  useEffect(() => {
    setState({ connected: false, counts: { jobs: 0, activity: 0, runs: 0 } });
    if (!repo || typeof EventSource === "undefined") return;
    const es = new EventSource(`/api/events?repo=${encodeURIComponent(repo)}`);
    es.onopen = () => setState((s) => ({ ...s, connected: true }));
    es.onerror = () => setState((s) => ({ ...s, connected: false })); // the browser reconnects by itself; polls speed up meanwhile
    es.addEventListener("change", (e) => {
      const topic = JSON.parse((e as MessageEvent).data).topic as Topic;
      setState((s) => ({ ...s, counts: { ...s.counts, [topic]: s.counts[topic] + 1 } }));
    });
    return () => es.close();
  }, [repo]);
  return createElement(Ctx.Provider, { value: state }, children);
}

const SLOW = 20000; // safety net while push updates are working

/** Fetch JSON now, again whenever `topic` changes on the server, and on a timer (a slow one while push is connected). A null url pauses it. */
export function usePoll<T>(url: string | null, ms = 2000, topic?: Topic | Topic[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { connected, counts } = useContext(Ctx);
  const every = topic && connected ? Math.max(ms, SLOW) : ms;
  const tickRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setData(null); // never show the previous url's response while the new one loads
    setError(null);
  }, [url]);

  useEffect(() => {
    if (!url) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        const body = await res.json();
        if (stop) return;
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setData(body);
        setError(null);
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : "Request failed");
      }
    };
    tickRef.current = tick;
    tick();
    const id = setInterval(tick, every);
    return () => {
      stop = true;
      tickRef.current = null;
      clearInterval(id);
    };
  }, [url, every]);

  const count = topic ? [topic].flat().reduce((n, t) => n + counts[t], 0) : 0;
  useEffect(() => {
    if (count > 0) tickRef.current?.();
  }, [count]);

  return { data, error };
}
