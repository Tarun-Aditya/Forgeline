"use client";
import type { UIMessage } from "ai";
import { useState } from "react";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputBody, PromptInputFooter, PromptInputSubmit, PromptInputTextarea, PromptInputTools } from "@/components/ai-elements/prompt-input";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { McpServer } from "@/lib/mcp";
import type { RunResult } from "@/lib/stream";

export type Options = { type: "feature" | "bugfix"; ticket: string; mcpOff: string[] };

type Status = "submitted" | "streaming" | "ready" | "error";
type Props = {
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
  return messages.map((m) => (
    <Message key={m.id} from={m.role}>
      <MessageContent>
        {m.parts.map((p, i) => (
          <Part key={i} part={p} streaming={busy && m === messages.at(-1)} />
        ))}
      </MessageContent>
    </Message>
  ));
}

export function RunPanel({ messages, status, error, servers, options, onOptions, onSubmit, onStop }: Props) {
  const [text, setText] = useState("");
  const busy = status === "submitted" || status === "streaming";
  const toggle = (name: string) =>
    onOptions({ ...options, mcpOff: options.mcpOff.includes(name) ? options.mcpOff.filter((n) => n !== name) : [...options.mcpOff, name] });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState title="Start a job" description="Describe a task, paste a ticket, or type a Jira key like ABC-123. Anything starting with /factory runs as typed." />
          ) : (
            <Messages messages={messages} busy={busy} />
          )}
          {error && <p className="text-sm text-destructive">{error.message}</p>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="space-y-2 border-t p-3">
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
            if (!msg.text.trim()) return;
            onSubmit(msg.text);
            setText("");
          }}
        >
          <PromptInputBody>
            <PromptInputTextarea value={text} onChange={(e) => setText(e.currentTarget.value)} placeholder="Describe a task, paste a ticket, or type /factory …" />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools />
            <PromptInputSubmit status={status} onStop={onStop} disabled={!busy && !text.trim()} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
