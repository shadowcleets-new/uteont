# Site Switcher — Made Truly Global Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing "active site" toggle authoritative across every screen, agent, and background job, surface it on the dashboard, and lock the Director to it.

**Architecture:** A single server helper `getActiveSiteId()` becomes the one source of truth for UI/Director surfaces (replacing ~7 copy-pasted resolvers). Every list page filters by it; the `ideas` table gains the `site_id` column it lacks; background crons operate on *all* sites (never the toggle). Client site-changes trigger a router refresh so server components re-render.

**Tech Stack:** Next.js 16 (App Router, server components), Drizzle ORM + Neon Postgres, Vitest (live-DB integration tests), TypeScript.

**Spec:** `docs/specs/2026-07-01-site-switcher-global-design.md`

**Verification commands (used throughout):**
- Types: `npx tsc --noEmit`
- Lint: `npm run lint`
- Tests: `npx vitest run <path>`
- Build: `npm run build`

---

### Task 1: Single source of truth — `getActiveSiteId()`

**Files:**
- Modify: `src/lib/services/app-settings.ts` (add helper + key constant)
- Test: `src/lib/services/app-settings.active-site.test.ts` (create)
- Modify (replace local resolvers): `src/app/page.tsx`, `src/app/targets/page.tsx`, `src/app/analytics/page.tsx`, `src/app/exclusions/page.tsx`
- Modify (already use `getKvSetting` — swap to helper for consistency): `src/app/tactics/actions.ts`, `src/app/campaigns/actions.ts`, `src/app/cycles/actions.ts`
- Modify (inline query): `src/app/api/competitors/scan/route.ts`, `src/app/api/integrations/gsc/connect/route.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/services/app-settings.active-site.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { getDb } from "@/lib/db/client";
import { kvSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getActiveSiteId, ACTIVE_SITE_KEY, setActiveSiteId } from "./app-settings";

describe("getActiveSiteId", () => {
  afterEach(async () => {
    await getDb().delete(kvSettings).where(eq(kvSettings.key, ACTIVE_SITE_KEY));
  });

  it("returns null when unset", async () => {
    expect(await getActiveSiteId()).toBeNull();
  });

  it("round-trips a set id", async () => {
    await setActiveSiteId(4242);
    expect(await getActiveSiteId()).toBe(4242);
  });

  it("returns null (not a crash) when the stored shape is unexpected", async () => {
    await getDb().insert(kvSettings).values({ key: ACTIVE_SITE_KEY, value: { nope: true } });
    expect(await getActiveSiteId()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/services/app-settings.active-site.test.ts`
Expected: FAIL — `getActiveSiteId` / `setActiveSiteId` / `ACTIVE_SITE_KEY` not exported.

- [ ] **Step 3: Add the helper**

In `src/lib/services/app-settings.ts`, after the `// #endregion` of "Generic kv access" (line 40), add:

```ts
// #region Active site (UI/Director source of truth)
export const ACTIVE_SITE_KEY = "ui.activeSiteId";

/** The UI/Director-selected site, or null if none is selected. Fails soft. */
export async function getActiveSiteId(): Promise<number | null> {
  const raw = await getKvSetting<{ id?: unknown } | null>(ACTIVE_SITE_KEY, null);
  const id = raw && typeof raw === "object" ? (raw as { id?: unknown }).id : null;
  return typeof id === "number" ? id : null;
}

export async function setActiveSiteId(id: number | null): Promise<void> {
  await setKvSetting(ACTIVE_SITE_KEY, { id });
}
// #endregion
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/services/app-settings.active-site.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Point `/api/ui/active-site` at the helper (keep one storage shape)**

In `src/app/api/ui/active-site/route.ts`, replace the inline `kvSettings` reads/writes with `getActiveSiteId()` / `setActiveSiteId()`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getActiveSiteId, setActiveSiteId } from "@/lib/services/app-settings";

export async function GET() {
  return NextResponse.json({ siteId: await getActiveSiteId() });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const siteId = body?.siteId;
  if (siteId !== null && typeof siteId !== "number") {
    return NextResponse.json({ error: "siteId must be number or null" }, { status: 400 });
  }
  await setActiveSiteId(siteId);
  return NextResponse.json({ siteId });
}
```

