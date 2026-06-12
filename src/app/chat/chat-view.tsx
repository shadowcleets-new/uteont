"use client";

import { useEffect, useRef, useState } from "react";
import type { Conversation, Message } from "@/lib/db/schema";
import { useActiveSite } from "@/lib/hooks/use-active-site";
import { ChatInput } from "@/components/chat-input";
import { TypingIndicator } from "@/components/typing-indicator";

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
  const { activeSiteId, sites } = useActiveSite();
  const [conversationId, setConversationId] = useState<number | null>(
    initialConversationId,
  );
  // siteId bound to the currently open conversation
  const [convSiteId, setConvSiteId] = useState<number | null>(null);
  // siteId chosen in the dropdown for new conversations
  const [chosenSiteId, setChosenSiteId] = useState<number | null>(null);
  const [history, setHistory] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Conversation rail (local so rename/archive/load-more update without reload).
  const [convos, setConvos] = useState<Conversation[]>(recent);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  // Search across all chat history (title + message content).
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Conversation[] | null>(null);
  const [searching, setSearching] = useState(false);

  const saveRename = (id: number) => {
    const title = editTitle.trim();
    setEditingId(null);
    if (!title) return;
    setConvos((l) => l.map((c) => (c.id === id ? { ...c, title } : c)));
    fetch(`/api/director/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }).catch(() => {});
  };

  const remove = (id: number) => {
    if (!confirm("Delete this conversation permanently? All of its messages will be removed — this cannot be undone.")) return;
    setConvos((l) => l.filter((c) => c.id !== id));
    setResults((r) => (r ? r.filter((c) => c.id !== id) : r));
    if (conversationId === id) startNew();
    fetch(`/api/director/conversations/${id}`, { method: "DELETE" }).catch(() => {});
  };

  // Debounced full-history search. All state writes live in the timeout (async),
  // so this never sets state synchronously during the effect.
  useEffect(() => {
    const q = query.trim();
    const t = setTimeout(async () => {
      if (!q) {
        setResults(null);
        setSearching(false);
        return;
      }
      setSearching(true);
      try {
        const res = await fetch(`/api/director/conversations?q=${encodeURIComponent(q)}`);
        const data = (await res.json()) as { conversations: Conversation[] };
        setResults(data.conversations ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/director/conversations?offset=${convos.length}&limit=20`);
      const data = (await res.json()) as { conversations: Conversation[] };
      setConvos((l) => {
        const seen = new Set(l.map((c) => c.id));
        return [...l, ...(data.conversations ?? []).filter((c) => !seen.has(c.id))];
      });
    } catch {
      /* ignore */
    } finally {
      setLoadingMore(false);
    }
  };

  // Sync chosenSiteId with activeSiteId once loaded (only if user hasn't chosen yet)
  useEffect(() => {
    if (chosenSiteId === null && activeSiteId !== null) {
      // One-time default of the dropdown to the active site — a guarded sync,
      // not the cascading render the rule warns about.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChosenSiteId(activeSiteId);
    }
  }, [activeSiteId, chosenSiteId]);

  // Load history when conversationId changes
  useEffect(() => {
    if (!conversationId) {
      // Reset the open-conversation view when none is selected — a
      // dependency-change reset, not a render cascade.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHistory([]);
      setConvSiteId(null);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/director/conversations/${conversationId}`);
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as { conversation: Conversation; messages: Message[] };
        setHistory(data.messages);
        setConvSiteId(data.conversation.siteId ?? null);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, [conversationId]);

  // Smart scroll: follow new messages only when the reader was already near
  // the bottom BEFORE the new content rendered — don't yank them down while
  // they're re-reading history. The pinned state is tracked from scroll
  // events (not measured post-render, which a tall new message would break).
  const pinnedRef = useRef(true);

  useEffect(() => {
    // Opening/switching a conversation always lands on the latest message.
    pinnedRef.current = true;
  }, [conversationId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (pinnedRef.current || history.length <= 1) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
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
      const body: Record<string, unknown> = {
        conversationId: conversationId ?? undefined,
        text,
      };
      // Only send siteId when starting a new conversation
      if (!conversationId && chosenSiteId !== null) {
        body.siteId = chosenSiteId;
      }
      const res = await fetch("/api/director/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as ApiResponse;
      setConversationId(data.conversationId);
      // Replace optimistic with real history fetch (also captures siteId)
      const fresh = await fetch(`/api/director/conversations/${data.conversationId}`);
      const freshData = (await fresh.json()) as { conversation: Conversation; messages: Message[] };
      setHistory(freshData.messages);
      setConvSiteId(freshData.conversation.siteId ?? null);
      // Surface a newly created conversation in the rail immediately.
      setConvos((l) =>
        l.some((c) => c.id === freshData.conversation.id)
          ? l.map((c) => (c.id === freshData.conversation.id ? freshData.conversation : c))
          : [freshData.conversation, ...l],
      );
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
    setConvSiteId(null);
    setHistory([]);
    setInput("");
    setError(null);
  };

  const isSearch = results !== null;
  const railList = results ?? convos;

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
        <div className="mx-3 mt-2 relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all chats…"
            className="w-full rounded-md border border-[#cfccc1] bg-white pl-2.5 pr-7 py-1.5 text-[12px] focus:outline-none focus:border-[#d97757]"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              title="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[12px] text-[#9a988e] hover:text-[#141413]"
            >
              ✕
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto mt-2">
          <div className="px-4 pt-3 pb-1 text-[10px] font-bold tracking-wider text-[#9a988e]">
            {isSearch ? (searching ? "SEARCHING…" : "RESULTS") : "RECENT"}
          </div>
          {railList.length === 0 ? (
            <div className="px-4 py-2 text-[11px] text-[#9a988e] italic font-serif">
              {isSearch ? (searching ? "Searching…" : "No matches") : "No conversations yet"}
            </div>
          ) : (
            <>
              {railList.map((c) => (
                <div
                  key={c.id}
                  className={`group relative w-full px-4 py-2 text-[12px] hover:bg-[#ece9e0] transition-colors ${
                    c.id === conversationId
                      ? "bg-[#e8e6dc] border-l-[3px] border-[#d97757] pl-[13px]"
                      : ""
                  }`}
                >
                  {editingId === c.id ? (
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename(c.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onBlur={() => saveRename(c.id)}
                      className="w-full rounded border border-[#cfccc1] px-1.5 py-0.5 text-[12px] focus:outline-none focus:border-[#d97757]"
                    />
                  ) : (
                    <>
                      <button onClick={() => setConversationId(c.id)} className="block w-full text-left">
                        <div className="text-[#141413] font-medium truncate pr-12">
                          {c.title ?? "Untitled"}
                        </div>
                        <div className="text-[10px] text-[#9a988e] mt-0.5">
                          {c.status}
                          {c.planApproved && " · approved"}
                        </div>
                      </button>
                      <div className="absolute right-2 top-2 hidden group-hover:flex items-center gap-1.5">
                        <button
                          title="Rename"
                          onClick={() => {
                            setEditingId(c.id);
                            setEditTitle(c.title ?? "");
                          }}
                          className="text-[12px] text-[#9a988e] hover:text-[#141413]"
                        >
                          ✎
                        </button>
                        <button
                          title="Delete permanently"
                          onClick={() => remove(c.id)}
                          className="text-[12px] text-[#9a988e] hover:text-[#a33b2b]"
                        >
                          ✕
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {!isSearch && (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full text-[11px] text-[#9a988e] hover:text-[#141413] py-2 disabled:opacity-60"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              )}
            </>
          )}
        </div>
      </aside>

      {/* Main thread */}
      <main className="flex-1 flex flex-col bg-white">
        {/* Conversation header — shows bound-site chip when a conversation is open */}
        {conversationId && convSiteId !== null && (() => {
          const site = sites.find((s) => s.id === convSiteId);
          return site ? (
            <div className="px-8 py-2 border-b border-[#e8e6dc] bg-[#faf9f5] flex items-center">
              <span className="ml-0 inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-black/5 border border-black/10">
                <span className="opacity-60">site</span>
                <span>{site.key}</span>
              </span>
            </div>
          ) : null;
        })()}
        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
          }}
          className="flex-1 overflow-y-auto px-8 py-6"
        >
          {history.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="max-w-[760px] mx-auto space-y-4">
              {history.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              {sending && <TypingIndicator />}
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
            {/* Site selector — only shown when starting a new conversation */}
            {!conversationId && sites.length > 0 && (
              <div className="mb-2 flex items-center gap-2">
                <label className="text-[11px] text-[#9a988e]" htmlFor="site-select">
                  Site
                </label>
                <select
                  id="site-select"
                  value={chosenSiteId ?? ""}
                  onChange={(e) =>
                    setChosenSiteId(e.target.value ? Number(e.target.value) : null)
                  }
                  className="rounded border border-[#cfccc1] px-2 py-1 text-[12px] text-[#141413] bg-white focus:outline-none focus:border-[#d97757]"
                >
                  <option value="">— none —</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.key}
                    </option>
                  ))}
                </select>
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
