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
import { safeEqualDigest } from "@/lib/crypto/digest-equal";

const { auth: nextAuth } = NextAuth(authConfig);

function unauthorized(reason: string) {
  return NextResponse.json({ error: "unauthorized", reason }, { status: 401 });
}

async function checkServiceAuth(req: NextRequest): Promise<NextResponse | null> {
  const path = req.nextUrl.pathname;

  // A-08: secret comparisons use safeEqualDigest — constant-time AND
  // length-independent (it compares fixed-size SHA-256 digests, so the timing
  // never leaks the secret's length the way a char-by-char scan does).
  if (path.startsWith("/api/jobs")) {
    const expected = process.env.WORKER_SHARED_SECRET;
    if (!expected) return unauthorized("WORKER_SHARED_SECRET not configured");
    if (!(await safeEqualDigest(req.headers.get("authorization"), `Bearer ${expected}`))) {
      return unauthorized("worker token mismatch");
    }
    return NextResponse.next();
  }

  if (path.startsWith("/api/cron")) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return unauthorized("CRON_SECRET not configured");
    if (!(await safeEqualDigest(req.headers.get("authorization"), `Bearer ${expected}`))) {
      return unauthorized("cron token mismatch");
    }
    return NextResponse.next();
  }

  if (path.startsWith("/api/telegram")) {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!expected) return unauthorized("TELEGRAM_WEBHOOK_SECRET not configured");
    if (!(await safeEqualDigest(req.headers.get("x-telegram-bot-api-secret-token"), expected))) {
      return unauthorized("telegram secret mismatch");
    }
    return NextResponse.next();
  }

  return null;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * A-09: CSRF defense-in-depth. Reject state-changing requests that are clearly
 * cross-site — either an Origin whose host differs from the request host, or a
 * Sec-Fetch-Site of cross-site. NextAuth's own endpoints are exempt (they
 * legitimately receive cross-site form posts during the OAuth dance). This
 * backstops the SameSite session cookie so a future cookie-attribute change
 * can't silently open every mutating route to CSRF.
 */
function isCrossSiteWrite(req: NextRequest): boolean {
  if (SAFE_METHODS.has(req.method)) return false;
  if (req.nextUrl.pathname.startsWith("/api/auth")) return false;

  const secFetchSite = req.headers.get("sec-fetch-site");
  if (secFetchSite === "cross-site") return true;

  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.nextUrl.host) return true;
      return false; // Origin present and same-host → trusted same-origin write
    } catch {
      return true; // unparseable Origin on a write → treat as hostile
    }
  }

  // Neither an affirmative same-origin Sec-Fetch-Site nor a matching Origin.
  // A real same-origin browser write always sends at least one (modern browsers
  // always set Sec-Fetch-Site; form/fetch POSTs set Origin). Their absence means
  // a non-browser/forged caller — reject as a write we can't verify. Service
  // routes (worker/cron/telegram) are already handled before this check.
  if (secFetchSite === "same-origin" || secFetchSite === "none") return false;
  return true;
}

const PUBLIC_PATHS = [
  "/login",
  "/setup",   // F-016: one-time password URL flow (token-protected in the page itself)
  "/api/auth", // NextAuth endpoints (signin, callback, csrf, ...)
  "/api/health",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export default nextAuth(async (req) => {
  const pathname = req.nextUrl.pathname;

  // 1. Service routes first — they have their own auth (Bearer / secret header)
  //    and legitimately arrive cross-site (worker/cron/telegram), so they must
  //    be checked before the CSRF gate below.
  const serviceResponse = await checkServiceAuth(req);
  if (serviceResponse) return serviceResponse;

  // 2. A-09: reject cross-site state-changing requests (CSRF defense-in-depth).
  if (isCrossSiteWrite(req)) {
    return NextResponse.json({ error: "forbidden", reason: "cross-site write" }, { status: 403 });
  }

  // 3. Public paths — no auth required.
  if (isPublic(pathname)) return NextResponse.next();

  // 3. Everything else requires a NextAuth session.
  //    req.auth is populated by the nextAuth() wrapper from the JWT cookie.
  if (req.auth?.user) return NextResponse.next();

  // 4. Not logged in → redirect to clean /login URL (no `next` param, to
  //    avoid leaking the intended route in the address bar).
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  return NextResponse.redirect(loginUrl);
});

export const config = {
  // Run on everything except Next static assets + favicon, AND except
  // /api/auth/* — NextAuth's own routes must NOT pass through the auth()
  // wrapper, which re-issues (rolls) the session cookie on every request.
  // On /api/auth/signout that re-issue overrode the route handler's
  // cookie-clear, so signing out then refreshing logged the user back in.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)"],
};
