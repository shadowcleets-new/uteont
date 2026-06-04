-- Director chat memory: rolling summary + window pointer on conversations.
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "summary" text;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "summary_up_to_id" integer NOT NULL DEFAULT 0;
