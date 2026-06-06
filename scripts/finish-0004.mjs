// Idempotent completion of migration 0004: create keyword_exclusions, which
// drizzle-kit skipped because this DB already had a migration at index 4
// (from the site-context-foundation branch). Purely additive — IF NOT EXISTS
// everywhere, FK guarded by a pg_constraint existence check.
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const sql = neon(url);

console.log("1/4 create table keyword_exclusions (if not exists)…");
await sql`
  CREATE TABLE IF NOT EXISTS "keyword_exclusions" (
    "id" serial PRIMARY KEY NOT NULL,
    "site_id" integer NOT NULL,
    "phrase" text NOT NULL,
    "reason" text,
    "source" text DEFAULT 'keyword' NOT NULL,
    "source_id" integer,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )
`;

console.log("2/4 add FK to sites (if absent)…");
const fk = await sql`
  SELECT 1 FROM pg_constraint WHERE conname = 'keyword_exclusions_site_id_sites_id_fk'
`;
if (fk.length === 0) {
  await sql`
    ALTER TABLE "keyword_exclusions"
    ADD CONSTRAINT "keyword_exclusions_site_id_sites_id_fk"
    FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id")
    ON DELETE cascade ON UPDATE no action
  `;
  console.log("   FK added.");
} else {
  console.log("   FK already present.");
}

console.log("3/4 create site index (if not exists)…");
await sql`
  CREATE INDEX IF NOT EXISTS "keyword_exclusions_site_idx"
  ON "keyword_exclusions" USING btree ("site_id")
`;

console.log("4/4 create lowered-phrase unique index (if not exists)…");
await sql`
  CREATE UNIQUE INDEX IF NOT EXISTS "keyword_exclusions_site_phrase_unique_idx"
  ON "keyword_exclusions" USING btree ("site_id", LOWER("phrase"))
`;

console.log("done.");
process.exit(0);
