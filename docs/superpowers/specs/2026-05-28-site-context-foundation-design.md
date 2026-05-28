# Site Context Foundation — Design

**Date:** 2026-05-28
**Status:** Approved (operator-confirmed section-by-section, 2026-05-28)
**Author:** Director / operator pair
**Spec scope:** Foundation only — model + UI + Director integration. No platform connector yet.

---

## Motivation

UTEONT's 10 agents currently produce keywords, ideas, drafts, QA reports, and
SEO lints in the abstract — none of it bound to a destination site. The README
already anticipated this gap ("Publishing Agent currently stubbed; WordPress
REST API when a domain is connected"), but the gap has widened: every agent
now needs site-specific context (brand voice, niche, audience, banned phrases,
locale, default categories) to produce genuinely useful output.

This spec lays the foundation for site-aware operation. A separate per-platform
spec (Spec 2+) will follow for each CMS / analytics integration once this
foundation lands.

## Decisions made up front

| # | Question | Decision |
|---|---|---|
| 1 | Spec scope | Foundation only — no platform connector implementation in this spec |
| 2 | Cardinality | Multi-site, parallel — every cycle / job / article carries `siteId` |
| 3 | Profile depth | Full profile (name, domain, locale, niche, audience, voice, content pillars, banned phrases, GSC / GA4 props, sitemap, default cats / tags) |
| 4 | Director binding | Per-conversation pinned — `conversations.siteId`, set at creation |
| 5 | Connection model | Site row holds primary `cmsPlatform`; separate `site_integrations` table for additional connectors |
| 6 | Context propagation | Snapshot in `jobs.payload.site` at enqueue (reproducible, no worker→API round trip) |

---

## 1. Architecture overview

A new first-class entity, **Site**, joins `cycles` as a top-level grouping.
Every cycle / run / job / article / keyword / idea / conversation is bound to a
site. Settings page gains a **Sites** tab; the sidebar gains a **Site selector**
at the top (purely a UI filter — the database binding is always the FK in the
row).

Each site has a primary CMS platform field (`cmsPlatform`) and a separate
**site_integrations** table for additional connectors (GSC, GA4, Slack, etc.).
Foundation spec defines the table and CRUD UI for integrations but does **not**
implement any platform driver — those land in follow-up specs.

The Director Agent's system prompt is templated to inject the active
conversation's site profile (voice, niche, audience, banned phrases, content
pillars, locale, domain). When dispatching jobs, the Director snapshots the
site profile into `jobs.payload.site` so workers receive the full context inline.

Existing cycles / jobs / articles / runs get backfilled to a single
auto-created "Default Site" on migration so no historical data is orphaned.

---

## 2. Data model

### `sites` (new)

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `key` | text unique | URL-safe slug — e.g. `tonyspizza`. Used in URLs / Telegram commands |
| `name` | text NOT NULL | Display name |
| `domain` | text NOT NULL | Canonical URL e.g. `https://tonyspizza.com` |
| `locale` | text NOT NULL | BCP 47 — `en-US`, `en-GB`, etc. |
| `niche` | text | One-line topic description |
| `audience` | text | One-line persona |
| `voiceGuide` | text | Free-form brand voice paragraph (≤ ~2000 chars) |
| `contentPillars` | jsonb `string[]` | e.g. `["recipes","history","reviews"]` |
| `bannedPhrases` | jsonb `string[]` | Forbidden words / phrases for QA |
| `defaultCategories` | jsonb `string[]` | Default WP categories / tag names |
| `cmsPlatform` | text | `wordpress` \| `vercel` \| `shopify` \| `webflow` \| `ghost` \| `static` \| `none` |
| `sitemapUrl` | text nullable | |
| `gscPropertyId` | text nullable | Convenience field; mirrors a `gsc` integration when present |
| `ga4PropertyId` | text nullable | Same for GA4 |
| `status` | text default `active` | `active` \| `paused` \| `archived` |
| `createdAt` / `updatedAt` | timestamps | |

Indexes: unique on `key`, plus `status`.

