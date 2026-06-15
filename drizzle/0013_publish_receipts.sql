-- 0013 — publish_receipts (IP-07): the idempotent-publishing ledger.
--
-- A publish job may be delivered / replayed any number of times, yet for a fixed
-- (article, revision, target) each CMS must converge to exactly one live object.
-- This table records what was pushed where: the content hash is the convergence
-- token (matching hash -> noop), and remote_id is the optimistic-concurrency
-- handle for updates. decidePublishAction (services/publish-decision.ts) reads the
-- latest receipt to choose noop|create|update.
--
-- NOTE: additive + idempotent (CREATE TABLE / INDEX IF NOT EXISTS). Apply directly;
-- do NOT run drizzle-kit migrate blind (journal drift, see GAPS F-034).

CREATE TABLE IF NOT EXISTS "publish_receipts" (
  "id" serial PRIMARY KEY NOT NULL,
  "article_id" integer NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "target_id" text NOT NULL,
  "content_hash" text NOT NULL,
  "remote_id" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publish_receipts_article_idx"
  ON "publish_receipts" USING btree ("article_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "publish_receipts_article_target_unique_idx"
  ON "publish_receipts" USING btree ("article_id", "target_id", "revision");
