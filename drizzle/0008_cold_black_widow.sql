CREATE TABLE "checkpoints" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer,
	"gate" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"payload" jsonb,
	"blast_radius" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decision" text,
	"note" text,
	"decided_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkpoints_status_idx" ON "checkpoints" USING btree ("status");--> statement-breakpoint
CREATE INDEX "checkpoints_site_idx" ON "checkpoints" USING btree ("site_id");