### `site_integrations` (new)

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `siteId` | integer FK → `sites.id` ON DELETE CASCADE | |
| `kind` | text NOT NULL | `wordpress` \| `vercel` \| `shopify` \| `webflow` \| `ghost` \| `gsc` \| `ga4` \| `slack` \| ... |
| `label` | text | Optional user-facing name (e.g. "Main WP", "Staging WP") |
| `config` | text NOT NULL | **Encrypted** JSON blob — AES-256-GCM with `CONNECTION_ENCRYPTION_KEY` env var. Plaintext shape varies by kind |
| `configIv` | text | Init vector (per-row, base64) |
| `configTag` | text | GCM auth tag (base64) |
| `status` | text default `unverified` | `unverified` \| `connected` \| `error` |
| `lastVerifiedAt` | timestamp nullable | |
| `lastError` | text nullable | Last connector error, if any |
| `createdAt` / `updatedAt` | timestamps | |

Indexes: `(siteId, kind)` non-unique (a site may have two GSC properties), plus `status`.

### Encryption helper

Lives at `src/lib/crypto/integration-secrets.ts`:

```ts
encrypt(plaintext: object): { ciphertext: string; iv: string; tag: string }
decrypt(ciphertext: string, iv: string, tag: string): object
```

Implementation: AES-256-GCM via Node `crypto`, 32-byte key from
`process.env.CONNECTION_ENCRYPTION_KEY` (hex-encoded). Throws on missing /
wrong-length key. Ships in this spec even though no integration writes a real
cred yet, so Spec 2 plugs in cleanly.

### FK columns added to existing tables

- `cycles.siteId integer NOT NULL REFERENCES sites(id)`
- `runs.siteId integer NOT NULL REFERENCES sites(id)`
- `jobs.siteId integer NOT NULL REFERENCES sites(id)`
- `keywords.siteId integer NOT NULL REFERENCES sites(id)` (denormalized from cycle for query speed)
- `articles.siteId integer NOT NULL REFERENCES sites(id)` (same)
- `conversations.siteId integer NULL REFERENCES sites(id)` — **nullable**: Director may spawn a conversation before site is picked, then asks the user once.

Each gets an index on `siteId`.

### Migration safety

Two-phase per column: add as nullable → backfill to default site id →
`ALTER COLUMN ... SET NOT NULL` (except `conversations.siteId`, which stays
nullable by design).

---

## 3. API surface

All routes under existing auth middleware. New endpoints:

| Method · Path | Purpose |
|---|---|
| `GET /api/sites` | List sites (id, key, name, domain, status, integrationCount) |
| `POST /api/sites` | Create a site. Validates the full profile shape. Returns the new row |
| `GET /api/sites/[id]` | Full site row (no decrypted secrets) |
| `PATCH /api/sites/[id]` | Update profile fields. `key`, `domain`, `cmsPlatform` immutable post-creation |
| `DELETE /api/sites/[id]` | Soft-archive (sets `status='archived'`). Hard-delete blocked while cycles / articles exist |
| `GET /api/sites/[id]/integrations` | List integrations for a site. Response **never** includes decrypted config — only `kind`, `label`, `status`, `lastVerifiedAt` |
| `POST /api/sites/[id]/integrations` | Create integration. Body `{ kind, label?, config }`. Server encrypts `config` before insert |
| `PATCH /api/sites/[id]/integrations/[intId]` | Update label / config. Config re-encrypted |
| `DELETE /api/sites/[id]/integrations/[intId]` | Hard-delete integration row |

Existing endpoints gain a `siteId` parameter (required after migration):

- `POST /api/cycles` — must include `siteId`
- `GET /api/cycles?siteId=` — filter by site
- `GET /api/keywords?siteId=`
- `GET /api/articles?siteId=`
- `GET /api/runs?siteId=`
- `POST /api/agents/[key]/run` — required `siteId` in body; handler injects site snapshot into job payload

**Worker side:** no new endpoints. Site snapshot arrives inside the job payload
at `payload.site` on `/api/jobs/claim`. Worker reads it directly.

**Director routes:**

- Web `POST /api/director/conversations` accepts optional `siteId` at creation
- Telegram: `/site <key>` command pins the active site on a conversation;
  `/sites` lists available sites; no-site conversations get a clarifying
  question from the Director on first turn

---

## 4. UI surface

**Sidebar.** A **Site selector** lands at the top of the sidebar (above the
agents list) — dropdown of `active` sites + an "All sites" option + a
`+ Add site` shortcut. Selection is UI-state only (`kvSettings` row with
key `ui.activeSiteId` — UTEONT is single-operator so global is fine);
the data binding is always the FK in the row.

