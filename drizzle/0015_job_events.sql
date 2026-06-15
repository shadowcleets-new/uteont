-- 0013 — job_events (IP-13): an append-only audit of every job status
-- transition (queued -> claimed -> done | failed | requeued), so a job's full
-- lifecycle is forensically legible in the run console.
--
-- Emitted best-effort on each transition in services/jobs.ts; reads are
-- defensive (no table -> empty timeline).
--
-- NOTE: additive, no destructive DDL. Apply directly; do NOT run
-- drizzle-kit migrate blind (journal drift, see GAPS F-034).

CREATE TABLE IF NOT EXISTS "job_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "job_id" integer NOT NULL,
  "from_status" text,
  "to_status" text NOT NULL,
  "reason" text,
  "at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_events_job_idx"
  ON "job_events" USING btree ("job_id");
