/**
 * Edge-safe NextAuth config — used by middleware.ts (Edge runtime).
 * Providers are intentionally omitted here; they live in auth.ts (Node).
 *
 * This file only defines:
 *   - session strategy (JWT, so middleware can verify without DB)
 *   - pages (so unauthenticated requests redirect to /login)
 *   - authorized callback (used by middleware to decide route access)
 */

import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  providers: [],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const pathname = request.nextUrl.pathname;

      // Public paths — never require auth
      const publicPaths = [
        "/login",
        "/api/auth", // NextAuth endpoints
        "/api/health",
        "/api/jobs", // worker — middleware enforces Bearer
        "/api/cron", // Vercel cron — middleware enforces Bearer
        "/api/telegram", // Telegram webhook — middleware enforces secret header
      ];
      if (publicPaths.some((p) => pathname.startsWith(p))) return true;

      // Everything else: must be logged in
      if (isLoggedIn) return true;

      // Returning false from authorized triggers a redirect to signIn page
      return false;
    },
  },
} satisfies NextAuthConfig;
