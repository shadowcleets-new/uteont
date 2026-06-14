-- 0012 — metrics_timeseries (IP-10): the per-(entity, metric, day) measurement
-- substrate. GSC/GA4/rank pulls upsert one row per (site, entity, metric, day)
-- so trend / decay / cannibalization math has memory.
--
-- The unique index on (site_id, entity_type, entity_key, metric, captured_on)
-- makes the daily upsert idempotent: re-running the cron the same day overwrites
-- the value instead of duplicating it (ON CONFLICT ... DO UPDATE).
--
-- NOTE: additive, no destructive DDL. Apply directly; do NOT run
-- drizzle-kit migrate blind (journal drift, see GAPS F-034).

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
  ON "metrics_timeseries" USING btree ("site_id", "entity_key", "captured_on");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metrics_timeseries_metric_idx"
  ON "metrics_timeseries" USING btree ("site_id", "metric", "captured_on");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "metrics_timeseries_day_unique_idx"
  ON "metrics_timeseries" USING btree ("site_id", "entity_type", "entity_key", "metric", "captured_on");
