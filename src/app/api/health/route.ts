import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/lib/db/client";

/**
 * Public health endpoint (F-018).
 *
 * Anonymous response: minimal — only what monitoring needs.
 * Authenticated response: full diagnostics including which env vars are set.
 *
 * Public response fields are deliberately small so anonymous probes
 * can't map the stack from this endpoint.
 */
export async function GET() {
  const session = await auth().catch(() => null);
  const isAuthed = !!session?.user;

  let dbReachable = false;
  let dbError: string | undefined;
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    dbReachable = true;
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  // Public: just enough for uptime monitors.
  if (!isAuthed) {
    return NextResponse.json({
      ok: dbReachable,
      service: "uteont",
      timestamp: new Date().toISOString(),
    });
  }

  // Authenticated: full diagnostic.
  return NextResponse.json({
    ok: dbReachable,
    service: "uteont",
    timestamp: new Date().toISOString(),
    env: {
      databaseUrl:           !!process.env.DATABASE_URL,
      authSecret:            !!process.env.AUTH_SECRET,
      workerSharedSecret:    !!process.env.WORKER_SHARED_SECRET,
      cronSecret:            !!process.env.CRON_SECRET,
      telegramBotToken:      !!process.env.TELEGRAM_BOT_TOKEN,
      telegramWebhookSecret: !!process.env.TELEGRAM_WEBHOOK_SECRET,
      telegramChatId:        !!process.env.TELEGRAM_CHAT_ID,
      googleClientId:        !!process.env.GOOGLE_CLIENT_ID,
      googleClientSecret:    !!process.env.GOOGLE_CLIENT_SECRET,
      geminiApiKey:          !!process.env.GEMINI_API_KEY,
    },
    db: { reachable: dbReachable, ...(dbError ? { error: dbError } : {}) },
  });
}
