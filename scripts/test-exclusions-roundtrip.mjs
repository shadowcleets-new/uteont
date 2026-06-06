// Self-cleaning functional test of the keyword_exclusions schema.
// Proves: (a) FK to sites accepts a valid site_id, (b) the
// (site_id, LOWER(phrase)) unique index collapses case variants.
// Inserts + deletes its own rows; leaves no residue.
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const [site] = await sql`SELECT id FROM sites WHERE key = 'default' LIMIT 1`;
if (!site) { console.error("no default site"); process.exit(1); }

let pass = true;
try {
  const [row] = await sql`
    INSERT INTO keyword_exclusions (site_id, phrase, source)
    VALUES (${site.id}, 'Credit Card Rewards', 'keyword')
    RETURNING id
  `;
  console.log("inserted 'Credit Card Rewards' id=", row.id);

  let blocked = false;
  try {
    await sql`
      INSERT INTO keyword_exclusions (site_id, phrase, source)
      VALUES (${site.id}, 'credit card rewards', 'keyword')
    `;
  } catch (e) {
    blocked = /unique|duplicate/i.test(e.message);
    console.log("case-variant insert correctly rejected:", blocked);
  }
  if (!blocked) { pass = false; console.error("FAIL: case variant was NOT blocked"); }

  await sql`DELETE FROM keyword_exclusions WHERE id = ${row.id}`;
  await sql`DELETE FROM keyword_exclusions WHERE site_id = ${site.id} AND LOWER(phrase) = 'credit card rewards'`;
  console.log("cleaned up test rows.");
} catch (e) {
  pass = false;
  console.error("FAIL:", e.message);
}

console.log(pass ? "ROUNDTRIP PASS" : "ROUNDTRIP FAIL");
process.exit(pass ? 0 : 1);
