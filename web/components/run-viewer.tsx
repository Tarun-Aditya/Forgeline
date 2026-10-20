"use client";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useMemo } from "react";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Messages } from "@/components/run-panel";
import { cn } from "@/lib/utils";

/** Replays a run's saved log and keeps following it while the process is alive. */
export function RunViewer({ runId, className }: { runId: string; className?: string }) {
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const { messages, status, error } = useChat({ id: runId, transport, resume: true });
  return (
    <Conversation className={cn("min-h-0 flex-1", className ?? "rounded-md border")}>
      <ConversationContent>
        <Messages messages={messages} busy={status === "streaming"} />
        {error && <p className="text-sm text-destructive">{error.message}</p>}
        {messages.length === 0 && !error && <p className="text-sm text-muted-foreground">Loading log…</p>}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
