"use client";

import { useEffect, useRef, useState } from "react";
import type { Conversation, Message } from "@/lib/db/schema";

interface ChatViewProps {
  initialConversationId: number | null;
  recent: Conversation[];
}

interface ApiResponse {
  conversationId: number;
  message: Message;
  response: {
    intent: "ask" | "propose" | "execute" | "report";
    text: string;
    actions?: Array<{ tool: string; args: Record<string, unknown> }>;
  };
}

const INTENT_BADGE: Record<string, { label: string; color: string }> = {
  ask:     { label: "ASK",     color: "bg-[#e8e6dc] text-[#6b6a64]" },
  propose: { label: "PROPOSE", color: "bg-[#6a9bcc] text-white" },
  execute: { label: "EXECUTE", color: "bg-[#d97757] text-white" },
  report:  { label: "REPORT",  color: "bg-[#788c5d] text-white" },
};

export function ChatView({ initialConversationId, recent }: ChatViewProps) {
  const [conversationId, setConversationId] = useState<number | null>(
    initialConversationId,
  );
  const [history, setHistory] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load history when conversationId changes
  useEffect(() => {
    if (!conversationId) {
      setHistory([]);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/director/conversations/${conversationId}`);
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as { messages: Message[] };
        setHistory(data.messages);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, [conversationId]);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history.length]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    // Optimistic user message
    const optimistic: Message = {
      id: -Date.now(),
      conversationId: conversationId ?? 0,
      role: "user",
      content: text,
      payload: null,
      surface: "web",
      createdAt: new Date() as unknown as Date,
    };
    setHistory((h) => [...h, optimistic]);
    setInput("");
    try {
      const res = await fetch("/api/director/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversationId ?? undefined, text }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as ApiResponse;
      setConversationId(data.conversationId);
      // Replace optimistic with real history fetch
      const fresh = await fetch(`/api/director/conversations/${data.conversationId}`);
      const freshData = (await fresh.json()) as { messages: Message[] };
      setHistory(freshData.messages);
    } catch (e) {
      setError(String(e));
      // Roll back the optimistic message on error
      setHistory((h) => h.filter((m) => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  };

  const startNew = () => {
    setConversationId(null);
    setHistory([]);
    setInput("");
    setError(null);
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar — recent conversations */}
      <aside className="w-[280px] shrink-0 border-r border-[#e8e6dc] bg-[#faf9f5] flex flex-col">
        <div className="px-4 pt-5 pb-3 border-b border-[#e8e6dc]">
          <h2 className="text-[16px] font-semibold text-[#141413]">Director</h2>
          <p className="text-[11px] text-[#9a988e] mt-0.5 font-serif italic">
            Talk to UTEONT in natural language
          </p>
        </div>
        <button
          onClick={startNew}
          className="mx-3 mt-3 rounded-md bg-[#d97757] text-white px-3 py-2 text-[12px] font-medium hover:bg-[#c66948] transition-colors"
        >
          + New conversation
        </button>
        <div className="flex-1 overflow-y-auto mt-2">
          <div className="px-4 pt-3 pb-1 text-[10px] font-bold tracking-wider text-[#9a988e]">
            RECENT
          </div>
          {recent.length === 0 ? (
            <div className="px-4 py-2 text-[11px] text-[#9a988e] italic font-serif">
              No conversations yet
            </div>
          ) : (
            recent.map((c) => (
              <button
                key={c.id}
                onClick={() => setConversationId(c.id)}
                className={`w-full text-left px-4 py-2 text-[12px] hover:bg-[#ece9e0] transition-colors ${
                  c.id === conversationId
                    ? "bg-[#e8e6dc] border-l-[3px] border-[#d97757] pl-[13px]"
                    : ""
                }`}
              >
                <div className="text-[#141413] font-medium truncate">
                  {c.title ?? "Untitled"}
                </div>
                <div className="text-[10px] text-[#9a988e] mt-0.5">
                  {c.status}
                  {c.planApproved && " · approved"}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Main thread */}
      <main className="flex-1 flex flex-col bg-white">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-8 py-6"
        >
          {history.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="max-w-[760px] mx-auto space-y-4">
              {history.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              {sending && (
                <div className="text-[12px] text-[#9a988e] italic font-serif">
                  Director is thinking…
                </div>
              )}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-[#e8e6dc] px-8 py-4 bg-[#faf9f5]">
          <div className="max-w-[760px] mx-auto">
            {error && (
              <div className="text-[12px] text-[#a33b2b] bg-[#fcf3f1] border border-[#e8c0b8] rounded-md p-2 mb-2">
                {error}
              </div>
            )}
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder='e.g. "Get me to #2 ranking for shirts for young office goers in India"'
                rows={2}
                disabled={sending}
                className="flex-1 rounded-md border border-[#cfccc1] px-3 py-2 text-[14px] focus:outline-none focus:border-[#d97757] resize-none"
              />
              <button
                onClick={sendMessage}
                disabled={sending || input.trim().length === 0}
                className="self-end rounded-md bg-[#d97757] text-white px-5 py-2 text-[14px] font-medium hover:bg-[#c66948] disabled:bg-[#f3f1ea] disabled:text-[#9a988e] disabled:cursor-not-allowed transition-colors"
              >
                Send
              </button>
            </div>
            <p className="text-[10px] text-[#9a988e] mt-1.5 font-serif italic">
              Enter to send · Shift+Enter for newline
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="max-w-[600px] mx-auto pt-16">
      <h1 className="text-[24px] font-semibold text-[#141413] mb-2">
        Director
      </h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-6">
        Tell me what you want to achieve — I&apos;ll decompose it into agent
        tasks, propose a plan, and run it once you approve.
      </p>
      <div className="rounded-md bg-[#faf9f5] border border-[#e8e6dc] p-4 space-y-2 text-[12px] text-[#6b6a64]">
        <div className="font-medium text-[#141413]">Examples</div>
        <div>
          • &ldquo;Find me ranking opportunities for B2B SaaS onboarding tools&rdquo;
        </div>
        <div>
          • &ldquo;Get me to #2 for &lsquo;shirts for young office goers in India&rsquo;&rdquo;
        </div>
        <div>
          • &ldquo;Draft an outreach email to webmasters at <em>example.com</em>&rdquo;
        </div>
        <div>
          • &ldquo;Write a 1500-word article on &lsquo;best electric bikes 2026&rsquo;&rdquo;
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const payload = (message.payload as { intent?: string; enqueued?: Array<{ tool: string; jobId: number }> } | null) ?? null;
  const intent = payload?.intent;
  const badge = intent ? INTENT_BADGE[intent] : null;

  if (message.role === "system") {
    return (
      <div className="text-center">
        <div className="inline-block text-[11px] text-[#9a988e] italic font-serif bg-[#faf9f5] border border-[#e8e6dc] rounded-full px-3 py-1">
          {message.content}
        </div>
      </div>
    );
  }

  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-[10px] px-4 py-2.5 ${
          isUser
            ? "bg-[#d97757] text-white"
            : "bg-[#faf9f5] border border-[#e8e6dc] text-[#141413]"
        }`}
      >
        {badge && (
          <div className="mb-1.5">
            <span className={`text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded ${badge.color}`}>
              {badge.label}
            </span>
          </div>
        )}
        <div className="text-[13px] whitespace-pre-wrap leading-relaxed">
          {message.content}
        </div>
        {payload?.enqueued && payload.enqueued.length > 0 && (
          <div className="mt-2 pt-2 border-t border-white/20 text-[11px] opacity-80">
            Enqueued: {payload.enqueued.map((e) => `${e.tool} (job ${e.jobId})`).join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}
