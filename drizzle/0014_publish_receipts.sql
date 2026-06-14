-- 0014 — publish_receipts (IP-07): the optimistic-concurrency record per
-- (article, target) that makes publishing idempotent. decidePublishAction
-- compares an incoming content hash / revision against the stored receipt so a
-- replayed publish converges to exactly one live object (noop | create | update).
--
-- One row per (article_id, target_id): the unique index lets the publisher
-- upsert the receipt after each successful push.
--
-- NOTE: additive, no destructive DDL. Apply directly; do NOT run
-- drizzle-kit migrate blind (journal drift, see GAPS F-034).

CREATE TABLE IF NOT EXISTS "publish_receipts" (
  "id" serial PRIMARY KEY NOT NULL,
  "article_id" integer NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "target_id" text NOT NULL,
  "content_hash" text NOT NULL,
  "remote_id" text,
  "status" text DEFAULT 'published' NOT NULL,
  "published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publish_receipts_article_idx"
  ON "publish_receipts" USING btree ("article_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "publish_receipts_article_target_unique_idx"
  ON "publish_receipts" USING btree ("article_id", "target_id");
