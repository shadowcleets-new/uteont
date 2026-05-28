# Site Context Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class `Site` entity with full per-site profile (voice, niche, audience, banned phrases, content pillars, locale, GSC/GA4 props) plus a `site_integrations` table with encrypted config storage, thread `siteId` through cycles/jobs/articles/conversations, and make the Director Agent site-aware (system-prompt context + payload snapshot).

**Architecture:** Two new tables (`sites`, `site_integrations`); `siteId` FK added to six existing tables with 3-phase migration that backfills a default site. Site profile snapshots into `jobs.payload.site` at Director enqueue time. Foundation only — no platform driver implementation in this plan.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Drizzle ORM (Postgres / Neon) · NextAuth v5 · Vitest · Tailwind v4 · Node `crypto` (AES-256-GCM) · `zod` v4 for input validation.

**Source spec:** `docs/superpowers/specs/2026-05-28-site-context-foundation-design.md`

---

## File Structure

**New files**

| Path | Responsibility |
|---|---|
| `src/lib/crypto/integration-secrets.ts` | AES-256-GCM encrypt/decrypt helpers for integration configs |
| `src/lib/crypto/integration-secrets.test.ts` | Round-trip, tamper, missing-key tests |
| `src/lib/services/sites.ts` | CRUD service for the `sites` table |
| `src/lib/services/sites.test.ts` | Unit tests for the site service |
| `src/lib/services/integrations.ts` | CRUD service for `site_integrations` (encryption-aware) |
| `src/lib/services/integrations.test.ts` | Unit tests; verifies plaintext never leaves layer |
| `src/lib/validation/site.ts` | `zod` schemas: `siteCreateSchema`, `siteUpdateSchema`, `integrationCreateSchema` |
| `src/app/api/sites/route.ts` | `GET` list / `POST` create |
| `src/app/api/sites/[id]/route.ts` | `GET` one / `PATCH` / `DELETE` (archive) |
| `src/app/api/sites/[id]/integrations/route.ts` | `GET` list / `POST` create integration |
| `src/app/api/sites/[id]/integrations/[intId]/route.ts` | `PATCH` / `DELETE` integration |
| `src/app/sites/page.tsx` | Sites index (also linked from Settings tab) |
| `src/app/sites/new/page.tsx` | New-site form (minimal: name/key/domain/locale/cmsPlatform) |
| `src/app/sites/[key]/page.tsx` | Site overview |
| `src/app/sites/[key]/edit/page.tsx` | Tabbed full-profile editor |
| `src/app/sites/[key]/integrations/page.tsx` | Integration list + generic JSON create form |
| `src/components/site-selector.tsx` | Sidebar dropdown component |
| `src/lib/hooks/use-active-site.ts` | Client hook reading/writing `ui.activeSiteId` |
| `drizzle/0004_site_foundation.sql` | The migration (hand-edited from drizzle-kit output) |

**Modified files**

| Path | Change |
|---|---|
| `src/lib/db/schema.ts` | Add `sites`, `site_integrations`; add `siteId` to cycles/runs/jobs/keywords/articles/conversations |
| `src/lib/services/director.ts` | Replace static `SYSTEM_PROMPT` with `buildSystemPrompt(site)`; snapshot site into payload; read conversation site at enqueue |
| `src/lib/services/director.test.ts` | New tests for `buildSystemPrompt(null)` / `buildSystemPrompt(site)` |
| `src/lib/services/conversations.ts` | Accept `siteId` on create; expose `getConversationWithSite` |
| `src/lib/services/jobs.ts` | `enqueueJob` requires `siteId` |
| `src/lib/services/cycles.ts` | Require `siteId` on create; accept `siteId` filter |
| `src/lib/services/keywords.ts` | Filter by `siteId`; default site from cycle |
| `src/lib/services/runs.ts` | Filter by `siteId` |
| `src/app/api/cycles/route.ts` · `[id]/route.ts` | Require + accept `siteId` |
| `src/app/api/agents/[key]/run/route.ts` | Require `siteId`; load site; pass to runner so payload includes `site` snapshot |
| `src/app/api/keywords/route.ts` · `articles/route.ts` · `runs/route.ts` | Accept `siteId` query param |
| `src/app/api/director/conversations/route.ts` | Accept optional `siteId` |
| `src/app/api/telegram/webhook/route.ts` | Add `/site <key>` / `/sites` commands; route per-conversation site |
| `src/app/api/health/route.ts` · `db-status/route.ts` | Expected table count 12 → 14 |
| `src/app/settings/page.tsx` | Tabbed: General / Sites / Integrations / Auth |
| `src/app/chat/page.tsx` | Site dropdown in conversation create; chip in header |
| `src/app/agents/[key]/page.tsx` | Site dropdown in run form (required) |
| `src/app/page.tsx` | "Site" column on recent runs when "All sites" active |
| Sidebar component (path inferred from `app/layout.tsx`) | Mount `<SiteSelector />` at top |
| `worker/README.md` | Document `payload.site` shape; note: actual consumption per agent is a follow-up spec |

---

## Conventions to Follow

