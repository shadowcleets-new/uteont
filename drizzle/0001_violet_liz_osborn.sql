CREATE TABLE "auth_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text,
	"password_hash" text,
	"allowed_google_email" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
