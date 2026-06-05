import { Bot, User } from "lucide-react";
import { Markdown } from "@/lib/markdown/render";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/db/schema";

const INTENT_BADGE: Record<string, { label: string; color: string }> = {
  ask: { label: "ASK", color: "bg-[#e8e6dc] text-[#6b6a64]" },
  propose: { label: "PROPOSE", color: "bg-[#6a9bcc] text-white" },
  execute: { label: "EXECUTE", color: "bg-[#d97757] text-white" },
  report: { label: "REPORT", color: "bg-[#788c5d] text-white" },
};

interface MessageBubbleProps {
  message: Message;
}

interface AssistantPayload {
  intent?: string;
  enqueued?: Array<{ tool: string; jobId: number }>;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const payload = (message.payload as AssistantPayload | null) ?? null;

  if (message.role === "system") {
    return (
      <div className="flex justify-center">
        <div className="text-[11px] text-[#9a988e] italic font-serif bg-[#faf9f5] border border-[#e8e6dc] rounded-full px-3 py-1">
          {message.content}
        </div>
      </div>
    );
  }

  const isUser = message.role === "user";
  const badge = payload?.intent ? INTENT_BADGE[payload.intent] : null;

  return (
    <div
      className={cn(
        "flex items-start gap-3",
        isUser && "flex-row-reverse",
      )}
    >
      <div
        className={cn(
          "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1",
          isUser
            ? "bg-[#d97757] text-white ring-[#c66948]"
            : "bg-[#f3f1ea] text-[#d97757] ring-[#e8e6dc]",
        )}
      >
        {isUser ? (
          <User className="h-4 w-4" aria-hidden />
        ) : (
          <Bot className="h-4 w-4" aria-hidden />
        )}
      </div>
      <div
        className={cn(
          "max-w-[76%] rounded-[10px] px-4 py-2.5",
          isUser
            ? "bg-[#141413] text-white"
            : "bg-[#faf9f5] border border-[#e8e6dc] text-[#141413]",
        )}
      >
        {badge && (
          <div className="mb-1.5">
            <span
              className={cn(
                "text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded",
                badge.color,
              )}
            >
              {badge.label}
            </span>
          </div>
        )}
        {isUser ? (
          <div className="text-[13px] whitespace-pre-wrap leading-relaxed">
            {message.content}
          </div>
        ) : (
          <div className="text-[13px] [&>article]:text-[13px] [&_p]:mb-2 [&_p]:font-sans [&_p]:leading-relaxed">
            <Markdown source={message.content} />
          </div>
        )}
        {payload?.enqueued && payload.enqueued.length > 0 && (
          <div
            className={cn(
              "mt-2 pt-2 border-t text-[11px]",
              isUser ? "border-white/20 opacity-80" : "border-[#e8e6dc] text-[#6b6a64]",
            )}
          >
            Enqueued: {payload.enqueued.map((e) => `${e.tool} (#${e.jobId})`).join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}
