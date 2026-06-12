// Seed the single-row auth_config credential so credentials login works
// without Telegram. Usage: node scripts/seed-admin.mjs [username] [password]
// Defaults: admin / ChangeMe!2026  (change it after first login).
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

const sql = neon(process.env.DATABASE_URL);
const username = process.argv[2] || "admin";
const password = process.argv[3] || "ChangeMe!2026";

// Mirror the app's password policy (auth-config.ts validatePassword).
const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) =>
  re.test(password),
).length;
if (password.length < 12 || password.length > 128 || classes < 3) {
  console.error(
    "Password must be 12-128 chars and include >=3 of: lowercase, uppercase, digit, symbol.",
  );
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
const existing = await sql`SELECT id FROM auth_config WHERE id = 1`;
if (existing.length) {
  await sql`UPDATE auth_config SET username = ${username}, password_hash = ${hash}, updated_at = now() WHERE id = 1`;
  console.log("updated existing auth_config row.");
} else {
  await sql`INSERT INTO auth_config (id, username, password_hash, updated_at) VALUES (1, ${username}, ${hash}, now())`;
  console.log("inserted auth_config row.");
}
console.log("username:", username);
console.log("password:", password, "(change this after logging in)");
process.exit(0);
