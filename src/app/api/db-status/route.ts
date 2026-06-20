import { NextResponse } from "next/server";
import { sql, is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { auth } from "@/auth";

// Single source of truth: derive the expected table set from the Drizzle schema
// itself, so this drift-detector can NEVER fall behind schema.ts. The previous
// hand-maintained list omitted 7 real tables (checkpoints, decision_records,
// job_events, keyword_exclusions, metrics_timeseries, publish_receipts,
// target_snapshots), so it reported ok:true during the exact migration drift it
// exists to catch. (N-08)
const EXPECTED_TABLES = Object.values(schema)
  .filter((v) => is(v, PgTable))
  .map((t) => getTableConfig(t as PgTable).name)
  .sort();

/**
 * Auth-gated DB schema health check. Useful for catching migration drift
 * (the May 27 2026 incident where 2/3 migrations silently skipped and
 * caused all auth admin commands to fail with no reply).
 *
 * Only authenticated users (or worker via bearer) can hit this.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const db = getDb();
    const rows = await db.execute<{ tablename: string }>(
      sql`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
    );
    const list = ((rows as unknown as { rows?: { tablename: string }[] }).rows ??
      (Array.isArray(rows) ? rows : [])) as { tablename: string }[];
    const tables = list.map((r) => r.tablename);
    const missing = EXPECTED_TABLES.filter((t) => !tables.includes(t));

    const migrations = await db
      .execute<{ id: number; hash: string }>(
        sql`SELECT id, hash FROM drizzle.__drizzle_migrations ORDER BY id`,
      )
      .catch(() => null);
    const migList = migrations
      ? ((migrations as unknown as { rows?: { id: number; hash: string }[] }).rows ??
          (Array.isArray(migrations) ? migrations : []))
      : [];

    return NextResponse.json({
      ok: missing.length === 0,
      tablesPresent: tables,
      tablesMissing: missing,
      migrationsApplied: (migList as Array<{ id: number; hash: string }>).length,
      hint:
        missing.length > 0
          ? "Schema drift: tables missing. The drizzle journal is truncated at 0009, so `db:migrate` will NOT create 0010–0014 (N-02) — sync with `npm run db:push` or apply the raw drizzle/00*.sql, then re-check."
          : undefined,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        hint: "Database may be unreachable, or AUTH_SECRET/DATABASE_URL missing.",
      },
      { status: 500 },
    );
  }
}
