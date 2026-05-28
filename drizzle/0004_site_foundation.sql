CREATE TABLE "site_integrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"kind" text NOT NULL,
	"label" text,
	"config" text NOT NULL,
	"config_iv" text NOT NULL,
	"config_tag" text NOT NULL,
	"status" text DEFAULT 'unverified' NOT NULL,
	"last_verified_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"locale" text NOT NULL,
	"niche" text,
	"audience" text,
	"voice_guide" text,
	"content_pillars" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"banned_phrases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cms_platform" text DEFAULT 'none' NOT NULL,
	"sitemap_url" text,
	"gsc_property_id" text,
	"ga4_property_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "site_id" integer;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "site_id" integer;--> statement-breakpoint
ALTER TABLE "cycles" ADD COLUMN "site_id" integer;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "site_id" integer;--> statement-breakpoint
ALTER TABLE "keywords" ADD COLUMN "site_id" integer;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "site_id" integer;--> statement-breakpoint
ALTER TABLE "site_integrations" ADD CONSTRAINT "site_integrations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_integrations_site_idx" ON "site_integrations" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "site_integrations_kind_idx" ON "site_integrations" USING btree ("site_id","kind");--> statement-breakpoint
CREATE INDEX "site_integrations_status_idx" ON "site_integrations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "sites_key_unique_idx" ON "sites" USING btree ("key");--> statement-breakpoint
CREATE INDEX "sites_status_idx" ON "sites" USING btree ("status");--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "articles_site_idx" ON "articles" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "conversations_site_idx" ON "conversations" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "cycles_site_idx" ON "cycles" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "jobs_site_idx" ON "jobs" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "keywords_site_idx" ON "keywords" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "runs_site_idx" ON "runs" USING btree ("site_id");

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
