import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * One-time, auth-gated trigger for migration 0010 (conversations.summary +
 * summary_up_to_id) — for when Neon is reachable from Vercel but not from the
 * dev sandbox. Idempotent (ADD COLUMN IF NOT EXISTS): safe to hit more than once.
 * Visit it in a browser while signed in. Remove after the columns exist.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "unauthorized — sign in to UTEONT first, then reload this URL" }, { status: 401 });
  }
  try {
    const db = getDb();
    await db.execute(sql`ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "summary" text`);
    await db.execute(sql`ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "summary_up_to_id" integer NOT NULL DEFAULT 0`);
    return NextResponse.json({
      ok: true,
      migration: "0010_director_summary",
      message: "Applied. conversations.summary + summary_up_to_id now exist — the chat-memory deploy is safe to ship.",
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