**Settings page restructured.** `/settings` becomes tabbed: `General`, `Sites`,
`Integrations`, `Auth`. The Sites tab shows the list (name, domain, platform,
integrationCount, status) and links into per-site pages.

**Per-site pages:**

- `/sites/[key]` — overview: profile summary, cycle / article counts,
  integrations list, recent runs
- `/sites/[key]/edit` — full profile form, tabbed sub-sections:
  *Identity* (name / key / domain / locale), *Voice* (niche / audience /
  voiceGuide / contentPillars / bannedPhrases), *Content* (defaultCategories /
  sitemapUrl), *Analytics* (gscPropertyId / ga4PropertyId)
- `/sites/[key]/integrations` — list + create. Create form is a two-step picker
  (pick `kind`, then kind-specific form). Foundation ships a **single generic
  key / value form** as the kind-specific UI; Spec 2 swaps in real per-platform
  UIs without changing the storage
- `/sites/new` — minimal creation form (name, key, domain, locale,
  cmsPlatform). Redirects to `/sites/[key]/edit` for the rest

**Chat surface (`/chat`).** Conversation creation gets a "Site" dropdown,
defaulting to the UI-active site. Bound site shows as a chip in the
conversation header (e.g. "tonyspizza · NYC pizza · en-US").

**Dashboard.** Adds a "Site" column to recent runs / cycles tables when "All
sites" is selected; hidden otherwise.

**Agent run buttons.** `/agents/[key]` "Run agent" form gets a Site dropdown
(required), pre-filled to the UI-active site.

**Visual style.** Existing brand tokens (`brand-*` Tailwind classes from
F-022). No new design language.

---

## 5. Director integration

Two structural changes to `src/lib/services/director.ts`:

### Site context in the system prompt

`SYSTEM_PROMPT` becomes a function `buildSystemPrompt(site: Site | null): string`.
When a site is bound, it prefixes the existing prompt with:

```
SITE CONTEXT
- Name: Tony's Pizza
- Domain: https://tonyspizza.com
- Locale: en-US
- Niche: NYC pizza & Italian-American food
- Audience: home cooks + NYC tourists
- Voice: Warm, slightly nostalgic, food-first; never corporate
- Content pillars: recipes, neighborhood history, gear reviews
- Banned phrases: "delicious", "mouth-watering", "in this article"
- Default categories: Recipes, Reviews

All proposed work is for this site unless the user explicitly redirects to a
different one. When dispatching agents, the site context above flows to the
worker in the job payload — you don't need to repeat it in args.
```

When no site is bound, the prompt instead says: *"No site selected yet for this
conversation. If the user describes site-specific work, ask which site (one
question, then propose)."*

### Snapshot into job payload

When `parsed.intent === "execute"`, the enqueue loop reads the conversation's
site (via a new `getSiteById` helper in `src/lib/services/sites.ts`) and writes:

```ts
const job = await enqueueJob({
  agentKey,
  siteId: site.id,
  payload: {
    ...action.args,
    _directorContext: { conversationId: input.conversation.id },
    site: {
      id: site.id,
      key: site.key,
      name: site.name,
      domain: site.domain,
      locale: site.locale,
      niche: site.niche,
      audience: site.audience,
      voiceGuide: site.voiceGuide,
      contentPillars: site.contentPillars,
      bannedPhrases: site.bannedPhrases,
    },
  },
});
```

Only public-safe profile fields are snapshotted. **No encrypted integration
configs ever go into payload** — those decrypt only at the call site of a
connector, which is Spec 2 territory.

### Telegram surface

- `/site <key>` pins active site on the current conversation
- `/sites` lists available sites
- Free-text in a no-site conversation → Director's first reply is a clarifying
  question (`intent: "ask"`)

### Worker contract

