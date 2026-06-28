/**
 * Full NextAuth config — used by server (API routes, server components).
 * Composes auth.config.ts (edge-safe) with the Node-only providers.
 */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { authConfig } from "./auth.config";
import {
  verifyCredentials,
  isGoogleEmailAllowed,
} from "@/lib/services/auth-config";

const hasGoogle = !!(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    ...(hasGoogle
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            // If GOOGLE_HOSTED_DOMAIN is set, the OAuth consent screen
            // is restricted to accounts in that domain. For consumer
            // @gmail.com accounts leave it unset (allowlist still
            // enforces the single-email rule in signIn callback).
            ...(process.env.GOOGLE_HOSTED_DOMAIN
              ? {
                  authorization: {
                    params: { hd: process.env.GOOGLE_HOSTED_DOMAIN },
                  },
                }
              : {}),
          }),
        ]
      : []),
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        const username = String(creds?.username ?? "");
        const password = String(creds?.password ?? "");
        if (!username || !password) return null;

        // F-009 + F-010 + N-10: rate-limit + audit.
        // Lazy imports to keep the module Edge-compatible at the top level.
        const { isLockedOut, recordAttempt } = await import(
          "@/lib/services/login-attempts"
        );

        // N-10: verify credentials FIRST. A *correct* password must never be
        // blocked by the lockout — otherwise an attacker flooding wrong
        // passwords could lock the sole operator out indefinitely (a DoS).
        // The lockout exists only to throttle *failed* attempts.
        const ok = await verifyCredentials(username, password);

        if (ok) {
          // Success forgives/clears the window (see isLockedOut).
          await recordAttempt(username, true);
          return {
            id: "admin",
            name: username,
            email: null,
          };
        }

        // Wrong password. If already locked out, do NOT record another
        // failure — that would self-amplify the lockout forever. Just
        // reject. Otherwise record the failure so the threshold can trip.
        if (await isLockedOut()) {
          // Generic CredentialsSignin error — don't reveal the rate limit.
          return null;
        }

        await recordAttempt(username, false);
        return null;
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      // Credentials provider — authorize() already validated
      if (account?.provider === "credentials") return true;

      // Google provider — enforce single-email allowlist
      if (account?.provider === "google") {
        const incoming =
          (profile?.email as string | undefined) ??
          (user?.email as string | undefined) ??
          null;
        const allowed = await isGoogleEmailAllowed(incoming);
        if (!allowed) {
          console.warn(
            `[auth] Google sign-in DENIED for ${incoming} — not on allowlist`,
          );
        }
        return allowed;
      }
      return false;
    },
    async jwt({ token, user }) {
      if (user) {
        token.name = user.name ?? token.name;
        token.email = user.email ?? token.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.name = (token.name as string) ?? session.user.name;
        session.user.email = (token.email as string) ?? session.user.email;
      }
      return session;
    },
  },
});
