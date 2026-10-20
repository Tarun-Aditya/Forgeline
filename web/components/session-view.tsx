"use client";
import { Feed } from "@/components/activity-view";
import { usePoll } from "@/components/use-poll";
import { Badge } from "@/components/ui/badge";
import type { ActivityEvent } from "@/lib/activity";
import type { ExternalSession } from "@/lib/external";

export const STATE_DOT: Record<ExternalSession["state"], string> = {
  running: "bg-ok animate-pulse", idle: "bg-muted-foreground", ended: "bg-muted-foreground/50", stalled: "bg-destructive", crashed: "bg-destructive",
};

const ago = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`);

/** A session started outside the web app. The web app has no log of its text, so this shows what the hooks recorded. */
export function SessionView({ repo, session }: { repo: string; session: ExternalSession }) {
  const q = `repo=${encodeURIComponent(repo)}${session.job ? `&job=${encodeURIComponent(session.job)}` : ""}&limit=800`;
  const { data } = usePoll<{ events: ActivityEvent[] }>(`/api/activity?${q}`, 3000, "activity");
  const events = (data?.events ?? []).filter((e) => e.sid === session.sid);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-1 border-b px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{session.source}</Badge>
          <span className="flex items-center gap-1.5"><span className={`size-2 rounded-full ${STATE_DOT[session.state]}`} />{session.state}</span>
          {session.job && <span className="font-mono text-muted-foreground">{session.job}</span>}
          <span className="ml-auto text-muted-foreground">{ago(session.ageSeconds)} ago</span>
        </div>
        <p className="font-medium">{session.title}</p>
        <p className="text-muted-foreground">Started outside this app. Continue it with <code className="rounded bg-muted px-1">claude --resume {session.sid}</code>
          {session.job && (session.state === "stalled" || session.state === "crashed") && <> or <code className="rounded bg-muted px-1">/factory resume {session.job}</code></>}.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {events.length === 0 ? <p className="text-sm text-muted-foreground">No recorded steps yet.</p> : <Feed events={events} />}
      </div>
    </div>
  );
}
