CREATE TABLE "agent_state" (
	"agent_key" text PRIMARY KEY NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"pause_reason" text,
	"cooldown_until" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"config" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"gate" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" integer NOT NULL,
	"decision" text NOT NULL,
	"note" text,
	"decided_by" text DEFAULT 'user' NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"channel" text DEFAULT 'web' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"idea_id" integer,
	"cycle_id" integer,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"body" text NOT NULL,
	"meta_title" text,
	"meta_description" text,
	"qa_score" integer,
	"qa_report" jsonb,
	"seo_score" integer,
	"seo_report" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"cms_url" text,
	"run_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cycles" (
	"id" serial PRIMARY KEY NOT NULL,
	"goal" text NOT NULL,
	"seed_terms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'researching' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ideas" (
	"id" serial PRIMARY KEY NOT NULL,
	"keyword_id" integer,
	"cycle_id" integer,
	"angle" text NOT NULL,
	"brief" text NOT NULL,
	"intent" text,
	"status" text DEFAULT 'proposed' NOT NULL,
	"reject_reason" text,
	"run_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_key" text NOT NULL,
	"cycle_id" integer,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"claimed_by" text,
	"claimed_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"result" jsonb,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keywords" (
	"id" serial PRIMARY KEY NOT NULL,
	"cycle_id" integer,
	"keyword" text NOT NULL,
	"search_volume_estimate" integer NOT NULL,
	"competition_score" real NOT NULL,
	"source" text NOT NULL,
	"priority_rank" integer NOT NULL,
	"status" text DEFAULT 'researched' NOT NULL,
	"shelved_reason" text,
	"approved_at" timestamp with time zone,
	"run_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kv_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"kind" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"payload" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject_key" text NOT NULL,
	"category" text NOT NULL,
	"action" text NOT NULL,
	"cycle_id" integer,
	"job_id" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"result" jsonb,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approvals_gate_idx" ON "approvals" USING btree ("gate");--> statement-breakpoint
CREATE INDEX "approvals_target_idx" ON "approvals" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "articles_cycle_idx" ON "articles" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "articles_status_idx" ON "articles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "articles_slug_idx" ON "articles" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "cycles_status_idx" ON "cycles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ideas_cycle_idx" ON "ideas" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "ideas_keyword_idx" ON "ideas" USING btree ("keyword_id");--> statement-breakpoint
CREATE INDEX "ideas_status_idx" ON "ideas" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_agent_idx" ON "jobs" USING btree ("agent_key");--> statement-breakpoint
CREATE INDEX "jobs_cycle_idx" ON "jobs" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "keywords_cycle_idx" ON "keywords" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "keywords_status_idx" ON "keywords" USING btree ("status");--> statement-breakpoint
CREATE INDEX "keywords_priority_idx" ON "keywords" USING btree ("priority_rank");--> statement-breakpoint
CREATE INDEX "notifications_status_idx" ON "notifications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notifications_kind_idx" ON "notifications" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "runs_subject_idx" ON "runs" USING btree ("subject_key");--> statement-breakpoint
CREATE INDEX "runs_started_idx" ON "runs" USING btree ("started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "runs_cycle_idx" ON "runs" USING btree ("cycle_id");