import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { auth } from "@/auth";

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

  const EXPECTED_TABLES = [
    "agent_state",
    "approvals",
    "articles",
    "auth_config",
    "conversations",
    "cycles",
    "ideas",
    "jobs",
    "keywords",
    "kv_settings",
    "login_attempts",
    "messages",
    "notifications",
    "result_cache",
    "runs",
    "site_integrations",
    "sites",
  ];

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
          ? "Run `npm run db:migrate` locally to apply pending migrations."
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