- **Test colocation.** Tests live next to source: `foo.ts` ↔ `foo.test.ts`. Vitest picks up `src/**/*.test.ts`.
- **Import alias.** `@/` → `src/`. Use it (matches existing `src/lib/services/director.ts`).
- **Service shape.** Each service file exports plain async functions returning Drizzle row types (see `src/lib/services/auth-config.ts` for the pattern).
- **Three-state returns on missing data.** Match the F-035 pattern when a DB error vs no-row matters (e.g., `getActiveSiteId(): SiteRow | null | undefined`). Most services here can stay two-state — only adopt three-state where schema-missing would cause confusing UI.
- **Migration numbering.** Last applied migration is `0003_lumpy_scorpion.sql`. The new one is `0004_site_foundation.sql` (rename drizzle-kit's auto-name to a hand-readable slug).
- **`/api/db-status` table-count constant.** Was 12 (from F-034 work) → becomes 14 after this plan.
- **Brand tokens.** UI uses `brand-*` Tailwind classes (F-022). No new colors.

---

## Task 1: Encryption helper (TDD)

**Files:**
- Create: `src/lib/crypto/integration-secrets.ts`
- Test: `src/lib/crypto/integration-secrets.test.ts`

This is intentionally first — it's a pure pure-function module with no DB dependency, perfect for TDD warm-up and de-risks the encryption-at-rest commitment in the spec.

- [ ] **Step 1.1: Add `CONNECTION_ENCRYPTION_KEY` to `.env.example`**

Edit `.env.example`, add at the bottom of the secrets block:

```
# 64-hex-char (32-byte) AES-256 key for encrypting site_integrations.config
# Generate locally:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
CONNECTION_ENCRYPTION_KEY=
```

Set a local value in your `.env.local` for tests (any 64-hex-char string).

- [ ] **Step 1.2: Write the failing tests**

Create `src/lib/crypto/integration-secrets.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";

describe("integration-secrets", () => {
  beforeEach(() => {
    process.env.CONNECTION_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  it("round-trips an object through encrypt → decrypt", async () => {
    const { encrypt, decrypt } = await import("./integration-secrets");
    const plaintext = { baseUrl: "https://x.com", token: "abc123" };
    const { ciphertext, iv, tag } = encrypt(plaintext);
    expect(ciphertext).not.toContain("abc123");
    expect(decrypt(ciphertext, iv, tag)).toEqual(plaintext);
  });

  it("rejects tampered ciphertext (GCM auth tag fails)", async () => {
    const { encrypt, decrypt } = await import("./integration-secrets");
    const { ciphertext, iv, tag } = encrypt({ foo: "bar" });
    const tampered =
      Buffer.from(ciphertext, "base64").map((b, i) => (i === 0 ? b ^ 1 : b))
        .toString("base64");
    expect(() => decrypt(tampered, iv, tag)).toThrow();
  });

  it("rejects with a different key", async () => {
    const { encrypt, decrypt } = await import("./integration-secrets");
    const { ciphertext, iv, tag } = encrypt({ foo: "bar" });
    process.env.CONNECTION_ENCRYPTION_KEY =
      "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    expect(() => decrypt(ciphertext, iv, tag)).toThrow();
  });

  it("throws if key missing", async () => {
    delete process.env.CONNECTION_ENCRYPTION_KEY;
    const mod = await import("./integration-secrets");
    expect(() => mod.encrypt({ foo: "bar" })).toThrow(/CONNECTION_ENCRYPTION_KEY/);
  });

  it("throws if key wrong length", async () => {
    process.env.CONNECTION_ENCRYPTION_KEY = "tooShort";
    const mod = await import("./integration-secrets");
    expect(() => mod.encrypt({ foo: "bar" })).toThrow(/64.*hex/i);
  });
});
```

- [ ] **Step 1.3: Run tests, verify they fail**

```bash
npm test -- src/lib/crypto/integration-secrets.test.ts
```

Expected: `Cannot find module './integration-secrets'` or all 5 fail.

- [ ] **Step 1.4: Implement the helper**

Create `src/lib/crypto/integration-secrets.ts`:

```ts
/**
 * AES-256-GCM encryption helpers for site_integrations.config.
 *
 * Plaintext objects are JSON-stringified, then encrypted with a per-row IV.
 * The GCM auth tag is stored separately so callers can verify integrity on
 * decrypt. Throws loudly if CONNECTION_ENCRYPTION_KEY is missing or wrong
 * length — we never want to silently use a degenerate key.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function getKey(): Buffer {
  const hex = process.env.CONNECTION_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "CONNECTION_ENCRYPTION_KEY env var not set — refusing to encrypt integration config",
    );
  }
  if (hex.length !== 64 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(
      "CONNECTION_ENCRYPTION_KEY must be 64 hex chars (32 bytes for AES-256)",
    );
  }
  return Buffer.from(hex, "hex");
}

export interface EncryptedBlob {
  ciphertext: string; // base64
  iv: string; // base64
  tag: string; // base64
}

export function encrypt(plaintext: object): EncryptedBlob {
  const key = getKey();
  const iv = randomBytes(12); // GCM standard
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const payload = Buffer.from(JSON.stringify(plaintext), "utf8");
  const enc = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decrypt(
  ciphertext: string,
  iv: string,
  tag: string,
): object {
  const key = getKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const enc = Buffer.from(ciphertext, "base64");
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return JSON.parse(dec.toString("utf8"));
}
```

- [ ] **Step 1.5: Run tests, verify they pass**

```bash
npm test -- src/lib/crypto/integration-secrets.test.ts
```

Expected: 5/5 passing.

- [ ] **Step 1.6: Commit**

```bash
git add src/lib/crypto/integration-secrets.ts src/lib/crypto/integration-secrets.test.ts .env.example
git commit -m "feat(crypto): AES-256-GCM encryption helper for site_integrations.config"
```

---

## Task 2: DB schema additions + migration

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `drizzle/0004_site_foundation.sql` (after hand-editing drizzle-kit's output)
- Modify: `src/app/api/db-status/route.ts` (table count 12 → 14)

- [ ] **Step 2.1: Add `sites` table to `schema.ts`**

Append to `src/lib/db/schema.ts`, before the `cycles` declaration (so it can be referenced by FKs later):

```ts
export const sites = pgTable(
  "sites",
  {
    id:                serial("id").primaryKey(),
    key:               text("key").notNull(),
    name:              text("name").notNull(),
    domain:            text("domain").notNull(),
    locale:            text("locale").notNull(),
    niche:             text("niche"),
    audience:          text("audience"),
    voiceGuide:        text("voice_guide"),
    contentPillars:    jsonb("content_pillars").$type<string[]>().notNull().default([]),
    bannedPhrases:     jsonb("banned_phrases").$type<string[]>().notNull().default([]),
    defaultCategories: jsonb("default_categories").$type<string[]>().notNull().default([]),
    cmsPlatform:       text("cms_platform").notNull().default("none"),
    sitemapUrl:        text("sitemap_url"),
    gscPropertyId:     text("gsc_property_id"),
    ga4PropertyId:     text("ga4_property_id"),
    status:            text("status").notNull().default("active"),
    createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:         timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byKey:    index("sites_key_idx").on(t.key),
    byStatus: index("sites_status_idx").on(t.status),
  }),
);

export const siteIntegrations = pgTable(
  "site_integrations",
  {
    id:              serial("id").primaryKey(),
    siteId:          integer("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    kind:            text("kind").notNull(),
    label:           text("label"),
    config:          text("config").notNull(),   // base64 ciphertext
    configIv:        text("config_iv").notNull(),
    configTag:       text("config_tag").notNull(),
    status:          text("status").notNull().default("unverified"),
    lastVerifiedAt:  timestamp("last_verified_at", { withTimezone: true }),
    lastError:       text("last_error"),
    createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySite: index("site_integrations_site_idx").on(t.siteId),
    byKind: index("site_integrations_kind_idx").on(t.siteId, t.kind),
    byStatus: index("site_integrations_status_idx").on(t.status),
  }),
);
```

Then add the unique constraint on `key`. Drizzle's `text(...).notNull().unique()` works but interferes with later index lines; instead use `uniqueIndex` from `drizzle-orm/pg-core`:

```ts
// at top of file, extend the existing pg-core import:
import {
  pgTable, serial, text, timestamp, jsonb, integer, real, boolean, index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
```

…and switch `byKey` in the `sites` table to:

```ts
byKey:    uniqueIndex("sites_key_unique_idx").on(t.key),
```

Append exported types at the bottom of the file:

```ts
export type Site = typeof sites.$inferSelect;
export type SiteIntegration = typeof siteIntegrations.$inferSelect;
```

- [ ] **Step 2.2: Add `siteId` FK columns to existing tables**

In `schema.ts`, edit each of these table declarations to add the `siteId` column. For now, define them as **nullable** (the migration's three-phase plan flips them to NOT NULL after backfill).

Within `cycles`:

```ts
siteId: integer("site_id").references(() => sites.id),
```

Add a matching index inside the existing `(t) => ({ ... })` block:

```ts
bySite: index("cycles_site_idx").on(t.siteId),
```

Repeat for `runs`, `jobs`, `keywords`, `articles`, and `conversations` — same column name, same FK target, same index pattern (named `<table>_site_idx`).

> ⚠️ Drizzle's `pgTable` factory takes the index map as a second arg. The existing tables already use this pattern; just extend their existing object.

- [ ] **Step 2.3: Generate the drizzle migration**

```bash
npm run db:generate
```

Drizzle-kit will create something like `drizzle/0004_<random_name>.sql`. Open it and confirm it contains:
1. `CREATE TABLE sites (...)`
2. `CREATE TABLE site_integrations (...)`
3. `ALTER TABLE cycles ADD COLUMN site_id integer REFERENCES sites(id)`
4. (Same for the other five tables)
5. Index creations

Rename the file to `drizzle/0004_site_foundation.sql` and update the corresponding entry in `drizzle/meta/_journal.json` to reflect the new filename.

- [ ] **Step 2.4: Hand-edit the migration to add backfill + NOT NULL flip**

After the auto-generated SQL (which creates tables and adds nullable columns), append:

```sql
-- Insert a default site for backfill so no historical row is orphaned.
INSERT INTO sites (key, name, domain, locale, cms_platform, status)
VALUES ('default', 'Default Site', 'https://example.invalid', 'en-US', 'none', 'active');

-- Backfill siteId on existing rows.
UPDATE cycles        SET site_id = (SELECT id FROM sites WHERE key = 'default') WHERE site_id IS NULL;
UPDATE runs          SET site_id = (SELECT id FROM sites WHERE key = 'default') WHERE site_id IS NULL;
UPDATE jobs          SET site_id = (SELECT id FROM sites WHERE key = 'default') WHERE site_id IS NULL;
UPDATE keywords      SET site_id = (SELECT id FROM sites WHERE key = 'default') WHERE site_id IS NULL;
UPDATE articles      SET site_id = (SELECT id FROM sites WHERE key = 'default') WHERE site_id IS NULL;
-- conversations stays nullable by design — do not backfill or flip.

-- Flip to NOT NULL on the five tables where the column is required.
ALTER TABLE cycles   ALTER COLUMN site_id SET NOT NULL;
ALTER TABLE runs     ALTER COLUMN site_id SET NOT NULL;
ALTER TABLE jobs     ALTER COLUMN site_id SET NOT NULL;
ALTER TABLE keywords ALTER COLUMN site_id SET NOT NULL;
ALTER TABLE articles ALTER COLUMN site_id SET NOT NULL;
```

Then update `schema.ts` for those five tables — replace `integer("site_id").references(...)` with `integer("site_id").notNull().references(...)`. (Leave `conversations.siteId` nullable.)

- [ ] **Step 2.5: Apply migration to local DB and verify**

```bash
npm run db:migrate
```

Expected output: `[✓] migrations applied successfully!` AND verify with:

```bash
npm run db:studio
# or psql:
psql "$DATABASE_URL" -c "\dt" -c "SELECT * FROM sites;" -c "SELECT count(*), site_id FROM cycles GROUP BY site_id;"
```

Expected: 14 tables present (was 12), one `default` site exists, every pre-existing `cycles` row has `site_id` = the default site's id.

- [ ] **Step 2.6: Update `/api/db-status` expected table count**

Open `src/app/api/db-status/route.ts`. Find the constant that lists expected tables (search for `expectedTables` or the literal `12`). Add `"sites"` and `"site_integrations"` to the expected-tables list, bumping the count from 12 to 14.

If the file currently hardcodes a count `12`, replace it with the literal array length.

- [ ] **Step 2.7: Smoke-test the endpoint**

```bash
npm run dev
# in a second terminal:
curl -s -H "Cookie: $YOUR_AUTH_COOKIE" http://localhost:3000/api/db-status | jq
```

Expected: `tablesPresent` includes `sites` and `site_integrations`; `tablesMissing` is empty.

- [ ] **Step 2.8: Commit**

```bash
git add src/lib/db/schema.ts drizzle/ src/app/api/db-status/route.ts
git commit -m "feat(db): add sites + site_integrations tables; siteId FK on existing tables"
```

---

## Task 3: Site service layer (TDD)

**Files:**
- Create: `src/lib/services/sites.ts`
- Test: `src/lib/services/sites.test.ts`
- Create: `src/lib/validation/site.ts`

- [ ] **Step 3.1: Define zod schemas in `src/lib/validation/site.ts`**

```ts
import { z } from "zod";

export const CMS_PLATFORMS = [
  "wordpress", "vercel", "shopify", "webflow", "ghost", "static", "none",
] as const;

export const siteCreateSchema = z.object({
  key: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/, "lowercase letters, digits, hyphens"),
  name: z.string().min(1).max(120),
  domain: z.string().url(),
  locale: z.string().min(2).max(20),
  cmsPlatform: z.enum(CMS_PLATFORMS).default("none"),
  niche: z.string().max(400).optional(),
  audience: z.string().max(400).optional(),
  voiceGuide: z.string().max(2000).optional(),
  contentPillars: z.array(z.string().min(1).max(80)).max(20).default([]),
  bannedPhrases: z.array(z.string().min(1).max(120)).max(100).default([]),
  defaultCategories: z.array(z.string().min(1).max(80)).max(50).default([]),
  sitemapUrl: z.string().url().optional(),
  gscPropertyId: z.string().max(200).optional(),
  ga4PropertyId: z.string().max(200).optional(),
});

export const siteUpdateSchema = siteCreateSchema
  .partial()
  .omit({ key: true, domain: true, cmsPlatform: true });
  // key/domain/cmsPlatform immutable post-creation (per spec §3)

export type SiteCreateInput = z.infer<typeof siteCreateSchema>;
export type SiteUpdateInput = z.infer<typeof siteUpdateSchema>;
```

- [ ] **Step 3.2: Write the failing service tests**

Create `src/lib/services/sites.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db } from "@/lib/db/client";
import { sites } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

import {
  createSite, getSiteById, getSiteByKey, listSites, updateSite, archiveSite,
} from "./sites";

describe("sites service", () => {
  // Each test uses a unique key so they don't collide.
  const fixtureKey = () => `test-${Math.random().toString(36).slice(2, 8)}`;

  it("creates a site with full profile and returns the row", async () => {
    const key = fixtureKey();
    const row = await createSite({
      key, name: "Test", domain: "https://test.com", locale: "en-US",
      cmsPlatform: "wordpress",
      niche: "demo niche",
      contentPillars: ["recipes", "history"],
      bannedPhrases: ["delicious"],
      defaultCategories: [],
    });
    expect(row.id).toBeGreaterThan(0);
    expect(row.key).toBe(key);
    expect(row.cmsPlatform).toBe("wordpress");
    expect(row.contentPillars).toEqual(["recipes", "history"]);
    await db.delete(sites).where(eq(sites.id, row.id));
  });

  it("rejects duplicate keys with a typed error", async () => {
    const key = fixtureKey();
    const row = await createSite({
      key, name: "A", domain: "https://a.com", locale: "en-US",
      cmsPlatform: "none", contentPillars: [], bannedPhrases: [], defaultCategories: [],
    });
    await expect(createSite({
      key, name: "B", domain: "https://b.com", locale: "en-US",
      cmsPlatform: "none", contentPillars: [], bannedPhrases: [], defaultCategories: [],
    })).rejects.toThrow(/key_taken|unique/i);
    await db.delete(sites).where(eq(sites.id, row.id));
  });

  it("looks up by id and by key", async () => {
    const key = fixtureKey();
    const row = await createSite({
      key, name: "L", domain: "https://l.com", locale: "en-US",
      cmsPlatform: "none", contentPillars: [], bannedPhrases: [], defaultCategories: [],
    });
    expect((await getSiteById(row.id))?.key).toBe(key);
    expect((await getSiteByKey(key))?.id).toBe(row.id);
    expect(await getSiteByKey("nonexistent-xxx")).toBeNull();
    await db.delete(sites).where(eq(sites.id, row.id));
  });

  it("updates profile fields", async () => {
    const key = fixtureKey();
    const row = await createSite({
      key, name: "Old", domain: "https://o.com", locale: "en-US",
      cmsPlatform: "none", contentPillars: [], bannedPhrases: [], defaultCategories: [],
    });
    const updated = await updateSite(row.id, { name: "New", voiceGuide: "Warm" });
    expect(updated.name).toBe("New");
    expect(updated.voiceGuide).toBe("Warm");
    await db.delete(sites).where(eq(sites.id, row.id));
  });

  it("archive sets status='archived' and excludes from listSites by default", async () => {
    const key = fixtureKey();
    const row = await createSite({
      key, name: "X", domain: "https://x.com", locale: "en-US",
      cmsPlatform: "none", contentPillars: [], bannedPhrases: [], defaultCategories: [],
    });
    await archiveSite(row.id);
    const list = await listSites();
    expect(list.find((s) => s.id === row.id)).toBeUndefined();
    const listAll = await listSites({ includeArchived: true });
    expect(listAll.find((s) => s.id === row.id)?.status).toBe("archived");
    await db.delete(sites).where(eq(sites.id, row.id));
  });
});
```

- [ ] **Step 3.3: Run tests, verify they fail**

```bash
npm test -- src/lib/services/sites.test.ts
```

Expected: Cannot resolve `./sites` (all 5 fail).

- [ ] **Step 3.4: Implement `sites.ts`**

Create `src/lib/services/sites.ts`:

```ts
import { db } from "@/lib/db/client";
import { sites, type Site } from "@/lib/db/schema";
import { eq, and, ne } from "drizzle-orm";
import type { SiteCreateInput, SiteUpdateInput } from "@/lib/validation/site";

export class SiteKeyTakenError extends Error {
  constructor(key: string) {
    super(`Site key already in use: ${key}`);
    this.name = "SiteKeyTakenError";
  }
}

export async function createSite(input: SiteCreateInput): Promise<Site> {
  try {
    const [row] = await db.insert(sites).values({
      key: input.key,
      name: input.name,
      domain: input.domain,
      locale: input.locale,
      cmsPlatform: input.cmsPlatform,
      niche: input.niche ?? null,
      audience: input.audience ?? null,
      voiceGuide: input.voiceGuide ?? null,
      contentPillars: input.contentPillars,
      bannedPhrases: input.bannedPhrases,
      defaultCategories: input.defaultCategories,
      sitemapUrl: input.sitemapUrl ?? null,
      gscPropertyId: input.gscPropertyId ?? null,
      ga4PropertyId: input.ga4PropertyId ?? null,
    }).returning();
    return row;
  } catch (e) {
    // Neon HTTP returns "duplicate key value violates unique constraint" on
    // the sites_key_unique_idx; surface as a typed error.
    const msg = e instanceof Error ? e.message : String(e);
    if (/sites_key_unique_idx|duplicate key value/i.test(msg)) {
      throw new SiteKeyTakenError(input.key);
    }
    throw e;
  }
}

export async function getSiteById(id: number): Promise<Site | null> {
  const [row] = await db.select().from(sites).where(eq(sites.id, id)).limit(1);
  return row ?? null;
}

export async function getSiteByKey(key: string): Promise<Site | null> {
  const [row] = await db.select().from(sites).where(eq(sites.key, key)).limit(1);
  return row ?? null;
}

export async function listSites(
  opts: { includeArchived?: boolean } = {},
): Promise<Site[]> {
  if (opts.includeArchived) {
    return await db.select().from(sites);
  }
  return await db.select().from(sites).where(ne(sites.status, "archived"));
}

export async function updateSite(
  id: number,
  input: SiteUpdateInput,
): Promise<Site> {
  const [row] = await db.update(sites)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(sites.id, id))
    .returning();
  return row;
}

export async function archiveSite(id: number): Promise<Site> {
  const [row] = await db.update(sites)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(sites.id, id))
    .returning();
  return row;
}
```

- [ ] **Step 3.5: Run tests, verify they pass**

```bash
npm test -- src/lib/services/sites.test.ts
```

Expected: 5/5 passing.

- [ ] **Step 3.6: Commit**

```bash
git add src/lib/services/sites.ts src/lib/services/sites.test.ts src/lib/validation/site.ts
git commit -m "feat(services): site CRUD service with zod validation + typed key-taken error"
```

---

## Task 4: Integration service layer (TDD)

**Files:**
- Create: `src/lib/services/integrations.ts`
- Test: `src/lib/services/integrations.test.ts`
- Modify: `src/lib/validation/site.ts` (add `integrationCreateSchema`)

- [ ] **Step 4.1: Extend validation with integration schemas**

Append to `src/lib/validation/site.ts`:

```ts
export const INTEGRATION_KINDS = [
  "wordpress", "vercel", "shopify", "webflow", "ghost",
  "gsc", "ga4", "slack",
] as const;

export const integrationCreateSchema = z.object({
  kind: z.enum(INTEGRATION_KINDS),
  label: z.string().max(80).optional(),
  config: z.record(z.string(), z.unknown()),  // free-form for v1; per-kind shapes land in spec 2
});

export const integrationUpdateSchema = integrationCreateSchema
  .partial()
  .omit({ kind: true });

export type IntegrationCreateInput = z.infer<typeof integrationCreateSchema>;
export type IntegrationUpdateInput = z.infer<typeof integrationUpdateSchema>;
```

- [ ] **Step 4.2: Write the failing tests**

Create `src/lib/services/integrations.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db } from "@/lib/db/client";
import { sites, siteIntegrations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createSite } from "./sites";
import {
  createIntegration, getIntegration, listIntegrations,
  updateIntegration, deleteIntegration,
} from "./integrations";

describe("integrations service", () => {
  let siteId: number;

  beforeAll(() => {
    process.env.CONNECTION_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  beforeEach(async () => {
    const key = `t-${Math.random().toString(36).slice(2, 8)}`;
    const s = await createSite({
      key, name: "Fixture", domain: "https://f.com", locale: "en-US",
      cmsPlatform: "wordpress",
      contentPillars: [], bannedPhrases: [], defaultCategories: [],
    });
    siteId = s.id;
  });

  afterAll(async () => {
    // cascade deletes integrations
    await db.delete(sites).where(eq(sites.id, siteId));
  });

  it("encrypts config on create — ciphertext never contains plaintext", async () => {
    const row = await createIntegration(siteId, {
      kind: "wordpress",
      label: "Main",
      config: { baseUrl: "https://wp.f.com", token: "supersecret-xyz" },
    });
    expect(row.id).toBeGreaterThan(0);
    expect(row.config).not.toContain("supersecret-xyz");
    expect(row.config).not.toContain("https://wp.f.com");
  });

  it("getIntegration returns plaintext config when explicitly requested", async () => {
    const row = await createIntegration(siteId, {
      kind: "wordpress",
      config: { token: "abc-123" },
    });
    const fetched = await getIntegration(row.id, { decrypt: true });
    expect(fetched?.configPlain).toEqual({ token: "abc-123" });
  });

  it("listIntegrations never returns plaintext", async () => {
    await createIntegration(siteId, {
      kind: "wordpress",
      config: { token: "should-not-appear" },
    });
    const rows = await listIntegrations(siteId);
    for (const r of rows) {
      expect(JSON.stringify(r)).not.toContain("should-not-appear");
      // shape: no configPlain key
      expect(r).not.toHaveProperty("configPlain");
    }
  });

  it("updateIntegration re-encrypts config", async () => {
    const row = await createIntegration(siteId, {
      kind: "wordpress",
      config: { token: "v1" },
    });
    await updateIntegration(row.id, { config: { token: "v2" } });
    const refetched = await getIntegration(row.id, { decrypt: true });
    expect(refetched?.configPlain).toEqual({ token: "v2" });
  });

  it("deleteIntegration removes the row", async () => {
    const row = await createIntegration(siteId, {
      kind: "slack",
      config: { webhook: "x" },
    });
    await deleteIntegration(row.id);
    expect(await getIntegration(row.id)).toBeNull();
  });
});
```

- [ ] **Step 4.3: Run tests, verify they fail**

```bash
npm test -- src/lib/services/integrations.test.ts
```

Expected: Cannot resolve `./integrations`.

- [ ] **Step 4.4: Implement `integrations.ts`**

Create `src/lib/services/integrations.ts`:

```ts
import { db } from "@/lib/db/client";
import { siteIntegrations, type SiteIntegration } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { encrypt, decrypt } from "@/lib/crypto/integration-secrets";
import type {
  IntegrationCreateInput, IntegrationUpdateInput,
} from "@/lib/validation/site";

export type IntegrationListItem = Omit<SiteIntegration, "config" | "configIv" | "configTag">;
export type IntegrationWithPlain = SiteIntegration & { configPlain: Record<string, unknown> };

function toListItem(row: SiteIntegration): IntegrationListItem {
  // Strip the encrypted-blob columns; consumers should never see them.
  const { config: _c, configIv: _iv, configTag: _t, ...rest } = row;
  return rest;
}

export async function createIntegration(
  siteId: number,
  input: IntegrationCreateInput,
): Promise<IntegrationListItem> {
  const blob = encrypt(input.config);
  const [row] = await db.insert(siteIntegrations).values({
    siteId,
    kind: input.kind,
    label: input.label ?? null,
    config: blob.ciphertext,
    configIv: blob.iv,
    configTag: blob.tag,
  }).returning();
  return toListItem(row);
}

interface GetOpts { decrypt?: boolean }

export async function getIntegration(
  id: number,
  opts: GetOpts = {},
): Promise<IntegrationListItem | IntegrationWithPlain | null> {
  const [row] = await db.select().from(siteIntegrations).where(eq(siteIntegrations.id, id)).limit(1);
  if (!row) return null;
  if (opts.decrypt) {
    const plain = decrypt(row.config, row.configIv, row.configTag) as Record<string, unknown>;
    return { ...row, configPlain: plain };
  }
  return toListItem(row);
}

export async function listIntegrations(siteId: number): Promise<IntegrationListItem[]> {
  const rows = await db.select().from(siteIntegrations).where(eq(siteIntegrations.siteId, siteId));
  return rows.map(toListItem);
}

export async function updateIntegration(
  id: number,
  input: IntegrationUpdateInput,
): Promise<IntegrationListItem> {
  const patch: Partial<typeof siteIntegrations.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.label !== undefined) patch.label = input.label;
  if (input.config !== undefined) {
    const blob = encrypt(input.config);
    patch.config = blob.ciphertext;
    patch.configIv = blob.iv;
    patch.configTag = blob.tag;
  }
  const [row] = await db.update(siteIntegrations)
    .set(patch)
    .where(eq(siteIntegrations.id, id))
    .returning();
  return toListItem(row);
}

export async function deleteIntegration(id: number): Promise<void> {
  await db.delete(siteIntegrations).where(eq(siteIntegrations.id, id));
}
```

- [ ] **Step 4.5: Run tests, verify they pass**

```bash
npm test -- src/lib/services/integrations.test.ts
```

Expected: 5/5 passing.

- [ ] **Step 4.6: Commit**

```bash
git add src/lib/services/integrations.ts src/lib/services/integrations.test.ts src/lib/validation/site.ts
git commit -m "feat(services): site_integrations CRUD with at-rest AES-GCM encryption"
```

---

## Task 5: Site + Integration API routes

**Files:**
- Create: `src/app/api/sites/route.ts`
- Create: `src/app/api/sites/[id]/route.ts`
- Create: `src/app/api/sites/[id]/integrations/route.ts`
- Create: `src/app/api/sites/[id]/integrations/[intId]/route.ts`

- [ ] **Step 5.1: Implement `/api/sites` (list + create)**

Create `src/app/api/sites/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { listSites, createSite, SiteKeyTakenError } from "@/lib/services/sites";
import { siteCreateSchema } from "@/lib/validation/site";
import { db } from "@/lib/db/client";
import { siteIntegrations } from "@/lib/db/schema";
import { count, eq, inArray } from "drizzle-orm";

export async function GET() {
  const sites = await listSites();
  if (sites.length === 0) return NextResponse.json([]);
  // attach integrationCount per site without N+1
  const ids = sites.map((s) => s.id);
  const grouped = await db.select({
    siteId: siteIntegrations.siteId,
    n: count(siteIntegrations.id),
  })
    .from(siteIntegrations)
    .where(inArray(siteIntegrations.siteId, ids))
    .groupBy(siteIntegrations.siteId);
  const countById = new Map(grouped.map((r) => [r.siteId, Number(r.n)]));
  return NextResponse.json(
    sites.map((s) => ({ ...s, integrationCount: countById.get(s.id) ?? 0 })),
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = siteCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const row = await createSite(parsed.data);
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    if (e instanceof SiteKeyTakenError) {
      return NextResponse.json({ error: "key_taken" }, { status: 409 });
    }
    throw e;
  }
}
```

- [ ] **Step 5.2: Implement `/api/sites/[id]` (get, patch, archive)**

Create `src/app/api/sites/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSiteById, updateSite, archiveSite } from "@/lib/services/sites";
import { siteUpdateSchema } from "@/lib/validation/site";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const row = await getSiteById(Number(id));
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = siteUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
  }
  const row = await updateSite(Number(id), parsed.data);
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const row = await archiveSite(Number(id));
  return NextResponse.json(row);
}
```

- [ ] **Step 5.3: Implement `/api/sites/[id]/integrations` (list + create)**

Create `src/app/api/sites/[id]/integrations/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { listIntegrations, createIntegration } from "@/lib/services/integrations";
import { integrationCreateSchema } from "@/lib/validation/site";

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const rows = await listIntegrations(Number(id));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = integrationCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const row = await createIntegration(Number(id), parsed.data);
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/CONNECTION_ENCRYPTION_KEY|64.*hex/i.test(msg)) {
      console.error("ENCRYPTION KEY MISSING — integration write rejected:", msg);
      return NextResponse.json({ error: "encryption_key_missing" }, { status: 500 });
    }
    throw e;
  }
}
```

- [ ] **Step 5.4: Implement `/api/sites/[id]/integrations/[intId]`**

Create `src/app/api/sites/[id]/integrations/[intId]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { updateIntegration, deleteIntegration } from "@/lib/services/integrations";
import { integrationUpdateSchema } from "@/lib/validation/site";

interface Ctx { params: Promise<{ id: string; intId: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { intId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = integrationUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
  }
  const row = await updateIntegration(Number(intId), parsed.data);
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { intId } = await params;
  await deleteIntegration(Number(intId));
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 5.5: Smoke-test all four routes**

With `npm run dev` running:

```bash
# create
curl -s -X POST http://localhost:3000/api/sites \
  -H "Content-Type: application/json" \
  -H "Cookie: $AUTH" \
  -d '{"key":"smoke-test","name":"Smoke","domain":"https://smoke.com","locale":"en-US","cmsPlatform":"none"}' | jq

# list
curl -s -H "Cookie: $AUTH" http://localhost:3000/api/sites | jq

# create integration
curl -s -X POST http://localhost:3000/api/sites/<id>/integrations \
  -H "Content-Type: application/json" -H "Cookie: $AUTH" \
  -d '{"kind":"wordpress","label":"Main","config":{"baseUrl":"https://wp.example","token":"verysecret"}}' | jq

# list integrations — verify no plaintext
curl -s -H "Cookie: $AUTH" http://localhost:3000/api/sites/<id>/integrations | jq | grep -i verysecret
# expected: no output (grep finds nothing)

# archive
curl -s -X DELETE -H "Cookie: $AUTH" http://localhost:3000/api/sites/<id> | jq
```

Expected: all calls succeed; integration list response does NOT contain `verysecret` anywhere.

- [ ] **Step 5.6: Commit**

```bash
git add src/app/api/sites
git commit -m "feat(api): /api/sites and /api/sites/[id]/integrations CRUD routes"
```

---

## Task 6: Existing endpoints accept siteId

**Files modified:**
- `src/lib/services/jobs.ts` — `enqueueJob` requires `siteId`
- `src/lib/services/cycles.ts` — require `siteId` on create
- `src/lib/services/keywords.ts` — filter by `siteId`
- `src/lib/services/runs.ts` — filter by `siteId`
- `src/app/api/cycles/route.ts` — accept + require `siteId`
- `src/app/api/agents/[key]/run/route.ts` — require `siteId`, load site, attach snapshot to payload
- `src/app/api/keywords/route.ts` — accept `siteId` query
- `src/app/api/articles/route.ts` — accept `siteId` query
- `src/app/api/runs/route.ts` — accept `siteId` query

- [ ] **Step 6.1: Update `enqueueJob` signature**

Open `src/lib/services/jobs.ts`. Find the `enqueueJob` export. Add a required `siteId: number` parameter. Store it on the row. Example shape:

```ts
export interface EnqueueJobInput {
  agentKey: string;
  siteId: number;       // NEW — required
  cycleId?: number;
  payload: Record<string, unknown>;
  priority?: number;
  maxAttempts?: number;
}

export async function enqueueJob(input: EnqueueJobInput): Promise<Job> {
  if (!input.siteId) {
    throw new Error("enqueueJob: siteId is required");
  }
  const [row] = await db.insert(jobs).values({
    agentKey: input.agentKey,
    siteId: input.siteId,
    cycleId: input.cycleId ?? null,
    payload: input.payload,
    priority: input.priority ?? 0,
    maxAttempts: input.maxAttempts ?? 3,
  }).returning();
  return row;
}
```

(Keep any existing logic in the function — only add the `siteId` plumbing.)

- [ ] **Step 6.2: Update `cycles` service to require siteId on create**

Open `src/lib/services/cycles.ts`. Find the cycle-create function. Add required `siteId: number` to its input. Pass it through to the insert. Add an optional `siteId` filter to the list function.

- [ ] **Step 6.3: Update `runs` and `keywords` services to accept siteId filter**

In each file (`src/lib/services/runs.ts`, `src/lib/services/keywords.ts`), extend the list-query function with `siteId?: number`. When set, add `.where(eq(<table>.siteId, opts.siteId))` to the query.

- [ ] **Step 6.4: Update `POST /api/cycles` to require siteId**

Open `src/app/api/cycles/route.ts`. In the POST handler:

```ts
// near the top of the validator block:
if (!body?.siteId || typeof body.siteId !== "number") {
  return NextResponse.json({ error: "siteId_required" }, { status: 400 });
}
// then call:
const cycle = await createCycle({ ...body, siteId: body.siteId });
```

Add `siteId` to the GET filter as well: `if (siteId) ...where(eq(cycles.siteId, Number(siteId)))`.

- [ ] **Step 6.5: Update `POST /api/agents/[key]/run` to snapshot site into payload**

Open `src/app/api/agents/[key]/run/route.ts`. Two changes:

1. Require `siteId` in the request body. Reject with 400 if missing.
2. Load the site via `getSiteById`, then build the snapshot block before enqueuing or running inline:

```ts
import { getSiteById } from "@/lib/services/sites";
// ...
const site = await getSiteById(Number(body.siteId));
if (!site) {
  return NextResponse.json({ error: "site_not_found" }, { status: 404 });
}
const siteSnapshot = {
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
};
const enhancedPayload = { ...body.payload, site: siteSnapshot };
// pass enhancedPayload through to the existing worker-or-fn dispatch path.
// for the worker path, also pass siteId: site.id to enqueueJob.
```

If the file currently has a single path that always enqueues, just add `siteId: site.id` + `payload: enhancedPayload` to the enqueue call. If it branches on `agent.runtime === "fn"`, propagate `payload: enhancedPayload` to that branch too.

- [ ] **Step 6.6: Update keywords, articles, runs list routes**

For each of `src/app/api/keywords/route.ts`, `articles/route.ts`, `runs/route.ts`: read `siteId` from query params; if present, pass to the service's filter option.

```ts
const siteIdParam = req.nextUrl.searchParams.get("siteId");
const rows = await listKeywords({
  cycleId: cycleIdParam ? Number(cycleIdParam) : undefined,
  siteId: siteIdParam ? Number(siteIdParam) : undefined,
  // ...existing options
});
```

- [ ] **Step 6.7: Smoke-test the agent-run path**

```bash
curl -s -X POST http://localhost:3000/api/agents/qa/run \
  -H "Content-Type: application/json" -H "Cookie: $AUTH" \
  -d '{"siteId":<id of default site>,"payload":{"article":"Hello","targetKeyword":"hi"}}' | jq

# then look at the latest job:
psql "$DATABASE_URL" -c "SELECT id, agent_key, site_id, payload->'site'->>'key' AS site_key FROM jobs ORDER BY id DESC LIMIT 1"
```

Expected: the job row has `site_id` set and `payload.site.key` matches the site you targeted.

- [ ] **Step 6.8: Commit**

```bash
git add src/lib/services src/app/api/cycles src/app/api/agents src/app/api/keywords src/app/api/articles src/app/api/runs
git commit -m "feat(api): require siteId on cycles/agent-run; accept siteId filter on list routes; snapshot site into job payload"
```

---

## Task 7: Director — buildSystemPrompt + payload snapshot (TDD)

**Files:**
- Modify: `src/lib/services/director.ts`
- Create / extend: `src/lib/services/director.test.ts`
- Modify: `src/lib/services/conversations.ts` (`getConversationWithSite` helper)

- [ ] **Step 7.1: Add `siteId` to conversation create + helper**

Open `src/lib/services/conversations.ts`. Find the conversation-create function. Add `siteId?: number | null` to the input and pass through to the insert. Then add a new helper:

```ts
import { sites, conversations, type Conversation, type Site } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function getConversationWithSite(
  conversationId: number,
): Promise<{ conversation: Conversation; site: Site | null }> {
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (!conv) throw new Error(`Conversation ${conversationId} not found`);
  if (!conv.siteId) return { conversation: conv, site: null };
  const [site] = await db.select().from(sites).where(eq(sites.id, conv.siteId)).limit(1);
  return { conversation: conv, site: site ?? null };
}
```

- [ ] **Step 7.2: Write failing tests for `buildSystemPrompt`**

Create or extend `src/lib/services/director.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./director";
import type { Site } from "@/lib/db/schema";

const fakeSite: Site = {
  id: 1,
  key: "tonyspizza",
  name: "Tony's Pizza",
  domain: "https://tonyspizza.com",
  locale: "en-US",
  niche: "NYC pizza & Italian-American food",
  audience: "home cooks + NYC tourists",
  voiceGuide: "Warm, slightly nostalgic, food-first; never corporate",
  contentPillars: ["recipes", "neighborhood history", "gear reviews"],
  bannedPhrases: ["delicious", "mouth-watering"],
  defaultCategories: ["Recipes", "Reviews"],
  cmsPlatform: "wordpress",
  sitemapUrl: null,
  gscPropertyId: null,
  ga4PropertyId: null,
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("buildSystemPrompt", () => {
  it("includes the SITE CONTEXT block when site is provided", () => {
    const p = buildSystemPrompt(fakeSite);
    expect(p).toMatch(/SITE CONTEXT/);
    expect(p).toMatch(/Tony's Pizza/);
    expect(p).toMatch(/NYC pizza/);
    expect(p).toMatch(/Warm, slightly nostalgic/);
    expect(p).toMatch(/delicious/);
    expect(p).toMatch(/recipes.*neighborhood history.*gear reviews/);
  });

  it("includes the 'no site selected' instruction when site is null", () => {
    const p = buildSystemPrompt(null);
    expect(p).not.toMatch(/SITE CONTEXT/);
    expect(p).toMatch(/No site selected/);
    expect(p).toMatch(/ask which site/i);
  });

  it("retains the base director role + tools regardless of site", () => {
    const withSite = buildSystemPrompt(fakeSite);
    const without = buildSystemPrompt(null);
    expect(withSite).toMatch(/UTEONT's Director Agent/);
    expect(without).toMatch(/UTEONT's Director Agent/);
    expect(withSite).toMatch(/research\(seeds/);
    expect(without).toMatch(/research\(seeds/);
  });
});
```

- [ ] **Step 7.3: Run tests, verify they fail**

```bash
npm test -- src/lib/services/director.test.ts
```

Expected: `buildSystemPrompt` is not exported.

- [ ] **Step 7.4: Refactor `director.ts` — split SYSTEM_PROMPT into a function**

In `src/lib/services/director.ts`:

1. Replace the `const SYSTEM_PROMPT = \`...\`;` block with `const BASE_SYSTEM_PROMPT = \`...\`;` (same body).
2. Add the exported builder above the types section:

```ts
import type { Site } from "@/lib/db/schema";

export function buildSystemPrompt(site: Site | null): string {
  if (!site) {
    return [
      BASE_SYSTEM_PROMPT,
      "",
      "NO SITE SELECTED",
      "No site selected yet for this conversation. If the user describes site-specific work, ask which site (one focused question, then propose).",
    ].join("\n");
  }
  const siteBlock = [
    "SITE CONTEXT",
    `- Name: ${site.name}`,
    `- Domain: ${site.domain}`,
    `- Locale: ${site.locale}`,
    site.niche ? `- Niche: ${site.niche}` : null,
    site.audience ? `- Audience: ${site.audience}` : null,
    site.voiceGuide ? `- Voice: ${site.voiceGuide}` : null,
    site.contentPillars.length > 0
      ? `- Content pillars: ${site.contentPillars.join(", ")}`
      : null,
    site.bannedPhrases.length > 0
      ? `- Banned phrases: ${site.bannedPhrases.map((p) => `"${p}"`).join(", ")}`
      : null,
    site.defaultCategories.length > 0
      ? `- Default categories: ${site.defaultCategories.join(", ")}`
      : null,
    "",
    "All proposed work is for this site unless the user explicitly redirects to a different one. When dispatching agents, the site context above flows to the worker in the job payload — you don't need to repeat it in args.",
  ].filter(Boolean).join("\n");
  return [siteBlock, "", BASE_SYSTEM_PROMPT].join("\n");
}
```

3. In `runDirectorTurn`, locate the existing `completeJson` call. Replace `systemInstruction: SYSTEM_PROMPT` with:

```ts
const { conversation, site } = await getConversationWithSite(input.conversation.id);
// (this also gives us the site for snapshot below — see step 7.5)
const systemInstruction = buildSystemPrompt(site);
// pass `systemInstruction` to completeJson instead of the constant
```

(Import `getConversationWithSite` from `./conversations`.)

- [ ] **Step 7.5: Snapshot site into job payload at enqueue**

Find the enqueue loop in `runDirectorTurn`:

```ts
for (const action of parsed.actions) {
  const agentKey = TOOL_TO_AGENT[action.tool];
  if (!agentKey) continue;
  const job = await enqueueJob({
    agentKey,
    payload: { ...action.args, _directorContext: { conversationId: input.conversation.id } },
  });
  ...
}
```

Replace with:

```ts
for (const action of parsed.actions) {
  const agentKey = TOOL_TO_AGENT[action.tool];
  if (!agentKey) continue;
  if (!site) {
    // Should not happen — the planner is told to "ask" when no site. Defensive.
    console.warn("Director enqueue blocked: conversation has no site", input.conversation.id);
    continue;
  }
  const siteSnapshot = {
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
  };
  const job = await enqueueJob({
    agentKey,
    siteId: site.id,
    payload: {
      ...action.args,
      _directorContext: { conversationId: input.conversation.id },
      site: siteSnapshot,
    },
  });
  enqueued.push({ tool: action.tool, jobId: job.id, args: action.args });
}
```

- [ ] **Step 7.6: Run tests, verify they pass**

```bash
npm test -- src/lib/services/director.test.ts
```

Expected: 3/3 passing.

- [ ] **Step 7.7: Commit**

```bash
git add src/lib/services/director.ts src/lib/services/director.test.ts src/lib/services/conversations.ts
git commit -m "feat(director): site-aware system prompt + snapshot site into job payload"
```

---

## Task 8: Director conversations API + Telegram /site commands

**Files:**
- Modify: `src/app/api/director/conversations/route.ts` (accept optional `siteId`)
- Modify: `src/app/api/telegram/webhook/route.ts` (new `/site`, `/sites` commands)

- [ ] **Step 8.1: Accept `siteId` on conversation create (web)**

Open `src/app/api/director/conversations/route.ts`. In the POST handler, accept an optional `siteId` from the body and pass it through to your conversation-create service:

```ts
const body = await req.json().catch(() => ({}));
const siteId =
  typeof body.siteId === "number" ? body.siteId : null;

const conv = await createConversation({
  ...body,
  siteId,
});
return NextResponse.json(conv, { status: 201 });
```

- [ ] **Step 8.2: Add `/site <key>` and `/sites` Telegram commands**

Open `src/app/api/telegram/webhook/route.ts`. Locate the command-dispatch switch (the section that handles `/setuser`, `/setpassword-url`, `/whoami`, etc.). Add two new branches.

```ts
// helper at top of file:
import { listSites, getSiteByKey } from "@/lib/services/sites";

// inside the command handler:
case "/sites": {
  const all = await listSites();
  if (all.length === 0) {
    await sendMessage(chatId, "No sites yet. Create one in the web app at /sites/new.");
    break;
  }
  const lines = all.map((s) => `- ${s.key} — ${s.name} (${s.domain})`);
  await sendMessage(chatId, ["Available sites:", ...lines].join("\n"));
  break;
}

case "/site": {
  const key = args.trim().toLowerCase();
  if (!key) {
    await sendMessage(chatId, "Usage: /site <key>. Use /sites to list keys.");
    break;
  }
  const site = await getSiteByKey(key);
  if (!site) {
    await sendMessage(chatId, `No site with key '${key}'. Use /sites to list.`);
    break;
  }
  // Bind the active conversation for this chat to this site.
  const conv = await getOrCreateConversationForChat(chatId);
  await updateConversation(conv.id, { siteId: site.id });
  await sendMessage(chatId, `Pinned conversation to site '${site.key}' (${site.name}).`);
  break;
}
```

If `getOrCreateConversationForChat` or `updateConversation` don't exist with those exact names, use whatever the existing webhook uses to resolve the chat's conversation — the goal is to call `updateConversation(convId, { siteId })`.

- [ ] **Step 8.3: Smoke-test**

In Telegram, with the bot:
1. `/sites` → expect a list of sites
2. `/site default` → expect "Pinned conversation to site 'default'…"
3. Send a free-text message → the Director's reply should now factor in the default site's profile (initially sparse since default's voice/niche fields are empty)

- [ ] **Step 8.4: Commit**

```bash
git add src/app/api/director src/app/api/telegram
git commit -m "feat(director): /site, /sites Telegram commands; accept siteId on web conversation create"
```

---

## Task 9: Sidebar Site selector

**Files:**
- Create: `src/components/site-selector.tsx`
- Create: `src/lib/hooks/use-active-site.ts`
- Modify: existing sidebar component (path discovered via `grep -r "Sign out" src/components src/app/layout.tsx`)
- Create: `src/app/api/ui/active-site/route.ts` (GET + PUT for `kvSettings.ui.activeSiteId`)

- [ ] **Step 9.1: Add a tiny `kvSettings` REST endpoint for active site**

Create `src/app/api/ui/active-site/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { kvSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const KEY = "ui.activeSiteId";

export async function GET() {
  const [row] = await db.select().from(kvSettings).where(eq(kvSettings.key, KEY)).limit(1);
  return NextResponse.json({ siteId: row ? (row.value as { id: number }).id : null });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const siteId = body?.siteId;
  if (siteId !== null && typeof siteId !== "number") {
    return NextResponse.json({ error: "siteId must be number or null" }, { status: 400 });
  }
  const value = { id: siteId };
  // upsert
  await db.insert(kvSettings).values({ key: KEY, value })
    .onConflictDoUpdate({ target: kvSettings.key, set: { value, updatedAt: new Date() } });
  return NextResponse.json({ siteId });
}
```

- [ ] **Step 9.2: Implement the hook**

Create `src/lib/hooks/use-active-site.ts`:

```ts
"use client";
import { useCallback, useEffect, useState } from "react";

interface Site { id: number; key: string; name: string; domain: string; status: string }

export function useActiveSite() {
  const [activeSiteId, setActiveSiteId] = useState<number | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [active, list] = await Promise.all([
        fetch("/api/ui/active-site").then((r) => r.json()),
        fetch("/api/sites").then((r) => r.json()),
      ]);
      setActiveSiteId(active.siteId);
      setSites(list);
      setLoading(false);
    })();
  }, []);

  const update = useCallback(async (id: number | null) => {
    await fetch("/api/ui/active-site", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: id }),
    });
    setActiveSiteId(id);
  }, []);

  return { activeSiteId, setActiveSiteId: update, sites, loading };
}
```

- [ ] **Step 9.3: Implement the dropdown**

Create `src/components/site-selector.tsx`:

```tsx
"use client";
import Link from "next/link";
import { useActiveSite } from "@/lib/hooks/use-active-site";

export function SiteSelector() {
  const { activeSiteId, setActiveSiteId, sites, loading } = useActiveSite();
  if (loading) return <div className="text-xs opacity-60 px-3 py-2">Loading sites…</div>;
  if (sites.length === 0) {
    return (
      <Link href="/sites/new" className="block text-xs px-3 py-2 underline">
        + Add your first site
      </Link>
    );
  }
  return (
    <div className="px-3 py-2 border-b border-brand-border">
      <label className="block text-[10px] uppercase tracking-wide opacity-60 mb-1">Site</label>
      <select
        className="w-full bg-transparent border border-brand-border rounded text-sm px-2 py-1"
        value={activeSiteId ?? ""}
        onChange={(e) => setActiveSiteId(e.target.value === "" ? null : Number(e.target.value))}
      >
        <option value="">All sites</option>
        {sites.map((s) => (
          <option key={s.id} value={s.id}>{s.name} ({s.key})</option>
        ))}
      </select>
      <Link href="/sites/new" className="block text-[10px] mt-1 underline opacity-80">+ Add site</Link>
    </div>
  );
}
```

> Note: `brand-border` may not exist in the current Tailwind theme — if it doesn't, fall back to `border-black/10` until the brand-token migration (F-022) covers it.

- [ ] **Step 9.4: Mount the selector in the sidebar**

Find the sidebar component. Locate the rendered nav. Insert `<SiteSelector />` at the top, above the agents list section.

- [ ] **Step 9.5: Smoke-test in the browser**

Open `localhost:3000`, log in. Confirm:
- The Site dropdown appears at the top of the sidebar
- It lists the default site
- Selecting a site or "All sites" persists across reloads (check `kvSettings`)

- [ ] **Step 9.6: Commit**

```bash
git add src/app/api/ui src/components/site-selector.tsx src/lib/hooks/use-active-site.ts src/app/layout.tsx
# (path of layout/sidebar wherever you actually edited)
git commit -m "feat(ui): sidebar Site selector + persisted active-site in kvSettings"
```

---

## Task 10: Settings tabs + Sites list page

**Files:**
- Rewrite: `src/app/settings/page.tsx` (tabbed: General / Sites / Integrations / Auth)
- Create: `src/app/sites/page.tsx` (also linked from Settings → Sites)

- [ ] **Step 10.1: Build the Sites list page**

Create `src/app/sites/page.tsx`:

```tsx
import Link from "next/link";
import { listSites } from "@/lib/services/sites";
import { db } from "@/lib/db/client";
import { siteIntegrations } from "@/lib/db/schema";
import { count, inArray } from "drizzle-orm";

export default async function SitesPage() {
  const sites = await listSites();
  const ids = sites.map((s) => s.id);
  const grouped = ids.length === 0 ? [] : await db.select({
    siteId: siteIntegrations.siteId,
    n: count(siteIntegrations.id),
  })
    .from(siteIntegrations)
    .where(inArray(siteIntegrations.siteId, ids))
    .groupBy(siteIntegrations.siteId);
  const countById = new Map(grouped.map((r) => [r.siteId, Number(r.n)]));

  return (
    <main className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl">Sites</h1>
        <Link href="/sites/new" className="px-3 py-1 border rounded text-sm">+ New site</Link>
      </div>
      {sites.length === 0 ? (
        <p className="opacity-70">No sites yet. <Link href="/sites/new" className="underline">Add one</Link>.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left opacity-60">
              <th className="py-2">Key</th><th>Name</th><th>Domain</th><th>Platform</th>
              <th>Integrations</th><th>Status</th><th />
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => (
              <tr key={s.id} className="border-t border-black/10">
                <td className="py-2">{s.key}</td>
                <td>{s.name}</td>
                <td><a href={s.domain} target="_blank" rel="noreferrer" className="underline opacity-80">{s.domain}</a></td>
                <td>{s.cmsPlatform}</td>
                <td>{countById.get(s.id) ?? 0}</td>
                <td>{s.status}</td>
                <td>
                  <Link href={`/sites/${s.key}`} className="underline mr-3">Open</Link>
                  <Link href={`/sites/${s.key}/edit`} className="underline">Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
```

- [ ] **Step 10.2: Rewrite settings page with tabs**

Open `src/app/settings/page.tsx`. Replace its contents with a tabbed layout. Since the file is currently ~35 lines, an inline tab UI is fine:

```tsx
import Link from "next/link";

export default function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // Server component — pre-resolved searchParams arrive as a Promise in Next 16.
  // We don't actually need the value here; the link-driven tabs do the work.
  return (
    <main className="p-6 max-w-5xl">
      <h1 className="text-2xl mb-4">Settings</h1>
      <nav className="flex gap-4 border-b border-black/10 mb-6">
        <TabLink href="/settings?tab=general" label="General" />
        <TabLink href="/sites" label="Sites" />
        <TabLink href="/settings?tab=auth" label="Auth" />
      </nav>
      {/* Placeholder content; subsequent specs flesh out General + Auth tabs */}
      <div className="opacity-70 text-sm">
        Choose a tab. Site profiles + integrations live under <Link href="/sites" className="underline">Sites</Link>.
      </div>
    </main>
  );
}

function TabLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="pb-2 text-sm hover:opacity-100 opacity-80">{label}</Link>;
}
```

(Don't over-build General/Auth tabs — out of scope for this plan; placeholder is fine.)

- [ ] **Step 10.3: Smoke-test the pages**

- Open `/sites` — see the table with the default site
- Open `/settings` — see the tabs row; click "Sites" → lands at `/sites`

- [ ] **Step 10.4: Commit**

```bash
git add src/app/sites/page.tsx src/app/settings/page.tsx
git commit -m "feat(ui): sites index page + settings page tabbed layout"
```

---

## Task 11: Site create + edit pages

**Files:**
- Create: `src/app/sites/new/page.tsx`
- Create: `src/app/sites/[key]/edit/page.tsx`

- [ ] **Step 11.1: New-site form**

Create `src/app/sites/new/page.tsx` as a client component. Required fields: name, key, domain, locale, cmsPlatform.

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CMS_PLATFORMS } from "@/lib/validation/site";

export default function NewSitePage() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    key: "", name: "", domain: "", locale: "en-US", cmsPlatform: "none" as typeof CMS_PLATFORMS[number],
  });
  return (
    <main className="p-6 max-w-xl">
      <h1 className="text-2xl mb-4">New site</h1>
      <form
        className="space-y-3 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const res = await fetch("/api/sites", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...form, contentPillars: [], bannedPhrases: [], defaultCategories: [] }),
            });
            if (res.ok) {
              router.push(`/sites/${form.key}/edit`);
            } else {
              const j = await res.json().catch(() => ({}));
              setError(j.error === "key_taken" ? "That key is already in use." : "Could not create. Check the values and try again.");
            }
          });
        }}
      >
        <Field label="Key (URL-safe)" value={form.key} onChange={(v) => setForm({ ...form, key: v })} placeholder="tonyspizza" />
        <Field label="Name"   value={form.name}   onChange={(v) => setForm({ ...form, name: v })}   placeholder="Tony's Pizza" />
        <Field label="Domain" value={form.domain} onChange={(v) => setForm({ ...form, domain: v })} placeholder="https://tonyspizza.com" />
        <Field label="Locale" value={form.locale} onChange={(v) => setForm({ ...form, locale: v })} />
        <label className="block">
          <span className="block opacity-70 mb-1">CMS Platform</span>
          <select
            className="w-full border rounded px-2 py-1"
            value={form.cmsPlatform}
            onChange={(e) => setForm({ ...form, cmsPlatform: e.target.value as typeof form.cmsPlatform })}
          >
            {CMS_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        {error && <div className="text-red-700">{error}</div>}
        <button disabled={pending} className="px-3 py-1 border rounded">Create</button>
      </form>
    </main>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="block opacity-70 mb-1">{label}</span>
      <input className="w-full border rounded px-2 py-1" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
```

- [ ] **Step 11.2: Edit page (tabbed: Identity / Voice / Content / Analytics)**

Create `src/app/sites/[key]/edit/page.tsx`. This is a server component that loads the site, then renders a client edit form.

```tsx
import { getSiteByKey } from "@/lib/services/sites";
import { notFound } from "next/navigation";
import { SiteEditForm } from "./site-edit-form";

export default async function SiteEditPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const site = await getSiteByKey(key);
  if (!site) notFound();
  return (
    <main className="p-6 max-w-3xl">
      <h1 className="text-2xl mb-1">Edit site</h1>
      <p className="opacity-60 mb-4">{site.name} · {site.domain}</p>
      <SiteEditForm site={site} />
    </main>
  );
}
```

Then create `src/app/sites/[key]/edit/site-edit-form.tsx` as a client component. It renders four tab buttons that toggle which section is visible. The "save" action sends a PATCH to `/api/sites/[id]` (NOT keyed by `key`; the id is needed for the API route).

```tsx
"use client";
import { useState, useTransition } from "react";
import type { Site } from "@/lib/db/schema";

type Tab = "identity" | "voice" | "content" | "analytics";

export function SiteEditForm({ site }: { site: Site }) {
  const [tab, setTab] = useState<Tab>("identity");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [form, setForm] = useState({
    name: site.name,
    locale: site.locale,
    niche: site.niche ?? "",
    audience: site.audience ?? "",
    voiceGuide: site.voiceGuide ?? "",
    contentPillars: [...site.contentPillars],
    bannedPhrases: [...site.bannedPhrases],
    defaultCategories: [...site.defaultCategories],
    sitemapUrl: site.sitemapUrl ?? "",
    gscPropertyId: site.gscPropertyId ?? "",
    ga4PropertyId: site.ga4PropertyId ?? "",
  });

  const save = () => {
    setError(null); setOk(false);
    start(async () => {
      const res = await fetch(`/api/sites/${site.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) setOk(true);
      else setError("Could not save. Check the fields and try again.");
    });
  };

  return (
    <div className="space-y-4 text-sm">
      <nav className="flex gap-3 border-b border-black/10 pb-2">
        {(["identity","voice","content","analytics"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-1 ${tab === t ? "border-b-2 border-black" : "opacity-60"}`}
          >
            {t}
          </button>
        ))}
      </nav>
      {tab === "identity" && (
        <>
          <Text label="Name"   value={form.name}   onChange={(v) => setForm({ ...form, name: v })} />
          <Text label="Locale" value={form.locale} onChange={(v) => setForm({ ...form, locale: v })} />
          <p className="opacity-60 text-xs">Key, domain, and CMS platform are immutable after creation.</p>
        </>
      )}
      {tab === "voice" && (
        <>
          <Text label="Niche (one line)"      value={form.niche}      onChange={(v) => setForm({ ...form, niche: v })} />
          <Text label="Audience (one line)"   value={form.audience}   onChange={(v) => setForm({ ...form, audience: v })} />
          <TextArea label="Voice guide (paragraph)" value={form.voiceGuide} onChange={(v) => setForm({ ...form, voiceGuide: v })} />
          <ListField label="Content pillars" values={form.contentPillars} onChange={(v) => setForm({ ...form, contentPillars: v })} />
          <ListField label="Banned phrases"  values={form.bannedPhrases}  onChange={(v) => setForm({ ...form, bannedPhrases: v })} />
        </>
      )}
      {tab === "content" && (
        <>
          <ListField label="Default categories / tags" values={form.defaultCategories} onChange={(v) => setForm({ ...form, defaultCategories: v })} />
          <Text label="Sitemap URL" value={form.sitemapUrl} onChange={(v) => setForm({ ...form, sitemapUrl: v })} />
        </>
      )}
      {tab === "analytics" && (
        <>
          <Text label="Google Search Console property ID" value={form.gscPropertyId} onChange={(v) => setForm({ ...form, gscPropertyId: v })} />
          <Text label="GA4 property ID"                   value={form.ga4PropertyId} onChange={(v) => setForm({ ...form, ga4PropertyId: v })} />
        </>
      )}
      <div className="pt-4 flex items-center gap-3">
        <button disabled={pending} onClick={save} className="px-3 py-1 border rounded">Save</button>
        {ok && <span className="text-green-700">Saved.</span>}
        {error && <span className="text-red-700">{error}</span>}
      </div>
    </div>
  );
}

function Text({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block opacity-70 mb-1">{label}</span>
      <input className="w-full border rounded px-2 py-1" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block opacity-70 mb-1">{label}</span>
      <textarea rows={4} className="w-full border rounded px-2 py-1" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function ListField({ label, values, onChange }: { label: string; values: string[]; onChange: (v: string[]) => void }) {
  // Simple comma-separated editor — keeps the form lean for v1.
  return (
    <label className="block">
      <span className="block opacity-70 mb-1">{label} <span className="opacity-50">(comma-separated)</span></span>
      <input
        className="w-full border rounded px-2 py-1"
        value={values.join(", ")}
        onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
      />
    </label>
  );
}
```

- [ ] **Step 11.3: Smoke-test**

- `/sites/new` — create a site `tonyspizza` → redirects to `/sites/tonyspizza/edit`
- Fill voice / niche / pillars on Voice tab → Save → reload → values persist

- [ ] **Step 11.4: Commit**

```bash
git add src/app/sites/new src/app/sites/[key]/edit
git commit -m "feat(ui): site create + tabbed edit form (Identity / Voice / Content / Analytics)"
```

---

## Task 12: Site overview + integrations page

**Files:**
- Create: `src/app/sites/[key]/page.tsx`
- Create: `src/app/sites/[key]/integrations/page.tsx`

- [ ] **Step 12.1: Site overview page**

Create `src/app/sites/[key]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSiteByKey } from "@/lib/services/sites";
import { listIntegrations } from "@/lib/services/integrations";
import { db } from "@/lib/db/client";
import { cycles, articles, runs } from "@/lib/db/schema";
import { eq, count, desc } from "drizzle-orm";

export default async function SiteOverview({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const site = await getSiteByKey(key);
  if (!site) notFound();
  const [integrations, [{ n: nCycles }], [{ n: nArticles }], recentRuns] = await Promise.all([
    listIntegrations(site.id),
    db.select({ n: count() }).from(cycles).where(eq(cycles.siteId, site.id)),
    db.select({ n: count() }).from(articles).where(eq(articles.siteId, site.id)),
    db.select().from(runs).where(eq(runs.siteId, site.id)).orderBy(desc(runs.startedAt)).limit(10),
  ]);

  return (
    <main className="p-6 max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl">{site.name}</h1>
        <p className="opacity-70 text-sm">{site.domain} · {site.locale} · {site.cmsPlatform}</p>
        <p className="text-sm mt-2">
          <Link href={`/sites/${site.key}/edit`} className="underline mr-3">Edit profile</Link>
          <Link href={`/sites/${site.key}/integrations`} className="underline">Integrations ({integrations.length})</Link>
        </p>
      </header>

      <section>
        <h2 className="text-lg mb-2">Profile</h2>
        <dl className="text-sm space-y-1">
          <Row k="Niche"      v={site.niche} />
          <Row k="Audience"   v={site.audience} />
          <Row k="Voice"      v={site.voiceGuide} />
          <Row k="Pillars"    v={site.contentPillars.join(", ") || "—"} />
          <Row k="Banned"     v={site.bannedPhrases.join(", ") || "—"} />
        </dl>
      </section>

      <section>
        <h2 className="text-lg mb-2">Counts</h2>
        <p className="text-sm">Cycles: {Number(nCycles)} · Articles: {Number(nArticles)}</p>
      </section>

      <section>
        <h2 className="text-lg mb-2">Recent runs</h2>
        {recentRuns.length === 0 ? <p className="text-sm opacity-60">None yet.</p> : (
          <ul className="text-sm space-y-1">
            {recentRuns.map((r) => (
              <li key={r.id}>#{r.id} · {r.category} · {r.action} · {r.status}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Row({ k, v }: { k: string; v: string | null }) {
  return <div className="flex gap-3"><dt className="opacity-60 w-24">{k}</dt><dd>{v || "—"}</dd></div>;
}
```

- [ ] **Step 12.2: Integrations page (list + generic create form)**

Create `src/app/sites/[key]/integrations/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getSiteByKey } from "@/lib/services/sites";
import { listIntegrations } from "@/lib/services/integrations";
import { IntegrationsClient } from "./integrations-client";

export default async function IntegrationsPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const site = await getSiteByKey(key);
  if (!site) notFound();
  const integrations = await listIntegrations(site.id);
  return (
    <main className="p-6 max-w-3xl">
      <h1 className="text-2xl mb-1">{site.name} — integrations</h1>
      <p className="opacity-60 text-sm mb-4">Credentials are encrypted at rest. Plaintext never leaves the server response.</p>
      <IntegrationsClient siteId={site.id} initial={integrations} />
    </main>
  );
}
```

Create the client component `src/app/sites/[key]/integrations/integrations-client.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { INTEGRATION_KINDS } from "@/lib/validation/site";

interface ItemShape {
  id: number; kind: string; label: string | null; status: string; lastVerifiedAt: string | null;
}

export function IntegrationsClient({ siteId, initial }: { siteId: number; initial: ItemShape[] }) {
  const [items, setItems] = useState(initial);
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<(typeof INTEGRATION_KINDS)[number]>("wordpress");
  const [label, setLabel] = useState("");
  const [configText, setConfigText] = useState('{\n  "baseUrl": "",\n  "username": "",\n  "applicationPassword": ""\n}');
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    setErr(null);
    let config: object;
    try { config = JSON.parse(configText); }
    catch { setErr("Config must be valid JSON."); return; }
    start(async () => {
      const res = await fetch(`/api/sites/${siteId}/integrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, label: label || undefined, config }),
      });
      if (!res.ok) { setErr("Could not save."); return; }
      const created = await res.json();
      setItems([...items, created]);
      setLabel(""); setConfigText('{\n}');
    });
  };

  const remove = (id: number) => {
    if (!confirm("Delete this integration?")) return;
    start(async () => {
      await fetch(`/api/sites/${siteId}/integrations/${id}`, { method: "DELETE" });
      setItems(items.filter((i) => i.id !== id));
    });
  };

  return (
    <div className="space-y-6 text-sm">
      <section>
        <h2 className="text-lg mb-2">Existing</h2>
        {items.length === 0 ? <p className="opacity-60">None yet.</p> : (
          <table className="w-full">
            <thead><tr className="text-left opacity-60"><th>Kind</th><th>Label</th><th>Status</th><th /></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-t border-black/10">
                  <td className="py-2">{i.kind}</td>
                  <td>{i.label ?? "—"}</td>
                  <td>{i.status}</td>
                  <td><button onClick={() => remove(i.id)} className="underline">Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="border-t border-black/10 pt-4">
        <h2 className="text-lg mb-2">Add integration</h2>
        <div className="space-y-2">
          <label className="block">
            <span className="block opacity-70 mb-1">Kind</span>
            <select className="w-full border rounded px-2 py-1" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              {INTEGRATION_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block opacity-70 mb-1">Label (optional)</span>
            <input className="w-full border rounded px-2 py-1" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className="block">
            <span className="block opacity-70 mb-1">Config (JSON)</span>
            <textarea rows={8} className="w-full border rounded px-2 py-1 font-mono text-xs" value={configText} onChange={(e) => setConfigText(e.target.value)} />
          </label>
          {err && <div className="text-red-700">{err}</div>}
          <button disabled={pending} onClick={submit} className="px-3 py-1 border rounded">Save</button>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 12.3: Smoke-test**

- `/sites/default` → overview renders (Profile / Counts / Recent runs)
- `/sites/default/integrations` → "None yet"; create a wordpress integration with config `{"baseUrl":"https://wp.example","token":"xyz"}` → appears in list. Reload — still there. View Network tab: response shape has no `config` / `configIv` / `configTag` fields. ✓

- [ ] **Step 12.4: Commit**

```bash
git add src/app/sites/[key]
git commit -m "feat(ui): site overview + integrations CRUD (generic JSON form)"
```

---

## Task 13: Chat surface — site dropdown + header chip

**Files:**
- Modify: `src/app/chat/page.tsx`

- [ ] **Step 13.1: Add site dropdown to conversation create**

`/chat/page.tsx` is currently a thin shell (15 lines). It likely renders a conversation list/composer. Locate the "new conversation" trigger and add a site dropdown above the message input, defaulting to the active-site from `useActiveSite()`. On submit, POST to `/api/director/conversations` with `siteId` from the dropdown.

If the existing structure puts the conversation create in a separate component, edit that component instead. Key code snippet — wherever the create body is built:

```tsx
import { useActiveSite } from "@/lib/hooks/use-active-site";
// ...
const { activeSiteId, sites } = useActiveSite();
const [chosenSiteId, setChosenSiteId] = useState<number | null>(activeSiteId);
// keep chosenSiteId in sync if activeSiteId loads later:
useEffect(() => { if (chosenSiteId === null) setChosenSiteId(activeSiteId); }, [activeSiteId]);

// in the JSX, render a <select> bound to chosenSiteId before the message textarea
// when POSTing /api/director/conversations:
body: JSON.stringify({ siteId: chosenSiteId, ...rest })
```

- [ ] **Step 13.2: Render the bound-site chip in conversation header**

In the conversation header (wherever the title is rendered for an open conversation), add a chip near the title:

```tsx
{conv.siteId && site && (
  <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-black/5 border border-black/10">
    <span className="opacity-60">site</span>
    <span>{site.key}</span>
  </span>
)}
```

To get `site` server-side at conversation load, extend the existing `/api/director/conversations/[id]` (or equivalent) to include the site object alongside the conversation. If you'd rather not change the API contract: fetch `/api/sites/${conv.siteId}` from the client lazily.

- [ ] **Step 13.3: Smoke-test**

- Open `/chat`
- Create a new conversation with site `default`
- Send a message → reply lands; header shows the `site: default` chip

- [ ] **Step 13.4: Commit**

```bash
git add src/app/chat
git commit -m "feat(ui): chat surface bound to a site (dropdown on create, chip in header)"
```

---

## Task 14: Agent run page + dashboard column

**Files:**
- Modify: `src/app/agents/[key]/page.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 14.1: Add Site dropdown to agent-run form**

`/agents/[key]/page.tsx` renders the agent detail + a run button/form. Add a required Site dropdown to the form, pre-selecting the active site. On submit, POST to `/api/agents/[key]/run` with `siteId` plus the existing payload.

```tsx
// inside the form component (mark "use client" if not already):
const { activeSiteId, sites } = useActiveSite();
const [siteId, setSiteId] = useState<number | "">(activeSiteId ?? "");
// in JSX, above existing inputs:
<label className="block mb-3">
  <span className="block opacity-70 mb-1 text-sm">Site</span>
  <select className="border rounded px-2 py-1 text-sm" value={siteId} onChange={(e) => setSiteId(e.target.value ? Number(e.target.value) : "")}>
    <option value="">— choose a site —</option>
    {sites.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.key})</option>)}
  </select>
</label>
// disable submit unless siteId !== ""
// include siteId in the POST body
```

- [ ] **Step 14.2: Add Site column to dashboard when "All sites"**

`/page.tsx` renders the dashboard with recent runs. Read the active site from the kvSettings (server-side for the initial render). If `activeSiteId === null` ("All sites"), include a Site column in the recent-runs table. Otherwise hide it. Implementation sketch:

```tsx
import { db } from "@/lib/db/client";
import { kvSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

async function getActiveSiteIdServer(): Promise<number | null> {
  const [row] = await db.select().from(kvSettings).where(eq(kvSettings.key, "ui.activeSiteId")).limit(1);
  return row ? (row.value as { id: number | null }).id : null;
}

// in the dashboard:
const activeSiteId = await getActiveSiteIdServer();
const showSiteColumn = activeSiteId === null;
// fetch recent runs with optional filter:
const recent = activeSiteId
  ? await listRuns({ siteId: activeSiteId, limit: 20 })
  : await listRuns({ limit: 20 });
// also join to sites for column rendering when showSiteColumn
```

For the join: extend `listRuns` to include the site's `key` and `name` via a left join when needed. Or do a quick per-row lookup via `inArray` to avoid an N+1. Pseudo-code:

```ts
const siteIds = [...new Set(recent.map((r) => r.siteId))];
const siteRows = siteIds.length === 0 ? [] : await db.select().from(sites).where(inArray(sites.id, siteIds));
const siteById = new Map(siteRows.map((s) => [s.id, s]));
```

- [ ] **Step 14.3: Smoke-test**

- Open `/agents/qa` → site dropdown appears; run with the default site → job appears in DB with `site_id` set
- Change sidebar to "All sites" → dashboard shows the Site column with `default`. Switch back to the default site → column hidden.

- [ ] **Step 14.4: Commit**

```bash
git add src/app/agents src/app/page.tsx src/lib/services/runs.ts
git commit -m "feat(ui): site-scoped agent run form + dashboard site column when 'All sites'"
```

---

## Task 15: Worker README documents `payload.site` shape

**Files:**
- Modify: `worker/README.md`

- [ ] **Step 15.1: Add a `payload.site` section**

Open `worker/README.md`. Add a section explaining the new payload shape:

```markdown
## Job payload — `site` snapshot

Starting with the site-context-foundation deployment, every job claimed from
`/api/jobs/claim` includes a `site` block in its `payload`:

```json
{
  "site": {
    "id": 42,
    "key": "tonyspizza",
    "name": "Tony's Pizza",
    "domain": "https://tonyspizza.com",
    "locale": "en-US",
    "niche": "NYC pizza & Italian-American food",
    "audience": "home cooks + NYC tourists",
    "voiceGuide": "Warm, slightly nostalgic, food-first; never corporate",
    "contentPillars": ["recipes", "neighborhood history"],
    "bannedPhrases": ["delicious", "mouth-watering"]
  },
  // ... other agent-specific fields
}
```

Agent handlers should read `payload.site` (when present) and weave the
brand voice, niche, and banned phrases into their model prompts. The
foundation deployment does not change any worker handler — it only
ensures the data is available. Per-agent prompt updates that actually
consume this block ship as part of the per-agent / per-platform follow-up
specs.

No encrypted integration credentials ever appear in the payload. If a
worker needs platform credentials (publishing, analytics, etc.), it will
fetch them from a future authed endpoint at the time of the operation —
not via the payload.
\```
```

(Note the escaping of nested triple-backticks in your editor.)

- [ ] **Step 15.2: Commit**

```bash
git add worker/README.md
git commit -m "docs(worker): document payload.site snapshot shape (foundation only — no handler changes)"
```

---

## Task 16: Final integration check + commit gate

- [ ] **Step 16.1: Run the full test suite**

```bash
npm test
```

Expected: all tests pass — including pre-existing tests (auth, password policy, F-021 suite) which should not have been touched.

- [ ] **Step 16.2: Run the build**

```bash
npm run build
```

Expected: clean Next.js build with no type errors. Resolve any remaining `siteId`-related type errors surfaced here (commonly: existing callers of `enqueueJob` that haven't been updated).

- [ ] **Step 16.3: Manual end-to-end smoke**

1. Visit `/sites/new` → create site `tonyspizza` → fill voice tab → save.
2. Sidebar → switch active site to `tonyspizza`.
3. `/agents/qa` → site dropdown shows `tonyspizza` selected → run with a sample article + target keyword.
4. `SELECT * FROM jobs ORDER BY id DESC LIMIT 1;` → row has `site_id` matching `tonyspizza`'s id; `payload->'site'->>'voiceGuide'` matches what you saved.
5. `/chat` → start a new conversation pinned to `tonyspizza` → send "what should we research first?" → Director's reply references `tonyspizza`'s niche/audience.
6. Telegram → `/sites` lists both sites → `/site tonyspizza` pins the active conversation → free-text message → Director reply uses `tonyspizza`'s context.
7. Inspect job payload from step 5 director dispatch → `payload.site` present, snapshotted with `tonyspizza`'s fields.

- [ ] **Step 16.4: Final commit (if any cleanup remains)**

If any small leftovers — `package.json` lockfile drift, test snapshot updates, etc.:

```bash
git add -A
git commit -m "chore: cleanup after site-context foundation"
```

---

## Self-Review

After writing the plan above, here's a fresh-eyes check against the spec.

### Spec coverage

| Spec section | Implemented in task(s) |
|---|---|
| §1 Architecture overview | Threads through Tasks 2, 7, 9 |
| §2 `sites` table | Task 2 (schema + migration) |
| §2 `site_integrations` table | Task 2 + Task 4 (service) + Task 5 (API) + Task 12 (UI) |
| §2 Encryption helper | Task 1 |
| §2 FK columns on existing tables | Task 2 |
| §3 `/api/sites*` routes | Task 5 |
| §3 `siteId` on existing list/create routes | Task 6 |
| §3 Worker contract | Task 15 (docs) |
| §4 Sidebar Site selector | Task 9 |
| §4 Settings tabs | Task 10 |
| §4 `/sites/*` pages | Tasks 10, 11, 12 |
| §4 Chat surface | Task 13 |
| §4 Agent run dropdown | Task 14 |
| §4 Dashboard Site column | Task 14 |
| §5 `buildSystemPrompt(site)` | Task 7 |
| §5 Payload snapshot at enqueue | Task 7 |
| §5 Telegram `/site` `/sites` | Task 8 |
| §6 Migration (three-phase + default site) | Task 2 |
| §6 Encryption tests | Task 1 |
| §6 Service tests | Tasks 3, 4 |
| §6 Director tests | Task 7 |
| §6 Error handling: `key_taken`, `kind` enum, missing encryption key | Tasks 3, 5 |
| §8 Acceptance criteria | Verified in Task 16 manual smoke |

No gaps.

### Placeholder scan

- No "TBD" / "TODO" / "implement later".
- Every code-touching step has actual code.
- `ListField` is reused inside Task 11; its definition lives at the bottom of that task's snippet — no cross-task references.
- One borderline item: Task 13 says *"If the existing structure puts the conversation create in a separate component, edit that component instead."* This is a hedge because `/chat/page.tsx` is only 15 lines and likely re-exports a component I haven't seen. The instruction is clear: find the create handler, add the dropdown there. Acceptable.

### Type / naming consistency

- `siteId` (camelCase) in TS, `site_id` (snake_case) in SQL throughout — consistent with the existing pattern.
- `IntegrationListItem` returned by `listIntegrations` and `createIntegration`; `IntegrationWithPlain` only returned when `getIntegration(id, { decrypt: true })`. The smoke test in Task 5.5 and the UI in Task 12 both only read non-decrypted shapes.
- `buildSystemPrompt(site: Site | null)` — exported from `director.ts`, imported in the test file. Consistent.
- `enqueueJob` adds required `siteId: number`. Every caller in this plan supplies it (agent-run handler in Task 6, Director in Task 7). Existing callers not in this plan will surface in Task 16's `npm run build`.

### Scope discipline

- Each task ends with a commit; tasks are independent enough that subagent-driven execution can run one at a time.
- No platform driver code (WordPress publish, GSC pull, etc.) — those are deferred per spec §7.
- No `voiceGuide` / `bannedPhrases` actually wired into worker prompts — only the *transport* is in place. Per spec §5, this is on purpose.

Plan looks complete.
