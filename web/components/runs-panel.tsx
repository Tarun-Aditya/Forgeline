"use client";
import { useState } from "react";
import { PromptInput, PromptInputBody, PromptInputFooter, PromptInputSubmit, PromptInputTextarea, PromptInputTools } from "@/components/ai-elements/prompt-input";
import type { Options } from "@/components/run-panel";
import { RunViewer } from "@/components/run-viewer";
import { SessionView, STATE_DOT } from "@/components/session-view";
import { RUN_STYLE, type Run } from "@/components/runs-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ExternalSession } from "@/lib/external";
import type { McpServer } from "@/lib/mcp";
import type { Warning } from "@/lib/repocheck";
import { cn } from "@/lib/utils";

type Props = {
  repo: string; sessions: ExternalSession[]; warnings: Warning[]; runs: Run[]; selected: string | null; onSelect: (id: string) => void; error: string | null; posting: boolean;
  servers: McpServer[]; options: Options; onOptions: (o: Options) => void;
  onSubmit: (text: string) => void; onStop: (runId: string) => void;
};

/** The right-hand panel. Any number of runs can go at once: pick one to follow, type to start another. */
export function RunsPanel({ repo, sessions, warnings, runs, selected, onSelect, error, posting, servers, options, onOptions, onSubmit, onStop }: Props) {
  const [text, setText] = useState("");
  const current = runs.find((r) => r.runId === selected);
  const currentSession = sessions.find((x) => `session:${x.sid}` === selected);
  const running = runs.filter((r) => r.status === "running").length + sessions.filter((x) => x.state === "running").length;
  // Web runs and sessions from the terminal or VS Code in one list, newest first.
  const items = [
    ...runs.map((r) => ({ kind: "run" as const, id: r.runId, at: r.startedAt, run: r })),
    ...sessions.map((x) => ({ kind: "session" as const, id: `session:${x.sid}`, at: x.lastAt ?? x.startedAt ?? "", session: x })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const toggle = (name: string) =>
    onOptions({ ...options, mcpOff: options.mcpOff.includes(name) ? options.mcpOff.filter((n) => n !== name) : [...options.mcpOff, name] });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b p-2">
        <div className="mb-1 flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <span>Runs</span>
          {running > 0 && <span className="flex items-center gap-1 text-claude"><span className="size-1.5 animate-pulse rounded-full bg-claude" />{running} running</span>}
        </div>
        {items.length === 0 ? (
          <p className="px-1 pb-1 text-xs text-muted-foreground">Nothing yet. Runs you start show up here and keep going when you start another. Sessions from the terminal or VS Code show up too.</p>
        ) : (
          <ul className="max-h-36 space-y-0.5 overflow-y-auto">
            {items.slice(0, 14).map((it) => (
              <li key={it.id}>
                <button
                  onClick={() => onSelect(it.id)}
                  className={cn("flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent", it.id === selected && "bg-accent")}
                >
                  {it.kind === "run" ? (
                    <Badge className={cn("rounded-full px-1.5 text-[10px]", RUN_STYLE[it.run.status])}>
                      {it.run.status === "running" && <span className="mr-1 size-1.5 animate-pulse rounded-full bg-current" />}{it.run.status}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="rounded-full px-1.5 text-[10px]">
                      <span className={cn("mr-1 size-1.5 rounded-full", STATE_DOT[it.session.state])} />{it.session.source}
                    </Badge>
                  )}
                  <span className="min-w-0 flex-1 truncate">{it.kind === "run" ? it.run.prompt.replace(/^\/factory\s+/, "") : it.session.title}</span>
                  {(it.kind === "run" ? it.run.jobIds[0] : it.session.job) && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{(it.kind === "run" ? it.run.jobIds[0] : it.session.job)!.split("-")[0]}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {currentSession ? (
        <SessionView key={currentSession.sid} repo={repo} session={currentSession} />
      ) : current ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b px-3 py-1.5 text-xs">
            <span className="min-w-0 flex-1 truncate text-muted-foreground" title={current.prompt}>{current.prompt}</span>
            {current.status === "running" && <Button size="sm" variant="secondary" onClick={() => onStop(current.runId)}>Stop</Button>}
          </div>
          <RunViewer key={current.runId} runId={current.runId} className="border-0" />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 place-items-center p-6 text-center">
          <div>
            <h3 className="text-sm font-medium">Start a job</h3>
            <p className="mt-1 text-sm text-muted-foreground">Describe a task, paste a ticket, or type a Jira key like ABC-123. Anything starting with /factory runs as typed. You can start several at once.</p>
          </div>
        </div>
      )}

      <div className="space-y-2 border-t p-3">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {warnings.length > 0 && (
          <ul className="space-y-1" aria-label="Repository notes">
            {warnings.map((w) => (
              <li key={w.code} className={cn("flex gap-1.5 text-[11px] leading-snug", w.level === "warn" ? "text-warn" : "text-muted-foreground")}>
                <span aria-hidden>{w.level === "warn" ? "⚠" : "ℹ"}</span><span>{w.text}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Button size="sm" variant={options.type === "bugfix" ? "default" : "secondary"} onClick={() => onOptions({ ...options, type: options.type === "bugfix" ? "feature" : "bugfix" })}>
            {options.type === "bugfix" ? "Bug fix" : "Feature"}
          </Button>
          <Input className="h-8 w-28" placeholder="Ticket" value={options.ticket} onChange={(e) => onOptions({ ...options, ticket: e.target.value })} />
          {servers.length > 0 && <span className="text-muted-foreground">MCP:</span>}
          {servers.map((s) => (
            <Button key={s.name} size="sm" variant={options.mcpOff.includes(s.name) ? "outline" : "secondary"} title={`${s.type} · ${s.scope}`} onClick={() => toggle(s.name)}>
              <span className={options.mcpOff.includes(s.name) ? "line-through opacity-60" : ""}>{s.name}</span>
            </Button>
          ))}
        </div>
        <PromptInput
          onSubmit={(msg) => {
            if (!msg.text.trim() || posting) return;
            onSubmit(msg.text);
            setText("");
          }}
        >
          <PromptInputBody>
            <PromptInputTextarea value={text} onChange={(e) => setText(e.currentTarget.value)} placeholder="Describe a task, paste a ticket, or type /factory …" />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools />
            <PromptInputSubmit status={posting ? "submitted" : "ready"} disabled={posting || !text.trim()} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
