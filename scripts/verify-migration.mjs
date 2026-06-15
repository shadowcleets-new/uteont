// Read-only verification that every expected table exists in the live DB.
// Fails loud on drift (exit 2) so it can gate deploys / migrations.
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

// Keep in lockstep with src/lib/db/schema.ts (migrations 0000–0013).
const EXPECTED = [
  "agent_state", "approvals", "articles", "auth_config", "checkpoints",
  "conversations", "cycles", "decision_records", "ideas", "jobs",
  "keyword_exclusions", "keywords", "kv_settings", "login_attempts",
  "messages", "metrics_timeseries", "notifications", "publish_receipts",
  "result_cache", "runs", "site_integrations", "sites",
  "target_snapshots", "targets",
];

const tableRows = await sql`
  SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
`;
const present = tableRows.map((r) => r.tablename);
const missing = EXPECTED.filter((t) => !present.includes(t));
const extra = present.filter((t) => !EXPECTED.includes(t) && !t.startsWith("__"));

console.log("tables present:", present.length);
console.log("expected:", EXPECTED.length);
console.log("MISSING:", missing.length ? missing.join(", ") : "(none)");
console.log("unexpected extras:", extra.length ? extra.join(", ") : "(none)");

// drizzle journal vs reality (F-034 drift watch)
let migs = [];
try {
  migs = await sql`SELECT id, created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
} catch (e) {
  console.log("migrations table query error:", e.message);
}
console.log("journal-applied migrations count:", migs.length, "(repo ships 0000–0013; journal lag is known drift — see GAPS F-034)");

process.exit(missing.length === 0 ? 0 : 2);
