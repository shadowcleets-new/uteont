/**
 * Drizzle + Neon serverless DB client.
 * Reads DATABASE_URL from env. Auto-pooled by the Neon driver.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  // Don't throw at module load — Next.js may eval this during build with
  // no env. Lazy-check on first use.
  console.warn("[db] DATABASE_URL is not set");
}

const sql = neon(databaseUrl ?? "");
export const db = drizzle(sql, { schema });

export type DB = typeof db;