The worker README and any handler that consumes `payload` gets updated to
expect a `site` block. Foundation spec touches the worker only enough to
document the shape — actual use of `voiceGuide` / `bannedPhrases` in worker
prompts is per-agent follow-up work (bundled with each agent's connector spec).

---

## 6. Migration, testing, error handling

### Migration `drizzle/0003_site_foundation.sql`

Three-phase:

1. Create `sites` and `site_integrations` tables.
2. Insert default site row:
   `INSERT INTO sites (key, name, domain, locale, cmsPlatform, status)
    VALUES ('default', 'Default Site', 'https://example.invalid', 'en-US',
    'none', 'active')`.
3. For each of `cycles`, `runs`, `jobs`, `keywords`, `articles`,
   `conversations`: add nullable `siteId`, backfill from default site, then
   `ALTER COLUMN siteId SET NOT NULL` (except `conversations.siteId`).

`/api/db-status` (from F-034) expected table count updated: 12 → 14.

### Tests

- `src/lib/crypto/integration-secrets.test.ts` — Vitest. Round-trip
  encrypt→decrypt yields original. Wrong key fails. Tampered ciphertext fails
  GCM auth. Missing env var throws.
- `src/lib/services/sites.test.ts` — CRUD: create, fetch, update, archive. Key
  uniqueness enforced. Reject malformed `cmsPlatform`.
- `src/lib/services/director.test.ts` — `buildSystemPrompt(null)` includes the
  "ask which site" line; `buildSystemPrompt(site)` includes site fields.
  Snapshot test for the SITE CONTEXT block shape.
- Existing agent-run endpoint tests get `siteId` in their fixtures.

### Error handling specifics

- Duplicate `key` on site create → `409 { error: "key_taken" }`
- `kind` not in allowed enum on integration create → `400`
- Integration write without `CONNECTION_ENCRYPTION_KEY` → `500` with structured
  error and `console.error("ENCRYPTION KEY MISSING ...")` (mirrors the F-035
  SCHEMA MISSING pattern). Site CRUD itself stays functional without the key —
  only integration writes need it
- Director enqueuing a job for a conversation with no `siteId` → planner
  returns `intent: "ask"` clarifier and skips enqueue. Server-side guard:
  `enqueueJob` rejects calls with no `siteId` and logs

---

## 7. Out of scope (deferred)

Each item below is a follow-up spec, not a TODO in this one:

- Any actual platform driver (WordPress publish, Vercel deploy hook, Shopify
  product create, GSC pull, GA4 pull). Spec 2+ per platform.
- Domain ownership verification (DNS TXT or `/.well-known` check). Adds when
  first connector lands.
- Per-platform connection-form UIs (kind-specific field sets). Foundation
  ships a generic JSON form; Spec 2+ replaces it per kind.
- Worker prompt changes that actually consume `voiceGuide` / `bannedPhrases`
  in agent prompts. Each agent's worker code gets that in its own spec.
- Site-level rate limiting / quotas.
- Site-level user / team roles.
- Telegram inline-keyboard site picker (CLI commands only at v1).

---

## 8. Acceptance criteria

This spec is "done" when:

- A site can be created through the UI and appears in `GET /api/sites`.
- An integration can be attached with `kind: "wordpress"` and a config like
  `{ baseUrl, username, applicationPassword }`. The row exists encrypted.
  `GET /api/sites/[id]/integrations` never returns the plaintext config.
- Cycles created with `siteId` round-trip correctly; queries filter by
  `siteId`.
- Director, given a conversation pinned to site X, includes site X's
  voice / niche / audience in its Gemini prompt and snapshots the same fields
  into every job it enqueues. Verifiable by reading `jobs.payload.site` after
  a test `intent: "execute"` turn.
- All existing tests still pass after the migration.

---

## 9. Follow-up specs anticipated

Roughly the order I'd expect to write these:

1. **WordPress connector** — first real CMS integration; closes Publishing
   Agent (#7) stub. Includes verification ping (`GET /wp-json/wp/v2/users/me`),
   publish flow, category / tag mapping, kind-specific config UI.
2. **GSC + GA4 connectors** — wires Performance Tracking Agent (#9). OAuth
   flow per site; daily cron pulls per connected property.
3. **Vercel deploy-hook connector** — for static / Next.js-on-Vercel sites
   where "publish" means writing a markdown file to a git repo and triggering
   a deploy.
4. **Shopify** — for e-commerce sites where content lives as blog posts on a
   storefront.
5. **Webflow / Ghost** — niche; lower priority.
6. **Domain verification** — bundled with whichever connector lands first.
7. **Worker prompt overhaul** — every worker-side agent updated to consume
   `payload.site` voice / niche / banned-phrases. Bundled per-agent with
   connector work.
