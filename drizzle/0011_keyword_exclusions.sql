-- 0011 — Closed-loop keyword exclusions (ported from the Milestone-10 line).
--
-- Captures operator rejections ("shelve" on a keyword, manual adds on
-- /exclusions) so future Research / Ideation runs suppress them twice over:
--   1. prompt-time   — payload.exclusions rides every research/idea-generation
--                      dispatch so the worker can inject a negative-constraint
--                      block;
--   2. ingestion-time — persistResearchKeywords lexically filters incoming
--                      keywords against the list (deterministic enforcement
--                      the LLM cannot ignore).
--
-- The composite unique index on (site_id, LOWER(phrase)) collapses case
-- variants so duplicate captures are idempotent no-ops.
--
-- NOTE: staged like 0010 — apply directly (additive, no destructive DDL);
-- do NOT run drizzle-kit migrate blind (journal drift, see GAPS F-034).

CREATE TABLE IF NOT EXISTS "keyword_exclusions" (
  "id" serial PRIMARY KEY NOT NULL,
  "site_id" integer NOT NULL,
  "phrase" text NOT NULL,
  "reason" text,
  "source" text DEFAULT 'keyword' NOT NULL,
  "source_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "keyword_exclusions"
  ADD CONSTRAINT "keyword_exclusions_site_id_sites_id_fk"
  FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "keyword_exclusions_site_idx"
  ON "keyword_exclusions" USING btree ("site_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "keyword_exclusions_site_phrase_unique_idx"
  ON "keyword_exclusions" USING btree ("site_id", LOWER("phrase"));
