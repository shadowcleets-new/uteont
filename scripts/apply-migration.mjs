// Apply a single migration .sql file directly to the live Neon DB.
//
// This is the convention-safe path (the repo does NOT run `drizzle-kit migrate`
// blind — the journal is drifted, see GAPS F-034 / LO-41). Our migrations
// 0010–0013 are additive + idempotent (CREATE TABLE/INDEX IF NOT EXISTS), so
// re-running them is harmless.
//
//   node scripts/apply-migration.mjs drizzle/0012_critic_tactics.sql
//   node scripts/apply-migration.mjs drizzle/0013_campaigns_clusters.sql
//
// Then verify:  node scripts/verify-migration.mjs

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/apply-migration.mjs <path/to/NNNN_name.sql>");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set (expected in .env.local)");
  process.exit(1);
}

const sql = neon(url);
const raw = readFileSync(file, "utf8");

// Drizzle separates statements with `--> statement-breakpoint`. Split on that,
// strip comment-only/blank chunks, and run each statement in order.
const statements = raw
  .split(/-->\s*statement-breakpoint/g)
  .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
  .filter((s) => s.length > 0);

console.log(`applying ${file} — ${statements.length} statement(s)`);
for (const [i, stmt] of statements.entries()) {
  const preview = stmt.replace(/\s+/g, " ").slice(0, 70);
  try {
    await sql.query(stmt);
    console.log(`  [${i + 1}/${statements.length}] ok: ${preview}…`);
  } catch (e) {
    console.error(`  [${i + 1}/${statements.length}] FAILED: ${preview}…`);
    console.error("   ", e.message);
    process.exit(2);
  }
}
console.log("done. Now run: node scripts/verify-migration.mjs");
