/**
 * Edge middleware — authenticates worker, telegram, and cron callers.
 *
 * User-facing routes are NOT protected by app-level auth in v1. Rely
 * on Vercel deployment protection / private deploy / network limits.
 *
 * - /api/jobs/*          → requires `Authorization: Bearer <WORKER_SHARED_SECRET>`
 * - /api/cron/*          → requires `Authorization: Bearer <CRON_SECRET>` (Vercel sets this)
 * - /api/telegram/webhook → requires `X-Telegram-Bot-Api-Secret-Token` header match
 */

import { NextResponse, type NextRequest } from "next/server";

export const config = {
  matcher: ["/api/jobs/:path*", "/api/cron/:path*", "/api/telegram/:path*"],
};

function unauthorized(reason: string) {
  return NextResponse.json({ error: "unauthorized", reason }, { status: 401 });
}

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Workers
  if (path.startsWith("/api/jobs")) {
    const expected = process.env.WORKER_SHARED_SECRET;
    if (!expected) return unauthorized("WORKER_SHARED_SECRET not configured");
    const got = req.headers.get("authorization");
    if (got !== `Bearer ${expected}`) return unauthorized("worker token mismatch");
    return NextResponse.next();
  }

  // Vercel cron
  if (path.startsWith("/api/cron")) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return unauthorized("CRON_SECRET not configured");
    const got = req.headers.get("authorization");
    if (got !== `Bearer ${expected}`) return unauthorized("cron token mismatch");
    return NextResponse.next();
  }

  // Telegram
  if (path.startsWith("/api/telegram")) {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!expected) return unauthorized("TELEGRAM_WEBHOOK_SECRET not configured");
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== expected) return unauthorized("telegram secret mismatch");
    return NextResponse.next();
  }

  return NextResponse.next();
}
