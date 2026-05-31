CREATE TABLE "target_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"target_id" integer NOT NULL,
	"value" real NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "target_snapshots" ADD CONSTRAINT "target_snapshots_target_id_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "target_snapshots_target_idx" ON "target_snapshots" USING btree ("target_id");