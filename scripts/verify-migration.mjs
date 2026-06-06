// One-off, read-only verification that migration 0004 landed.
// Run: node scripts/verify-migration.mjs
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

const EXPECTED = [
  "agent_state", "approvals", "articles", "auth_config", "conversations",
  "cycles", "ideas", "jobs", "keyword_exclusions", "keywords",
  "kv_settings", "login_attempts", "messages", "notifications", "runs",
  "site_integrations", "sites",
];

const tableRows = await sql`
  SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
`;
const present = tableRows.map((r) => r.tablename);
const missing = EXPECTED.filter((t) => !present.includes(t));

console.log("tables present:", present.length);
console.log("expected:", EXPECTED.length);
console.log("MISSING:", missing.length ? missing.join(", ") : "(none)");

// site_id column check on cycles
const cols = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'cycles' AND column_name = 'site_id'
`;
console.log("cycles.site_id column:", cols.length ? "present" : "MISSING");

// default site backfill check
let defaultSite = [];
try {
  defaultSite = await sql`SELECT id, key, domain FROM sites WHERE key = 'default'`;
} catch (e) {
  console.log("sites query error:", e.message);
}
console.log("default site row:", defaultSite.length ? JSON.stringify(defaultSite[0]) : "(none)");

// applied migrations
let migs = [];
try {
  migs = await sql`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
} catch (e) {
  console.log("migrations table query error:", e.message);
}
console.log("applied migrations count:", migs.length);

process.exit(missing.length === 0 ? 0 : 2);
