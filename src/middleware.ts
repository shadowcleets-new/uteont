/**
 * Edge middleware — combines NextAuth session check (via authConfig)
 * with the existing Bearer/secret-header checks for worker, cron, and
 * Telegram webhook routes.
 *
 * Service routes (handled FIRST so they bypass session redirect):
 *   - /api/jobs/*           → requires `Authorization: Bearer <WORKER_SHARED_SECRET>`
 *   - /api/cron/*           → requires `Authorization: Bearer <CRON_SECRET>` (Vercel sets this)
 *   - /api/telegram/webhook → requires `X-Telegram-Bot-Api-Secret-Token` match
 *
 * Public routes (no auth, no redirect):
 *   - /login, /api/auth/*, /api/health
 *
 * Everything else: requires a NextAuth session, else redirect to /login.
 */

import NextAuth from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "@/auth.config";

const { auth: nextAuth } = NextAuth(authConfig);

function unauthorized(reason: string) {
  return NextResponse.json({ error: "unauthorized", reason }, { status: 401 });
}

function checkServiceAuth(req: NextRequest): NextResponse | null {
  const path = req.nextUrl.pathname;

  if (path.startsWith("/api/jobs")) {
    const expected = process.env.WORKER_SHARED_SECRET;
    if (!expected) return unauthorized("WORKER_SHARED_SECRET not configured");
    if (req.headers.get("authorization") !== `Bearer ${expected}`) {
      return unauthorized("worker token mismatch");
    }
    return NextResponse.next();
  }

  if (path.startsWith("/api/cron")) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return unauthorized("CRON_SECRET not configured");
    if (req.headers.get("authorization") !== `Bearer ${expected}`) {
      return unauthorized("cron token mismatch");
    }
    return NextResponse.next();
  }

  if (path.startsWith("/api/telegram")) {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!expected) return unauthorized("TELEGRAM_WEBHOOK_SECRET not configured");
    if (req.headers.get("x-telegram-bot-api-secret-token") !== expected) {
      return unauthorized("telegram secret mismatch");
    }
    return NextResponse.next();
  }

  return null;
}

export default nextAuth((req) => {
  // 1. Service routes first (bypass session-based redirect).
  const serviceResponse = checkServiceAuth(req);
  if (serviceResponse) return serviceResponse;

  // 2. authorized() in auth.config returned false → NextAuth redirects to /login.
  //    Returning NextResponse.next() here lets the session-based logic run.
  return NextResponse.next();
});

export const config = {
  // Run on everything except Next static assets + favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)"],
};
