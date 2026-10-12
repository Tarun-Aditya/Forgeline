"use client";
import { useState } from "react";
import { PromptInput, PromptInputBody, PromptInputFooter, PromptInputSubmit, PromptInputTextarea, PromptInputTools } from "@/components/ai-elements/prompt-input";
import type { Options } from "@/components/run-panel";
import { RunViewer } from "@/components/run-viewer";
import { RUN_STYLE, type Run } from "@/components/runs-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { McpServer } from "@/lib/mcp";
import { cn } from "@/lib/utils";

type Props = {
  runs: Run[]; selected: string | null; onSelect: (id: string) => void; error: string | null; posting: boolean;
  servers: McpServer[]; options: Options; onOptions: (o: Options) => void;
  onSubmit: (text: string) => void; onStop: (runId: string) => void;
};

/** The right-hand panel. Any number of runs can go at once: pick one to follow, type to start another. */
export function RunsPanel({ runs, selected, onSelect, error, posting, servers, options, onOptions, onSubmit, onStop }: Props) {
  const [text, setText] = useState("");
  const current = runs.find((r) => r.runId === selected);
  const running = runs.filter((r) => r.status === "running").length;
  const toggle = (name: string) =>
    onOptions({ ...options, mcpOff: options.mcpOff.includes(name) ? options.mcpOff.filter((n) => n !== name) : [...options.mcpOff, name] });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b p-2">
        <div className="mb-1 flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <span>Runs</span>
          {running > 0 && <span className="flex items-center gap-1 text-claude"><span className="size-1.5 animate-pulse rounded-full bg-claude" />{running} running</span>}
        </div>
        {runs.length === 0 ? (
          <p className="px-1 pb-1 text-xs text-muted-foreground">Nothing yet. Runs you start show up here and keep going when you start another.</p>
        ) : (
          <ul className="max-h-36 space-y-0.5 overflow-y-auto">
            {runs.slice(0, 12).map((r) => (
              <li key={r.runId}>
                <button
                  onClick={() => onSelect(r.runId)}
                  className={cn("flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent", r.runId === selected && "bg-accent")}
                >
                  <Badge className={cn("rounded-full px-1.5 text-[10px]", RUN_STYLE[r.status])}>
                    {r.status === "running" && <span className="mr-1 size-1.5 animate-pulse rounded-full bg-current" />}{r.status}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate">{r.prompt.replace(/^\/factory\s+/, "")}</span>
                  {r.jobIds[0] && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{r.jobIds[0].split("-")[0]}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {current ? (
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
