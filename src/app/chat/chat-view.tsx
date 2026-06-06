"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatInput } from "@/components/chat/ChatInput";
import { MessageFeed } from "@/components/chat/MessageFeed";
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

export function ChatView({ initialConversationId, recent: initialRecent }: ChatViewProps) {
  const [conversationId, setConversationId] = useState<number | null>(
    initialConversationId,
  );
  const [recent, setRecent] = useState<Conversation[]>(initialRecent);
  const [history, setHistory] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!conversationId) {
        if (alive) setHistory([]);
        return;
      }
      try {
        const res = await fetch(
          `/api/director/conversations/${conversationId}`,
        );
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as { messages: Message[] };
        if (alive) setHistory(data.messages);
      } catch (e) {
        if (alive) setError(String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [conversationId]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
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
        body: JSON.stringify({
          conversationId: conversationId ?? undefined,
          text,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as ApiResponse;
      setConversationId(data.conversationId);
      const fresh = await fetch(
        `/api/director/conversations/${data.conversationId}`,
      );
      const freshData = (await fresh.json()) as { messages: Message[] };
      setHistory(freshData.messages);
      // Refresh the recent list so a brand-new conversation appears in
      // the sidebar without a full page reload.
      const list = await fetch("/api/director/conversations")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (list?.conversations) setRecent(list.conversations);
    } catch (e) {
      setError(String(e));
      setHistory((h) => h.filter((m) => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  }

  function startNew() {
    setConversationId(null);
    setHistory([]);
    setInput("");
    setError(null);
  }

  return (
    <div className="flex h-screen">
      <aside className="w-[280px] shrink-0 border-r border-[#e8e6dc] bg-[#faf9f5] flex flex-col">
        <div className="px-4 pt-5 pb-3 border-b border-[#e8e6dc]">
          <h2 className="text-[16px] font-semibold text-[#141413]">Director</h2>
          <p className="text-[11px] text-[#9a988e] mt-0.5 font-serif italic">
            Talk to UTEONT in natural language
          </p>
        </div>
        <button
          type="button"
          onClick={startNew}
          className="mx-3 mt-3 inline-flex items-center gap-1.5 rounded-md bg-[#d97757] text-white px-3 py-2 text-[12px] font-medium hover:bg-[#c66948] transition-colors"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          New conversation
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
                type="button"
                onClick={() => setConversationId(c.id)}
                className={cn(
                  "w-full text-left px-4 py-2 text-[12px] hover:bg-[#ece9e0] transition-colors",
                  c.id === conversationId &&
                    "bg-[#e8e6dc] border-l-[3px] border-[#d97757] pl-[13px]",
                )}
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

      <main className="flex-1 flex flex-col bg-white min-h-0">
        {history.length === 0 && !sending ? (
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <EmptyState onPickExample={(text) => setInput(text)} />
          </div>
        ) : (
          <MessageFeed messages={history} pending={sending} />
        )}

        <div className="border-t border-[#e8e6dc] px-8 py-4 bg-[#faf9f5]">
          <div className="max-w-[760px] mx-auto">
            {error && (
              <div className="text-[12px] text-[#a33b2b] bg-[#fcf3f1] border border-[#e8c0b8] rounded-md p-2 mb-2">
                {error}
              </div>
            )}
            <ChatInput
              value={input}
              onChange={setInput}
              onSubmit={sendMessage}
              disabled={sending}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

const EXAMPLES = [
  "Find me ranking opportunities for B2B SaaS onboarding tools",
  "Get me to #2 for 'shirts for young office goers in India'",
  "Draft an outreach email to webmasters at example.com",
  "Write a 1500-word article on 'best electric bikes 2026'",
];

function EmptyState({
  onPickExample,
}: {
  onPickExample: (text: string) => void;
}) {
  return (
    <div className="max-w-[600px] mx-auto pt-16">
      <h1 className="text-[24px] font-semibold text-[#141413] mb-2">
        Director
      </h1>
      <p className="text-[13px] text-[#6b6a64] font-serif mb-6">
        Tell me what you want to achieve — I&apos;ll decompose it into agent
        tasks, propose a plan, and run it once you approve. Type a leading{" "}
        <span className="font-mono text-[#d97757]">/</span> to use a slash
        command.
      </p>
      <div className="rounded-md bg-[#faf9f5] border border-[#e8e6dc] p-4">
        <div className="text-[10px] font-bold tracking-wider text-[#9a988e] mb-2">
          EXAMPLES
        </div>
        <ul className="flex flex-col gap-1">
          {EXAMPLES.map((ex) => (
            <li key={ex}>
              <button
                type="button"
                onClick={() => onPickExample(ex)}
                className="w-full text-left text-[12px] text-[#141413] hover:text-[#d97757] hover:underline decoration-[#d97757] transition-colors"
              >
                &ldquo;{ex}&rdquo;
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
