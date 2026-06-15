-- 0012 — metrics_timeseries (IP-10): the per-(page|query|site) measurement substrate.
--
-- Per-page / per-query GSC + GA4 history is fetched on demand but never stored as a
-- time series, so trend / decay / re-optimization math has no memory. This table is
-- that memory: one row per (site, entity_type, entity_key, metric, day). The unique
-- index makes upserts idempotent on the day key — a same-day cron re-run overwrites
-- rather than duplicating.
--
-- NOTE: additive + idempotent (CREATE TABLE / INDEX IF NOT EXISTS). Apply directly;
-- do NOT run drizzle-kit migrate blind (journal drift, see GAPS F-034).

CREATE TABLE IF NOT EXISTS "metrics_timeseries" (
  "id" serial PRIMARY KEY NOT NULL,
  "site_id" integer NOT NULL,
  "entity_type" text NOT NULL,
  "entity_key" text NOT NULL,
  "metric" text NOT NULL,
  "value" real NOT NULL,
  "captured_on" date NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "metrics_timeseries"
  ADD CONSTRAINT "metrics_timeseries_site_id_sites_id_fk"
  FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metrics_timeseries_entity_idx"
  ON "metrics_timeseries" USING btree ("site_id", "entity_key", "metric");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metrics_timeseries_day_idx"
  ON "metrics_timeseries" USING btree ("site_id", "captured_on");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "metrics_timeseries_unique_idx"
  ON "metrics_timeseries" USING btree ("site_id", "entity_type", "entity_key", "metric", "captured_on");
