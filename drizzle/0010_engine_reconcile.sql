CREATE TABLE "job_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"reason" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keyword_exclusions" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"phrase" text NOT NULL,
	"reason" text,
	"source" text DEFAULT 'keyword' NOT NULL,
	"source_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrics_timeseries" (
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
CREATE TABLE "publish_receipts" (
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
ALTER TABLE "conversations" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "summary_up_to_id" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "keyword_exclusions" ADD CONSTRAINT "keyword_exclusions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics_timeseries" ADD CONSTRAINT "metrics_timeseries_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_events_job_idx" ON "job_events" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "keyword_exclusions_site_idx" ON "keyword_exclusions" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "keyword_exclusions_site_phrase_unique_idx" ON "keyword_exclusions" USING btree ("site_id",lower("phrase"));--> statement-breakpoint
CREATE INDEX "metrics_timeseries_entity_idx" ON "metrics_timeseries" USING btree ("site_id","entity_key","captured_on");--> statement-breakpoint
CREATE INDEX "metrics_timeseries_metric_idx" ON "metrics_timeseries" USING btree ("site_id","metric","captured_on");--> statement-breakpoint
CREATE UNIQUE INDEX "metrics_timeseries_day_unique_idx" ON "metrics_timeseries" USING btree ("site_id","entity_type","entity_key","metric","captured_on");--> statement-breakpoint
CREATE INDEX "publish_receipts_article_idx" ON "publish_receipts" USING btree ("article_id");--> statement-breakpoint
CREATE UNIQUE INDEX "publish_receipts_article_target_unique_idx" ON "publish_receipts" USING btree ("article_id","target_id");