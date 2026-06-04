# Director Chat Memory + Conversation Management — Design

**Date:** 2026-06-04
**Status:** Approved (design); pending implementation
**Surface:** Director chat (`/chat` web + Telegram), backed by `conversations` + `messages` (Neon).

## Problem

The Director already persists every message and recalls threads in the UI. But the
LLM context is built badly:

- Every turn re-sends up to **60 raw messages** to Gemini → per-turn token cost
  grows with thread length.
- Anything older than 60 messages is **silently dropped** → the Director forgets
  the early conversation even though the UI still shows it.

We want LLM-style continuous memory that is **cheap (flat per-turn token cost)**
and **unforgetting (remembers the whole thread)**, plus light conversation
management. Storage is a non-issue (plain text, ~0.3 KB/message; 1M messages ≈
300 MB inside Neon's free 0.5 GB) — but the rolling summary also caps what we
ever need to *send*.

## Chosen approach: rolling summary + recent window

Keep the last **K = 12** messages verbatim; maintain a running **summary** of
everything older. Each turn sends: cached system prompt + summary + the recent
window + the new user message → per-turn cost is **flat regardless of thread
length**, and long-term memory lives in the summary.

Rejected: plain sliding window (still forgets); RAG/embeddings (needs pgvector +
embeds every message — overkill for a single-operator Director).

## Components

### 1. Data — migration `0010_director_summary.sql`
Add to `conversations`:
- `summary TEXT` — running summary of messages already folded out of the window.
- `summary_up_to_id INTEGER NOT NULL DEFAULT 0` — highest `messages.id` included
  in `summary`. Existing rows default to empty/0 → non-breaking. `messages` is
  unchanged.

Apply directly to live Neon (the established pattern here; Neon is reachable),
and add the drizzle migration file for the record.

### 2. Context builder — `src/lib/services/conversations.ts`
- `getDirectorContext(conversationId)` → `{ summary: string | null, recent: Message[] }`
  where `recent` = messages with `id > summary_up_to_id`, oldest-first, hard-capped
  at 40 (safety). This replaces the `getMessages(id, 60)` the callers use today.
- `setConversationSummary(conversationId, summary, summaryUpToId)`.

### 3. Compaction decision — `src/lib/services/chat-compaction.ts` (pure, TDD)
- `planCompaction({ liveCount, keepRecent = 12, compactAt = 24 })`
  → `{ shouldCompact: boolean, evictCount: number }`.
  `shouldCompact = liveCount >= compactAt`; `evictCount = liveCount - keepRecent`
  (so after compaction exactly `keepRecent` remain verbatim).
- Pure + fully unit-testable; no DB.

### 4. Summarizer — `src/lib/services/chat-summary.ts`
- `summarizeConversation(existingSummary, evicted: Message[]) → Promise<string>`:
  one **Gemini Flash** (cheapest) call. Prompt: "Update this running summary of an
  SEO-ops conversation with these newer messages (oldest first). ≤400 words.
  Preserve goals, decisions, approvals, site context, and open threads. Plain
  prose." Untrusted (system/job) content is fenced + length-capped via the
  existing `fenceUntrusted`. Throws on failure (caller skips compaction).
- Add a `"summarize"` task to the model router → Flash.

### 5. `runDirectorTurn` — `src/lib/services/director.ts`
- `PlanInput` gains `summary?: string | null`; `history` now carries only the
  recent window. Transcript becomes:
  `([CONVERSATION SUMMARY (older messages)]\n<summary>)? + recent window (system
  msgs fenced) + [user] <new message>`.
- After persisting the assistant message, run **best-effort compaction**: reload
  the live count; if `planCompaction` says so, summarize the evicted oldest and
  `setConversationSummary`. Failure is swallowed — the Director never breaks.
- Callers `/api/director/message` and the Telegram webhook switch from
  `getMessages(id, 60)` to `getDirectorContext(id)`.

### 6. Conversation management
- **Rename**: `PATCH /api/director/conversations/[id]` `{ title }` →
  `updateConversation` (already supports `title`). Inline edit in the rail.
- **Archive** (soft-delete): same PATCH `{ status: "archived" }`. `listConversations`
  excludes archived by default; archived drop out of the rail.
- **Load-more**: `listConversations` gains `offset`; the chat page's recent rail
  gets a "Load more" control.

## Cost & storage

- *Tokens:* ~12 messages (~1k tokens) + ~500-token summary ≈ **flat ~1.5k/turn**
  (was ~5k and growing). One Flash summarization per ~12 messages. Long threads
  ~70%+ cheaper and non-growing.
- *Storage:* negligible (see Problem). No pruning needed; full history retained
  for browsing.

## Error handling

Every new path degrades gracefully: summarizer down → window-only (no summary
update); DB hiccup → existing defensive reads; missing summary columns (pre-
migration) → behave like today. The Director always responds.

## Testing

- **Pure / TDD:** `planCompaction` (thresholds, evict counts); transcript-assembly
  helper (summary block + window formatting).
- **Live-DB:** `getDirectorContext` / `setConversationSummary` round-trip; rename +
  archive.
- **Summarizer:** prompt-building + the tested fallback path (the Flash call itself
  is integration, not unit-tested).

## Build order

1. Migration + `getDirectorContext` / `setConversationSummary` (live-DB test).
2. `planCompaction` (pure, TDD) + transcript assembly in `runDirectorTurn`;
   switch callers to `getDirectorContext`.
3. `chat-summary` (Flash) + best-effort compaction after each turn.
4. Conversation management (rename / archive / load-more) — API + `chat-view`.
5. Full gate (tsc + lint + tests + build) → deploy (Vercel) → verify green.

## Out of scope (YAGNI)

RAG/embeddings; cross-conversation memory; message editing; thread-level
load-more (200-message load is plenty); summary versioning/history.