- [ ] **Step 6: Replace the 4 duplicated `getActiveSiteIdServer()` resolvers**

In each of `src/app/page.tsx`, `src/app/targets/page.tsx`, `src/app/analytics/page.tsx`, `src/app/exclusions/page.tsx`: delete the local `async function getActiveSiteIdServer()` and its now-unused `kvSettings`/`eq` imports, then replace each call `await getActiveSiteIdServer()` with `await getActiveSiteId()`, importing it:

```ts
import { getActiveSiteId } from "@/lib/services/app-settings";
```

- [ ] **Step 7: Swap the `getKvSetting('ui.activeSiteId')` call sites**

In `src/app/tactics/actions.ts`, `src/app/campaigns/actions.ts`, `src/app/cycles/actions.ts`, replace `await getKvSetting<number | null>("ui.activeSiteId", null)` with `await getActiveSiteId()` (import from `@/lib/services/app-settings`). Remove any `listSites()[0]` fallback so a null active site yields the empty state uniformly (the actions should early-return / no-op when null, matching their existing null branch).

- [ ] **Step 8: Swap the two inline API queries**

In `src/app/api/competitors/scan/route.ts` and `src/app/api/integrations/gsc/connect/route.ts`, replace the inline `kvSettings … where(eq(kvSettings.key,"ui.activeSiteId"))` block with `const siteId = await getActiveSiteId();` (import the helper; drop now-unused imports).

- [ ] **Step 9: Verify nothing else resolves the site ad-hoc**

