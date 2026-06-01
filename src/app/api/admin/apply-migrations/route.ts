import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/lib/db/client";

/**
 * One-shot, idempotent applier for additive migrations that were generated while
 * the DB was unreachable from the dev/agent environment. Runs on Vercel (which
 * CAN reach Neon). Auth-gated to the operator session; every statement is
 * IF NOT EXISTS so re-running is a no-op. Covers migrations 0008 (checkpoints)
 * + 0009 (decision_records).
 *
 * Visit while logged in: /api/admin/apply-migrations
 */
const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "checkpoints" (
     "id" serial PRIMARY KEY NOT NULL,
     "site_id" integer REFERENCES "public"."sites"("id") ON DELETE cascade,
     "gate" text NOT NULL,
     "title" text NOT NULL,
     "summary" text,
     "payload" jsonb,
     "blast_radius" integer DEFAULT 0 NOT NULL,
     "status" text DEFAULT 'pending' NOT NULL,
     "decision" text,
     "note" text,
     "decided_by" text,
     "created_at" timestamp with time zone DEFAULT now() NOT NULL,
     "decided_at" timestamp with time zone
   )`,
  `CREATE INDEX IF NOT EXISTS "checkpoints_status_idx" ON "checkpoints" USING btree ("status")`,
  `CREATE INDEX IF NOT EXISTS "checkpoints_site_idx" ON "checkpoints" USING btree ("site_id")`,
  `CREATE TABLE IF NOT EXISTS "decision_records" (
     "id" serial PRIMARY KEY NOT NULL,
     "site_id" integer REFERENCES "public"."sites"("id") ON DELETE cascade,
     "subject_key" text NOT NULL,
     "kind" text NOT NULL,
     "title" text NOT NULL,
     "rationale" text,
     "confidence" real,
     "evidence" jsonb,
     "inputs" jsonb,
     "run_id" integer,
     "created_at" timestamp with time zone DEFAULT now() NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS "decision_records_kind_idx" ON "decision_records" USING btree ("kind")`,
  `CREATE INDEX IF NOT EXISTS "decision_records_site_idx" ON "decision_records" USING btree ("site_id")`,
];

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getDb();
  const applied: string[] = [];
  const errors: Array<{ stmt: string; error: string }> = [];
  for (const stmt of STATEMENTS) {
    const label = stmt.slice(0, 64).replace(/\s+/g, " ");
    try {
      await db.execute(sql.raw(stmt));
      applied.push(label);
    } catch (e) {
      errors.push({ stmt: label, error: e instanceof Error ? e.message : String(e) });
    }
  }

  let tablesPresent: Record<string, boolean> = {};
  try {
    const r = (await db.execute(
      sql.raw("SELECT to_regclass('public.checkpoints') AS c, to_regclass('public.decision_records') AS d"),
    )) as unknown as { rows?: Array<{ c: unknown; d: unknown }> } | Array<{ c: unknown; d: unknown }>;
    const row = Array.isArray(r) ? r[0] : r.rows?.[0];
    tablesPresent = { checkpoints: Boolean(row?.c), decision_records: Boolean(row?.d) };
  } catch {
    /* verification is best-effort */
  }

  return NextResponse.json({ ok: errors.length === 0, applied, errors, tablesPresent });
}
