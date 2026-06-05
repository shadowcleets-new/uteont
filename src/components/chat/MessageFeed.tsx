"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import type { Message } from "@/lib/db/schema";

interface MessageFeedProps {
  messages: Message[];
  pending: boolean;
}

/**
 * Smart auto-scroll: sticks to the bottom while the user is at or near
 * the bottom; releases the stick when the user scrolls up and surfaces a
 * "Jump to Present" pill so they can return without breaking their
 * place in history. IntersectionObserver does the heavy lifting so we
 * don't have to listen to every scroll event.
 */
export function MessageFeed({ messages, pending }: MessageFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(true);

  useEffect(() => {
    const sentinel = bottomRef.current;
    const root = containerRef.current;
    if (!sentinel || !root) return;
    const io = new IntersectionObserver(
      ([entry]) => setStuck(entry.isIntersecting),
      { root, threshold: 0, rootMargin: "0px 0px 24px 0px" },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!stuck) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pending, stuck]);

  function jumpToPresent() {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-y-auto px-8 py-6"
      >
        <div className="max-w-[760px] mx-auto flex flex-col gap-4">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {pending && <TypingIndicator />}
          <div ref={bottomRef} aria-hidden className="h-px" />
        </div>
      </div>
      <button
        type="button"
        onClick={jumpToPresent}
        aria-label="Jump to present"
        className={cn(
          "absolute bottom-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5",
          "rounded-full bg-[#141413] text-white px-3 py-1.5 text-[12px] font-medium shadow-lg",
          "transition-opacity",
          stuck ? "pointer-events-none opacity-0" : "opacity-100",
        )}
      >
        <ArrowDown className="h-3.5 w-3.5" aria-hidden />
        Jump to present
      </button>
    </div>
  );
}
