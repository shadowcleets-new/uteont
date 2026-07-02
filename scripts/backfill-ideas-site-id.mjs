// Backfill ideas.site_id from run -> cycle -> keyword (in that preference order),
// then DELETE ideas with no derivable site (owner decision). Idempotent.
//
// Run with:  node --env-file=.env.local scripts/backfill-ideas-site-id.mjs
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set. Run with: node --env-file=.env.local scripts/backfill-ideas-site-id.mjs");
  process.exit(1);
}
const sql = neon(url);

const before = (await sql`SELECT count(*)::int AS n FROM ideas`)[0].n;
console.log(`ideas rows: ${before}`);

await sql`UPDATE ideas i SET site_id = r.site_id
  FROM runs r WHERE i.run_id = r.id AND i.site_id IS NULL`;
await sql`UPDATE ideas i SET site_id = c.site_id
  FROM cycles c WHERE i.cycle_id = c.id AND i.site_id IS NULL`;
await sql`UPDATE ideas i SET site_id = k.site_id
  FROM keywords k WHERE i.keyword_id = k.id AND i.site_id IS NULL`;

const orphans = (await sql`SELECT count(*)::int AS n FROM ideas WHERE site_id IS NULL`)[0].n;
console.log(`Backfilled via run/cycle/keyword. Orphan ideas (no derivable site): ${orphans}`);

if (orphans > 0) {
  await sql`DELETE FROM ideas WHERE site_id IS NULL`;
  console.log(`Deleted ${orphans} orphan idea(s).`);
}

const left = (await sql`SELECT count(*)::int AS n FROM ideas WHERE site_id IS NULL`)[0].n;
console.log(`Remaining NULL site_id (must be 0): ${left}`);
if (left !== 0) {
  console.error("ERROR: some ideas still have NULL site_id — do NOT tighten to NOT NULL yet.");
  process.exit(1);
}
console.log("OK — safe to tighten ideas.site_id to NOT NULL.");