Run: `npx vitest run src/lib/services/app-settings.active-site.test.ts && npx tsc --noEmit`
Then: search for stragglers — `rg "ui.activeSiteId|getActiveSiteIdServer" src` should now show matches ONLY in `app-settings.ts`. Expected: clean tsc, no stragglers.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor(site): single getActiveSiteId() source of truth (Phase 1 task 1)"
```

---

### Task 2: Site-filter the Runs, Articles, and Pipeline pages

**Files:**
- Modify: `src/app/runs/page.tsx`, `src/app/articles/page.tsx`, `src/app/pipeline/page.tsx`

These tables already have `site_id`; the pages just ignore it.

- [ ] **Step 1: Runs page — scope by active site**

In `src/app/runs/page.tsx`, change `fetchRuns` to take a `siteId` and AND it into the where. Import `and, eq` from `drizzle-orm` and `getActiveSiteId`:

```ts
async function fetchRuns(siteId: number, subject?: string): Promise<Run[]> {
  try {
    const db = getDb();
    const where = subject
      ? and(eq(runs.siteId, siteId), eq(runs.subjectKey, subject))
      : eq(runs.siteId, siteId);
    return await db.select().from(runs).where(where).orderBy(desc(runs.id)).limit(200);
  } catch {
    return [];
  }
}
```

In the page body, resolve the site and render the pick-a-site empty state when null:

```ts
const activeSiteId = await getActiveSiteId();
if (!activeSiteId) return <PickASite />;   // see Step 4
const rows = await fetchRuns(activeSiteId, subject);
```

- [ ] **Step 2: Articles page — scope by active site**

In `src/app/articles/page.tsx`, mirror Step 1: `fetchArticles(siteId, status?)` with `where = status ? and(eq(articles.siteId, siteId), eq(articles.status, status)) : eq(articles.siteId, siteId)`; resolve `activeSiteId` in the body, render `<PickASite />` when null.

- [ ] **Step 3: Pipeline page — scope by active site**

In `src/app/pipeline/page.tsx`, resolve `const activeSiteId = await getActiveSiteId()`; render `<PickASite />` when null; pass `activeSiteId` into whatever cycle/stage query drives the stepper so it only reflects the active site (filter the cycle lookup by `cycles.siteId = activeSiteId`).

- [ ] **Step 4: Shared empty-state component**

Create `src/components/pick-a-site.tsx` (a small server-safe component) so the three pages share one empty state:

```tsx
import Link from "next/link";
export function PickASite() {
  return (
    <div className="px-9 py-8 max-w-[1100px]">
      <p className="text-[13px] text-[#6b6a64]">
        Select a site from the switcher to see this. <Link href="/sites" className="underline">Manage sites</Link>.
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint`
Manual check after deploy/dev: toggle site → Runs/Articles/Pipeline change contents; "All sites"/none → pick-a-site prompt. Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(site): scope Runs/Articles/Pipeline to the active site (Phase 1 task 2)"
```

---

### Task 3: `ideas.site_id` — schema, backfill (delete orphans), stamp on insert, filter page

**Files:**
- Modify: `src/lib/db/schema.ts` (ideas table)
- Create: `scripts/backfill-ideas-site-id.mjs`
- Modify: `src/lib/services/jobs.ts` (`persistIdeas` + its caller)
- Modify: `src/app/ideas/page.tsx`
- Test: `src/lib/services/jobs.persist-ideas.test.ts` (create)

> ⚠️ **Prod-affecting:** Steps 2 and 4 run `db:push` and a delete against the live Neon DB. STOP and get the owner's go-ahead before each (per spec). Orphan ideas (no run/cycle/keyword → no derivable site) are **deleted** (owner decision).

- [ ] **Step 1: Add the column (nullable first) + index to the schema**

In `src/lib/db/schema.ts`, in the `ideas` table object, add after `runId`:

```ts
    siteId:       integer("site_id").references(() => sites.id),
```

and add to the index builder:

```ts
    bySite:    index("ideas_site_idx").on(t.siteId),
```

(Nullable for now — we backfill before tightening.)

- [ ] **Step 2: Push the nullable column to the DB** ⚠️ owner go-ahead

Run: `npm run db:push`
Expected: Drizzle adds `ideas.site_id` (nullable) + index, no data loss prompt. If it prompts, read the diff aloud to the owner before confirming.

- [ ] **Step 3: Write the backfill + orphan-delete script**

Create `scripts/backfill-ideas-site-id.mjs`:

```js
// Backfill ideas.site_id from run -> cycle -> keyword (in that preference order),
// then DELETE ideas with no derivable site (owner decision). Idempotent.
import "dotenv/config";
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);

const r1 = await sql`UPDATE ideas i SET site_id = r.site_id
  FROM runs r WHERE i.run_id = r.id AND i.site_id IS NULL`;
const r2 = await sql`UPDATE ideas i SET site_id = c.site_id
  FROM cycles c WHERE i.cycle_id = c.id AND i.site_id IS NULL`;
const r3 = await sql`UPDATE ideas i SET site_id = k.site_id
  FROM keywords k WHERE i.keyword_id = k.id AND i.site_id IS NULL`;

const orphans = await sql`SELECT count(*)::int AS n FROM ideas WHERE site_id IS NULL`;
console.log("Backfilled via run/cycle/keyword. Remaining orphans:", orphans[0].n);
if (orphans[0].n > 0) {
  const del = await sql`DELETE FROM ideas WHERE site_id IS NULL`;
  console.log("Deleted orphan ideas:", del.length ?? "(ok)");
}
const left = await sql`SELECT count(*)::int AS n FROM ideas WHERE site_id IS NULL`;
console.log("Remaining NULL site_id (must be 0):", left[0].n);
```

- [ ] **Step 4: Run the backfill** ⚠️ owner go-ahead (it deletes orphans)

Run: `node scripts/backfill-ideas-site-id.mjs`
Expected: prints orphan count, deletes them, ends with "Remaining NULL site_id (must be 0): 0". Report the deleted count to the owner.

- [ ] **Step 5: Tighten to NOT NULL**

In `src/lib/db/schema.ts`, change the `ideas.siteId` line to:

```ts
    siteId:       integer("site_id").notNull().references(() => sites.id),
```

Run: `npm run db:push` (⚠️ owner go-ahead) — succeeds because Step 4 left zero NULLs.

- [ ] **Step 6: Write the failing test for insert-time stamping**

Create `src/lib/services/jobs.persist-ideas.test.ts` — create a site, run `persistIdeas(siteId, null, { ideas:[{keyword:"k",angle:"a",brief:"b"}] })`, assert the inserted idea row has `siteId === siteId`; clean up. (Use the existing live-DB test style from `sites.test.ts`.)

```ts
import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db/client";
import { ideas, sites } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { createSite } from "./sites";
import { persistIdeasForTest } from "./jobs"; // exported in Step 7

describe("persistIdeas stamps siteId", () => {
  it("sets site_id on new ideas", async () => {
    const site = await createSite({ key: `t-${Math.random().toString(36).slice(2,8)}`,
      name: "T", domain: "https://t.com", locale: "en-US", cmsPlatform: "none",
      contentPillars: [], bannedPhrases: [], defaultCategories: [] });
    await persistIdeasForTest(site.id, null, { ideas: [{ keyword: "k", angle: "a", brief: "b" }] });
    const [row] = await getDb().select().from(ideas).where(eq(ideas.siteId, site.id)).orderBy(desc(ideas.id)).limit(1);
    expect(row?.siteId).toBe(site.id);
    await getDb().delete(ideas).where(eq(ideas.siteId, site.id));
    await getDb().delete(sites).where(eq(sites.id, site.id));
  });
});
```

- [ ] **Step 7: Add siteId to `persistIdeas` and stamp it**

In `src/lib/services/jobs.ts`, change `persistIdeas(cycleId, result)` to `persistIdeas(siteId: number, cycleId: number | null, result)`, add `siteId,` to the `db.insert(ideas).values({ ... })` object, and update the caller (the `applyJobResult`/idea-generation branch — it already has the job's `siteId`, as `persistArticle(siteId, …)` shows) to pass `siteId`. Export a test alias at the bottom of the file: `export const persistIdeasForTest = persistIdeas;`.

- [ ] **Step 8: Run the test**

Run: `npx vitest run src/lib/services/jobs.persist-ideas.test.ts`
Expected: PASS.

- [ ] **Step 9: Filter the Ideas page by active site**

In `src/app/ideas/page.tsx`, change `fetchIdeas(status)` to `fetchIdeas(siteId, status)` with `where = status ? and(eq(ideas.siteId, siteId), eq(ideas.status, status)) : eq(ideas.siteId, siteId)` (import `and`); resolve `activeSiteId` in the body; render `<PickASite />` when null.

- [ ] **Step 10: Verify + commit**

Run: `npx tsc --noEmit && npx vitest run src/lib/services/jobs.persist-ideas.test.ts`

```bash
git add -A
git commit -m "feat(ideas): add site_id (backfill+delete orphans), stamp on insert, scope Ideas page (Phase 1 task 3)"
```

---

### Task 4: Fix the performance cron (all sites, not the `"default"` placeholder)

**Files:**
- Modify: `src/app/api/cron/performance/route.ts`
- Modify: `src/lib/services/sites.ts` (reuse `listSites()` — already exported)

- [ ] **Step 1: Replace the hardcoded `"default"` site with a loop over all live sites**

Rewrite `src/app/api/cron/performance/route.ts`:

```ts
import { NextResponse } from "next/server";
import { startRun, finishRun } from "@/lib/services/runs";
import { listSites } from "@/lib/services/sites";
import { runPerformanceTracking } from "@/lib/agent-runners/performance-tracking";

// Cron: pull GSC/GA4 performance for EVERY active site (a scheduled job has no
// UI session, so it must NOT use the UI active-site toggle). Auth via CRON_SECRET.
export async function GET() {
  const sites = await listSites(); // excludes archived
  const results = [];
  for (const site of sites) {
    const run = await startRun({
      subjectKey: "agent.performance-tracking", category: "agent",
      action: "daily-pull", siteId: site.id,
    }).catch(() => null);
    const result = await runPerformanceTracking(site.id, site.domain).catch((e) => ({ error: String(e) }));
    if (run) {
      await finishRun({ runId: run.id, status: "success", result: result as Record<string, unknown> }).catch(() => null);
    }
    results.push({ site: site.key, ...result });
  }
  return NextResponse.json({ ok: true, sites: results.length, results });
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: clean (no more `getSiteByKey("default")`).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "fix(cron): performance pull runs for all sites, not the seeded default (Phase 1 task 4)"
```

---

### Task 5: Surface the switcher on the dashboard + refresh server components on change

**Files:**
- Modify: `src/lib/hooks/use-active-site.ts` (router refresh on change)
- Modify: `src/components/site-selector.tsx` (relabel the empty option)
- Modify: `src/app/page.tsx` (render `<SiteSelector />` in the dashboard body)

- [ ] **Step 1: Refresh server components when the site changes**

In `src/lib/hooks/use-active-site.ts`, import and call the router so server-rendered pages re-fetch:

```ts
import { useRouter } from "next/navigation";
// inside useActiveSite:
const router = useRouter();
const update = useCallback(async (id: number | null) => {
  await fetch("/api/ui/active-site", { method: "PUT",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ siteId: id }) });
  setActiveSiteId(id);
  router.refresh();
}, [router]);
```

- [ ] **Step 2: Relabel the ambiguous empty option**

In `src/components/site-selector.tsx`, change `<option value="">All sites</option>` to `<option value="">Select a site…</option>` (null now uniformly means "none selected", matching the pages' pick-a-site state).

- [ ] **Step 3: Put the switcher on the dashboard**

In `src/app/page.tsx`, import `SiteSelector` (`import { SiteSelector } from "@/components/site-selector";`) and render it near the top of the dashboard header block (above the stat cards), e.g. inside a `<div className="mb-4 max-w-xs">`.

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit && npm run lint`
Manual: change the dashboard switcher → stats + agent cards re-render for the chosen site without a manual reload.

```bash
git add -A
git commit -m "feat(dashboard): site switcher on the dashboard + refresh on change (Phase 1 task 5)"
```

---

### Task 6: Lock the Director to the active site

**Files:**
- Modify: `src/app/api/director/message/route.ts` (server resolves site from the toggle)
- Modify: `src/app/chat/chat-view.tsx` (remove per-conversation override)

- [ ] **Step 1: Server resolves the site for new conversations**

In `src/app/api/director/message/route.ts`, drop `siteId` from `BodySchema` and, for a new conversation, use the active site:

```ts
import { getActiveSiteId } from "@/lib/services/app-settings";
// ...
if (!conversation) {
  const siteId = await getActiveSiteId();
  conversation = await createConversation({ surface: "web", siteId });
}
```

(Existing conversations retain their site — a thread about site A doesn't silently switch. To work on another site, start a new chat.)

- [ ] **Step 2: Remove the client override**

In `src/app/chat/chat-view.tsx`: remove the `chosenSiteId` state and its sync `useEffect` (lines ~116–124), remove the site `<select>` from the composer, and stop sending `siteId` in the POST body to `/api/director/message`. Confirm with `rg "chosenSiteId" src/app/chat` returns nothing.

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit && npm run lint`
Manual: with a site selected, start a new Director chat → the conversation binds to that site.

```bash
git add -A
git commit -m "feat(director): always operate on the globally selected site (Phase 1 task 6)"
```

---

### Task 7: Full verification sweep

- [ ] **Step 1: No stragglers**

Run: `rg "ui\.activeSiteId|getActiveSiteIdServer|getSiteByKey\(\"default\"\)|chosenSiteId" src`
Expected: matches ONLY in `app-settings.ts` (the helper) — everything else migrated.

- [ ] **Step 2: Full gate**

Run: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: tsc clean, lint clean, all tests pass, build exit 0.

- [ ] **Step 3: Manual smoke (dev or preview)**

Toggle the site on the dashboard and confirm every surface re-scopes: Dashboard stats/agents, Targets, Analytics, Exclusions, Ideas, Runs, Articles, Pipeline, Competitors, and a new Director chat. Confirm `Select a site…` shows the pick-a-site prompt everywhere.

- [ ] **Step 4: Final commit (if any sweep fixes)**

```bash
git add -A
git commit -m "chore(site): verification sweep for global site switcher (Phase 1 task 7)"
```
