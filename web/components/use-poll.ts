"use client";
import { useEffect, useState } from "react";

/** Fetch JSON now and then every `ms`. A null url pauses it. */
export function usePoll<T>(url: string | null, ms = 2000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setData(null); // never show the previous url's response while the new one loads
    setError(null);
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
    tick();
    const id = setInterval(tick, ms);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [url, ms]);
  return { data, error };
}
