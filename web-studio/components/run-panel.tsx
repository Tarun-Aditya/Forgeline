"use client";
import type { UIMessage } from "ai";
import { useState } from "react";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { MessageResponse } from "@/components/ai-elements/message";
import { ArrivalScope, Arriving } from "@/components/chat/arrival";
import { ChatColumn, ChatDock, Composer, ComposerActions, ComposerBox, ComposerInput, ComposerRing, EmptyState, Message } from "@/components/chat/chat-ui";
import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { McpServer } from "@/lib/mcp";
import type { RunResult } from "@/lib/stream";

export type Options = { type: "feature" | "bugfix"; ticket: string; mcpOff: string[] };

type Status = "submitted" | "streaming" | "ready" | "error";
type Props = {
  context?: React.ReactNode;
  messages: UIMessage[];
  status: Status;
  error?: Error;
  servers: McpServer[];
  options: Options;
  onOptions: (o: Options) => void;
  onSubmit: (text: string) => void;
  onStop: () => void;
};

const money = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;

function Part({ part, streaming }: { part: UIMessage["parts"][number]; streaming: boolean }) {
  if (part.type === "text") return <MessageResponse>{part.text}</MessageResponse>;
  if (part.type === "reasoning")
    return (
      <Reasoning isStreaming={streaming} defaultOpen={false}>
        <ReasoningTrigger />
        <ReasoningContent>{part.text}</ReasoningContent>
      </Reasoning>
    );
  if (part.type === "dynamic-tool")
    return (
      <Tool>
        <ToolHeader type="dynamic-tool" toolName={part.toolName} state={part.state} title={part.title} />
        <ToolContent>
          <ToolInput input={part.input} />
          <ToolOutput output={part.output} errorText={part.errorText} />
        </ToolContent>
      </Tool>
    );
  if (part.type === "data-result") {
    const r = (part as unknown as { data: RunResult }).data;
    const tokens = r.usage.input + r.usage.output + r.usage.cacheRead + r.usage.cacheWrite;
    return (
      <p className="text-xs text-muted-foreground">
        {money(r.costUsd)} · {tokens.toLocaleString()} tokens · {Math.round(r.durationMs / 1000)}s · {r.turns} turns
      </p>
    );
  }
  return null;
}

export function Messages({ messages, busy }: { messages: UIMessage[]; busy: boolean }) {
  // A scope marks what was already there (a restored log) so only live arrivals fade in.
  return (
    <ArrivalScope>
      {messages.map((m) => (
        <Arriving key={m.id}>
          <Message from={m.role === "user" ? "user" : "assistant"}>
            {m.parts.map((p, i) => (
              <Arriving key={i}>
                <Part part={p} streaming={busy && m === messages.at(-1)} />
              </Arriving>
            ))}
          </Message>
        </Arriving>
      ))}
    </ArrivalScope>
  );
}

export function RunPanel({ context, messages, status, error, servers, options, onOptions, onSubmit, onStop }: Props) {
  const [text, setText] = useState("");
  const busy = status === "submitted" || status === "streaming";
  const toggle = (name: string) =>
    onOptions({ ...options, mcpOff: options.mcpOff.includes(name) ? options.mcpOff.filter((n) => n !== name) : [...options.mcpOff, name] });
  const send = () => {
    if (busy || !text.trim()) return;
    onSubmit(text);
    setText("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col [--chat-surface:var(--background)]">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-4 p-0">
          <ChatColumn className="flex-1 py-4">
            {messages.length === 0 ? (
              <EmptyState title="Start a job" description="Describe a task, paste a ticket, or type a Jira key like ABC-123. Anything starting with /factory runs as typed." />
            ) : (
              <Messages messages={messages} busy={busy} />
            )}
            {error && <p className="text-body-sm text-destructive-foreground">{error.message}</p>}
          </ChatColumn>
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <ChatDock className="px-3">
        {context}
        <Composer onSubmit={(e) => { e.preventDefault(); send(); }}>
          <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-1.5 pb-2 text-caption">
            <Button type="button" size="sm" variant={options.type === "bugfix" ? "primary" : "default"} onClick={() => onOptions({ ...options, type: options.type === "bugfix" ? "feature" : "bugfix" })}>
              {options.type === "bugfix" ? "Bug fix" : "Feature"}
            </Button>
            <Input className="h-control-sm w-28" placeholder="Ticket" value={options.ticket} onChange={(e) => onOptions({ ...options, ticket: e.target.value })} />
            {servers.length > 0 && <span className="text-muted-foreground">MCP</span>}
            {servers.map((s) => (
              <Button type="button" key={s.name} size="sm" variant={options.mcpOff.includes(s.name) ? "ghost" : "default"} title={`${s.type} · ${s.scope}`} onClick={() => toggle(s.name)}>
                <span className={options.mcpOff.includes(s.name) ? "line-through opacity-60" : ""}>{s.name}</span>
              </Button>
            ))}
          </div>
          <ComposerRing busy={busy}>
            <ComposerBox>
              <ComposerInput
                value={text}
                onChange={(e) => setText(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
                }}
                placeholder="Describe a task, paste a ticket, or type /factory …"
                aria-label="Task"
              />
              <ComposerActions>
                <span className="text-meta text-muted-foreground">Enter to send · Shift+Enter for a new line</span>
                {busy ? (
                  <Button type="button" size="icon-md" variant="default" tooltip="Stop run" onClick={onStop}><SquareIcon /></Button>
                ) : (
                  <Button type="submit" size="icon-md" variant="primary" tooltip="Send" disabled={!text.trim()}><ArrowUpIcon /></Button>
                )}
              </ComposerActions>
            </ComposerBox>
          </ComposerRing>
        </Composer>
      </ChatDock>
    </div>
  );
}
