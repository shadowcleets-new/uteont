import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

export async function GET() {
  const status: Record<string, unknown> = {
    ok: true,
    service: "uteont",
    timestamp: new Date().toISOString(),
    env: {
      databaseUrl:           !!process.env.DATABASE_URL,
      workerSharedSecret:    !!process.env.WORKER_SHARED_SECRET,
      cronSecret:            !!process.env.CRON_SECRET,
      telegramBotToken:      !!process.env.TELEGRAM_BOT_TOKEN,
      telegramWebhookSecret: !!process.env.TELEGRAM_WEBHOOK_SECRET,
    },
    db: { reachable: false },
  };
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    (status.db as Record<string, unknown>).reachable = true;
  } catch (e: unknown) {
    (status.db as Record<string, unknown>).reachable = false;
    (status.db as Record<string, unknown>).error = e instanceof Error ? e.message : String(e);
    status.ok = false;
  }
  return NextResponse.json(status);
}
