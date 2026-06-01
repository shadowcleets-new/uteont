CREATE TABLE "decision_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer,
	"subject_key" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"rationale" text,
	"confidence" real,
	"evidence" jsonb,
	"inputs" jsonb,
	"run_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "decision_records" ADD CONSTRAINT "decision_records_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "decision_records_kind_idx" ON "decision_records" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "decision_records_site_idx" ON "decision_records" USING btree ("site_id");