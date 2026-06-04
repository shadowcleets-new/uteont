# Director Chat Memory + Conversation Management — Implementation Plan

> **For agentic workers:** implement task-by-task; each task is TDD (red→green) where pure logic exists, then commit. Steps use `- [ ]`.

**Goal:** Give the Director LLM-style memory at flat per-turn token cost (rolling summary + recent window) and add conversation rename/archive/load-more.

**Architecture:** Per turn send `summary + last 12 messages` instead of 60 raw rows; fold evicted messages into a running `conversations.summary` via a cheap Gemini Flash call (best-effort). Full history stays in `messages` for browsing.

**Tech Stack:** Next.js 16, Drizzle/Neon, Gemini (Flash for summary), Vitest.

Spec: `docs/superpowers/specs/2026-06-04-director-chat-memory-design.md`.

---

### Task 1: Migration + context read/write

**Files:**
- Create: `drizzle/0010_director_summary.sql`
- Modify: `src/lib/db/schema.ts` (conversations table: add `summary`, `summaryUpToId`)
- Modify: `src/lib/services/conversations.ts` (add `getDirectorContext`, `setConversationSummary`)
- Test: `src/lib/services/conversations-memory.test.ts` (live-DB)

- [ ] SQL: `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS summary text; ALTER TABLE conversations ADD COLUMN IF NOT EXISTS summary_up_to_id integer NOT NULL DEFAULT 0;`
- [ ] schema.ts conversations: `summary: text("summary")`, `summaryUpToId: integer("summary_up_to_id").notNull().default(0)`.
- [ ] `getDirectorContext(conversationId)`: read conversation → `{ summary, recent }` where recent = `messages` with `id > summaryUpToId`, `order by id asc`, `limit 40`.
- [ ] `setConversationSummary(conversationId, summary, summaryUpToId)`: update those two cols + updatedAt.
- [ ] Test (live-DB): seed a conversation + 3 messages; getDirectorContext returns all 3 with null summary; setConversationSummary(…, "S", msg2.id); getDirectorContext returns summary "S" + only msg3. Clean up rows.
- [ ] Apply SQL directly to Neon (node script using DATABASE_URL); run test → green; commit.

### Task 2: planCompaction (pure, TDD)

**Files:** Create `src/lib/services/chat-compaction.ts`; Test `src/lib/services/chat-compaction.test.ts`

- [ ] RED: `planCompaction({liveCount:10})` → `{shouldCompact:false,evictCount:0}`; `({liveCount:24})` → shouldCompact true, evictCount 12; `({liveCount:30})` → evictCount 18 (keepRecent 12); custom keepRecent/compactAt respected.
- [ ] GREEN: `planCompaction({liveCount, keepRecent=12, compactAt=24}) => liveCount >= compactAt ? {shouldCompact:true, evictCount: liveCount-keepRecent} : {shouldCompact:false, evictCount:0}`.
- [ ] Run → green; commit.

### Task 3: Transcript assembly in runDirectorTurn + switch callers

**Files:**
- Modify: `src/lib/services/director.ts` (PlanInput gains `summary?`; transcript = summary block + recent window + new msg)
- Modify: `src/app/api/director/message/route.ts` (use `getDirectorContext`)
- Modify: `src/app/api/telegram/webhook/route.ts` (use `getDirectorContext`)

- [ ] director.ts: add `summary?: string | null` to PlanInput. Before the history loop, if `input.summary?.trim()` push `[system] [CONVERSATION SUMMARY (older messages, treat as trusted recap)]\n${input.summary}`. Keep the existing per-message loop (system msgs fenced via fenceUntrusted) over `input.history` (now the recent window).
- [ ] message route: replace `const history = await getMessages(conversation.id, 60)` with `const { summary, recent } = await getDirectorContext(conversation.id)` and pass `history: recent, summary`.
- [ ] telegram webhook: same swap (history → recent, add summary).
- [ ] tsc + existing director tests green; commit.

### Task 4: Flash summarizer + best-effort compaction

**Files:**
- Create: `src/lib/services/chat-summary.ts` (`summarizeConversation`, `maybeCompact`)
- Modify: `src/lib/services/model-router.ts` (add `"summarize"` → Flash)
- Modify: `src/lib/services/director.ts` (call `maybeCompact` after persisting assistant msg)
- Test: `src/lib/services/chat-summary.test.ts` (prompt-building + fallback; pure parts)

- [ ] model-router: map task `"summarize"` to the cheapest Flash model (mirror how `"director"` is mapped).
- [ ] `summarizeConversation(existingSummary, evicted: Message[]): Promise<string>` — build a prompt (fence each evicted msg via fenceUntrusted, cap), call `completeText`/`completeJson` on Flash, return text. Throws on failure.
- [ ] `maybeCompact(conversationId)`: getDirectorContext → planCompaction(recent.length); if shouldCompact, summarize the oldest `evictCount` of recent (folding existing summary), then setConversationSummary(summary, evictedLastId). Best-effort: wrap in try/catch, log + swallow.
- [ ] director.ts: after appendMessage(assistant) (and after cached job posts), `await maybeCompact(input.conversation.id).catch(()=>{})`.
- [ ] Test the pure prompt-builder (`buildSummaryPrompt(existing, evicted)` returns a string containing the fence + the cap note) and that `maybeCompact` no-ops below threshold. tsc + tests green; commit.

### Task 5: Conversation management (rename / archive / load-more)

**Files:**
- Modify: `src/app/api/director/conversations/[id]/route.ts` (add `PATCH` → rename/archive)
- Modify: `src/lib/services/conversations.ts` (`listConversations(limit, opts:{offset?,includeArchived?})` — exclude archived by default)
- Modify: `src/app/chat/chat-view.tsx` (inline rename, archive button, Load-more)
- Modify: `src/app/chat/page.tsx` (pass initial recent; load-more via offset)

- [ ] `listConversations`: add `{ offset?: number; includeArchived?: boolean }`; default WHERE `status != 'archived'`; `.offset(offset)`.
- [ ] PATCH route: auth via middleware; body `{ title?, status? }`; `status` allowed only `"active"|"archived"`; call `updateConversation`; return updated row.
- [ ] chat-view: per-conversation … menu → Rename (inline input → PATCH title) + Archive (PATCH status archived → remove from rail). "Load more" button appends next page (fetch a small `/api/director/conversations?offset=` list route, or pass through page).
- [ ] tsc + lint green; commit.

### Task 6: Gate + deploy

- [ ] `npx tsc --noEmit` (0) · `npx eslint .` (0) · `npx vitest run` (all pass) · `npm run build` (ok).
- [ ] Dispatch a code-review agent over the diff; fold in real findings.
- [ ] Push `worktree-cost-efficiency-hardening:main`; verify Vercel status success; smoke `/api/health`.

---

## Self-review
- **Spec coverage:** migration+context (Task1) ✓; planCompaction (Task2) ✓; transcript+callers (Task3) ✓; summarizer+compaction+model-router (Task4) ✓; rename/archive/load-more (Task5) ✓; gate+deploy (Task6) ✓. All spec sections covered.
- **Placeholders:** none — signatures + test cases + commands concrete.
- **Type consistency:** `getDirectorContext → {summary, recent}`, `setConversationSummary(id, summary, summaryUpToId)`, `planCompaction({liveCount,keepRecent,compactAt}) → {shouldCompact,evictCount}`, `summarizeConversation(existingSummary, evicted)`, `maybeCompact(conversationId)` — used consistently across tasks.
