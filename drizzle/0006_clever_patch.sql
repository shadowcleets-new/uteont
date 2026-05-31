CREATE TABLE "targets" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"title" text NOT NULL,
	"metric" text NOT NULL,
	"direction" text DEFAULT 'increase' NOT NULL,
	"baseline_value" real NOT NULL,
	"goal_value" real NOT NULL,
	"manual_current" real,
	"start_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "targets" ADD CONSTRAINT "targets_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "targets_site_idx" ON "targets" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "targets_status_idx" ON "targets" USING btree ("status");