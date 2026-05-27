import type { NextConfig } from "next";

/**
 * Security headers applied to every response.
 *
 * - HSTS: explicit so future host changes can't accidentally drop it. preload-ready.
 * - CSP: tight by default; allows inline styles (needed by Next.js' style hydration)
 *   and the Google sign-in OAuth pop-up + Telegram link previews.
 * - X-Frame-Options: clickjacking defense.
 * - Referrer-Policy: strict-origin-when-cross-origin = leaks nothing extra.
 * - X-Content-Type-Options: nosniff = prevents MIME confusion attacks.
 * - Permissions-Policy: disables every powerful API the app doesn't use.
 */
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // 'unsafe-inline' needed for Next.js hydration scripts
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.telegram.org https://generativelanguage.googleapis.com",
  "frame-src https://accounts.google.com",
  "form-action 'self' https://accounts.google.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Content-Security-Policy", value: CSP_DIRECTIVES },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
