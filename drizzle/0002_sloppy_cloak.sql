CREATE TABLE "login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"success" boolean NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_config" ADD COLUMN "admin_chat_id" text;--> statement-breakpoint
ALTER TABLE "auth_config" ADD COLUMN "setup_token" text;--> statement-breakpoint
ALTER TABLE "auth_config" ADD COLUMN "setup_token_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "login_attempts_created_idx" ON "login_attempts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "login_attempts_username_idx" ON "login_attempts" USING btree ("username");