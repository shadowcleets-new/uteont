-- 0012 — Critic Agent (#12, LO-59/60) + Tactics Scraper Agent (#13, LO-61/63).
--
-- critiques: binary serves|fails verdicts the Critic renders on a producing
--   agent's terminal output, with one actionable recommendation on fail, the
--   iteration count (capped at 3 → ship-with-warning), and the strictness mode.
-- tactics:   marketing/SEO tactics distilled by the Tactics Scraper from
--   communities (reddit/hn/forum/blog/x) or NotebookLM-derived video summaries,
--   read by Idea Generation + the Director during planning.
--
-- NOTE: staged like 0010/0011 — additive, idempotent (IF NOT EXISTS), no
-- destructive DDL. Apply directly; do NOT run drizzle-kit migrate blind
-- (journal drift — the live DB is ahead of drizzle/meta/_journal.json; see
-- GAPS F-034 / LO-41).

CREATE TABLE IF NOT EXISTS "critiques" (
  "id"             serial PRIMARY KEY NOT NULL,
  "site_id"        integer,
  "agent_key"      text NOT NULL,
  "job_id"         integer,
  "run_id"         integer,
  "end_goal"       text,
  "verdict"        text NOT NULL,
  "recommendation" text,
  "iteration"      integer DEFAULT 1 NOT NULL,
  "strictness"     text DEFAULT 'standard' NOT NULL,
  "created_at"     timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tactics" (
  "id"          serial PRIMARY KEY NOT NULL,
  "site_id"     integer,
  "source_url"  text NOT NULL,
  "source_type" text NOT NULL,
  "title"       text NOT NULL,
  "body"        text NOT NULL,
  "tags"        jsonb,
  "score"       real,
  "added_by"    text,
  "scraped_at"  timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "critiques" ADD CONSTRAINT "critiques_site_id_sites_id_fk"
    FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tactics" ADD CONSTRAINT "tactics_site_id_sites_id_fk"
    FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "critiques_agent_idx" ON "critiques" ("agent_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "critiques_site_idx"  ON "critiques" ("site_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "critiques_job_idx"   ON "critiques" ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tactics_source_idx"  ON "tactics" ("source_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tactics_site_idx"    ON "tactics" ("site_id");
