CREATE TABLE "result_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"dedupe_key" text NOT NULL,
	"agent_key" text NOT NULL,
	"site_id" integer NOT NULL,
	"result" jsonb NOT NULL,
	"source_run_id" integer,
	"source_job_id" integer,
	"hit_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "result_cache" ADD CONSTRAINT "result_cache_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "result_cache_dedupe_key_unique_idx" ON "result_cache" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "result_cache_agent_site_idx" ON "result_cache" USING btree ("agent_key","site_id");--> statement-breakpoint
CREATE INDEX "result_cache_expires_idx" ON "result_cache" USING btree ("expires_at");