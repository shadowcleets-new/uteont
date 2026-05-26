/**
 * Drizzle + Neon serverless DB client.
 *
 * Lazy-initialized: `getDb()` constructs the connection on first call,
 * after env vars are available. Throws if DATABASE_URL is missing so
 * callers can catch and degrade gracefully (e.g. exports return empty
 * payloads when the DB isn't provisioned yet).
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set. Run `vercel env pull .env.local` after " +
          "linking the project and provisioning Neon.",
      );
    }
    const sql = neon(url);
    _db = drizzle(sql, { schema });
  }
  return _db;
}

export type DB = ReturnType<typeof getDb>;
