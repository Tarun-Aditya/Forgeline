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
