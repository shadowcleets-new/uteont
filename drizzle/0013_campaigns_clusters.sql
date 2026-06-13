-- 0013 — Campaigns + keyword clusters (LO-36).
--
-- campaigns:        group multiple targets + keyword clusters under one themed
--                   goal, so the operator runs a push instead of juggling flat
--                   per-site targets.
-- keyword_clusters: a themed group of keywords (one content angle), optionally
--                   rolled up under a campaign.
--
-- NOTE: staged like 0010/0011/0012 — additive, idempotent (IF NOT EXISTS), no
-- destructive DDL. Apply directly; do NOT run drizzle-kit migrate blind
-- (journal drift — live DB is ahead of drizzle/meta/_journal.json; GAPS F-034 / LO-41).

CREATE TABLE IF NOT EXISTS "campaigns" (
  "id"         serial PRIMARY KEY NOT NULL,
  "site_id"    integer NOT NULL,
  "name"       text NOT NULL,
  "goal"       text,
  "status"     text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "keyword_clusters" (
  "id"          serial PRIMARY KEY NOT NULL,
  "site_id"     integer NOT NULL,
  "campaign_id" integer,
  "name"        text NOT NULL,
  "intent"      text,
  "keywords"    jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at"  timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaigns_site_idx" ON "campaigns" ("site_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "keyword_clusters_site_idx" ON "keyword_clusters" ("site_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "keyword_clusters_campaign_idx" ON "keyword_clusters" ("campaign_id");
