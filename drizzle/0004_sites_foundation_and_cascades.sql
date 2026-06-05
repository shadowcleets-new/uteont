-- Milestone 2 — Sites foundation + cascading deletes + integration dedup.
--
-- Adds the sites/site_integrations/keyword_exclusions tables (the minimal
-- shape the full site-context-foundation spec will extend), threads a
-- nullable site_id FK with ON DELETE CASCADE through every per-site
-- table, seeds a "default" site so existing rows aren't orphaned during
-- the backfill, and enforces per-site integration deduplication via the
-- composite unique index (site_id, kind).
--
-- Integration config is JSONB in v1; the at-rest AES-256-GCM column
-- shape lives in the foundation spec and migrates in a follow-up.

CREATE TABLE "sites" (
  "id" serial PRIMARY KEY NOT NULL,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "domain" text NOT NULL,
  "locale" text DEFAULT 'en-US' NOT NULL,
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
CREATE UNIQUE INDEX "sites_key_unique_idx" ON "sites" USING btree ("key");
--> statement-breakpoint
CREATE INDEX "sites_status_idx" ON "sites" USING btree ("status");
--> statement-breakpoint

CREATE TABLE "site_integrations" (
  "id" serial PRIMARY KEY NOT NULL,
  "site_id" integer NOT NULL,
  "kind" text NOT NULL,
  "label" text,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'unverified' NOT NULL,
  "last_verified_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_integrations" ADD CONSTRAINT "site_integrations_site_id_sites_id_fk"
  FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "site_integrations_site_idx" ON "site_integrations" USING btree ("site_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "site_integrations_site_kind_unique_idx" ON "site_integrations" USING btree ("site_id","kind");
--> statement-breakpoint
CREATE INDEX "site_integrations_status_idx" ON "site_integrations" USING btree ("status");
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
ALTER TABLE "keyword_exclusions" ADD CONSTRAINT "keyword_exclusions_site_id_sites_id_fk"
  FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "keyword_exclusions_site_idx" ON "keyword_exclusions" USING btree ("site_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "keyword_exclusions_site_phrase_unique_idx" ON "keyword_exclusions" USING btree ("site_id", LOWER("phrase"));
--> statement-breakpoint

-- Thread site_id through existing tables (nullable for backwards-compat).
ALTER TABLE "cycles"        ADD COLUMN "site_id" integer;--> statement-breakpoint
ALTER TABLE "runs"          ADD COLUMN "site_id" integer;--> statement-breakpoint
ALTER TABLE "jobs"          ADD COLUMN "site_id" integer;--> statement-breakpoint
ALTER TABLE "keywords"      ADD COLUMN "site_id" integer;--> statement-breakpoint
ALTER TABLE "ideas"         ADD COLUMN "site_id" integer;--> statement-breakpoint
ALTER TABLE "articles"      ADD COLUMN "site_id" integer;--> statement-breakpoint
ALTER TABLE "approvals"     ADD COLUMN "site_id" integer;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "site_id" integer;--> statement-breakpoint

-- Seed a default site so existing data isn't orphaned.
INSERT INTO "sites" ("key","name","domain","locale","cms_platform","status")
VALUES ('default','Default Site','https://example.invalid','en-US','none','active')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint

UPDATE "cycles"    SET "site_id" = (SELECT id FROM "sites" WHERE "key"='default') WHERE "site_id" IS NULL;--> statement-breakpoint
UPDATE "runs"      SET "site_id" = (SELECT id FROM "sites" WHERE "key"='default') WHERE "site_id" IS NULL;--> statement-breakpoint
UPDATE "jobs"      SET "site_id" = (SELECT id FROM "sites" WHERE "key"='default') WHERE "site_id" IS NULL;--> statement-breakpoint
UPDATE "keywords"  SET "site_id" = (SELECT id FROM "sites" WHERE "key"='default') WHERE "site_id" IS NULL;--> statement-breakpoint
UPDATE "ideas"     SET "site_id" = (SELECT id FROM "sites" WHERE "key"='default') WHERE "site_id" IS NULL;--> statement-breakpoint
UPDATE "articles"  SET "site_id" = (SELECT id FROM "sites" WHERE "key"='default') WHERE "site_id" IS NULL;--> statement-breakpoint
UPDATE "approvals" SET "site_id" = (SELECT id FROM "sites" WHERE "key"='default') WHERE "site_id" IS NULL;--> statement-breakpoint

-- Cascading FKs back to sites.
ALTER TABLE "cycles"        ADD CONSTRAINT "cycles_site_id_sites_id_fk"        FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs"          ADD CONSTRAINT "runs_site_id_sites_id_fk"          FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs"          ADD CONSTRAINT "jobs_site_id_sites_id_fk"          FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keywords"      ADD CONSTRAINT "keywords_site_id_sites_id_fk"      FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas"         ADD CONSTRAINT "ideas_site_id_sites_id_fk"         FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles"      ADD CONSTRAINT "articles_site_id_sites_id_fk"      FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals"     ADD CONSTRAINT "approvals_site_id_sites_id_fk"     FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Site indexes.
CREATE INDEX "cycles_site_idx"        ON "cycles" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "runs_site_idx"          ON "runs" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "jobs_site_idx"          ON "jobs" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "keywords_site_idx"      ON "keywords" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "ideas_site_idx"         ON "ideas" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "articles_site_idx"      ON "articles" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "approvals_site_idx"     ON "approvals" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "conversations_site_idx" ON "conversations" USING btree ("site_id");
