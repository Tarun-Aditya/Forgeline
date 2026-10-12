"use client";
import { useState } from "react";
import { MessageResponse } from "@/components/ai-elements/message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Question } from "@/lib/questions";

export function QuestionBadge({ className }: { className?: string }) {
  return <Badge className={cn("bg-call text-white", className)}>needs your answer</Badge>;
}

/** The agent's final message and a reply that continues the same session. */
export function QuestionBox({ question, locked, onSend }: { question: Question; locked: boolean; onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="space-y-2">
      <div className="max-h-48 overflow-y-auto rounded-md border p-2 text-sm">
        <MessageResponse>{question.text}</MessageResponse>
      </div>
      <Textarea aria-label="Your answer" placeholder="Your answer" value={text} onChange={(e) => setText(e.target.value)} />
      <Button
        disabled={locked || !text.trim()}
        onClick={() => {
          onSend(text.trim());
          setText("");
        }}
      >
        Send answer
      </Button>
    </div>
  );
}
