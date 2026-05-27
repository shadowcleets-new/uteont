# UTEONT — Gaps & Issues Report

**A holistic audit of every known gap, bug, and risk in the codebase + deployment.**

## Update policy

> This document is **append-only and human-controlled**. Claude must not
> modify it autonomously. Updates only when the operator explicitly says
> *"update the gaps report"* — and even then, prefer adding new findings
> over rewriting existing ones (preserve audit history).
>
> When a finding is fixed, change its **Status** from `OPEN` to
> `FIXED (commit-sha)`, but leave the description intact.

## How to read

| Severity | Meaning |
|---|---|
| 🔴 **Critical** | Active vector for compromise or data loss. Fix immediately. |
| 🟠 **High** | Realistic attack path or significant user harm. Fix this week. |
| 🟡 **Medium** | Defense-in-depth gap, real but not yet exploitable. Fix this month. |
| 🟢 **Low** | Polish or hardening. Fix when convenient. |
| 🔵 **Info** | Worth knowing about; no fix required. |

| Status | Meaning |
|---|---|
| **OPEN** | Not yet addressed. |
| **FIXED** *(sha)* | Mitigated in the listed commit. |
| **ACK** | Acknowledged, accepted as residual risk for v1. |
| **WONT-FIX** | Out of scope or by-design. |

Findings are grouped by domain, then sorted by severity descending.

---

## Index

| ID | Title | Domain | Severity | Status |
|---|---|---|---|---|
| F-001 | Sidebar nav rendered on unauthenticated `/login` | Privacy | 🟠 | FIXED (this turn) |
| F-002 | "Google sign-in not yet configured" leaked operational state | Privacy | 🟢 | FIXED (this turn) |
| F-003 | "Credentials managed via Telegram bot" footer leaked architecture | Privacy | 🟢 | FIXED (this turn) |
| F-004 | `?next=<path>` in redirect URL exposed intended route | Privacy | 🟢 | FIXED (this turn) |
| F-005 | No logout button — sessions had to be cleared via cookies | UX | 🟡 | FIXED (this turn) |
| F-006 | Telegram bot token visible in this conversation history | Security | 🟠 | ACK (rotate again if shared) |
| F-007 | `WORKER_SHARED_SECRET` visible in this conversation history | Security | 🟠 | ACK |
| F-008 | `GEMINI_API_KEY` visible in this conversation history | Security | 🟡 | ACK (revoke + reissue if shared) |
| F-009 | No rate limiting on `/api/auth/*` (credential brute force) | Security | 🟠 | OPEN |
| F-010 | No login attempt logging or alerts | Security | 🟡 | OPEN |
| F-011 | Password policy is length-only (no complexity required) | Security | 🟢 | OPEN |
| F-012 | Telegram admin gate trusts single env var `TELEGRAM_CHAT_ID` | Security | 🟡 | OPEN |
| F-013 | bcryptjs cost factor 10 — industry now suggests 12+ | Security | 🟢 | OPEN |
| F-014 | No Content-Security-Policy headers | Security | 🟡 | OPEN |
| F-015 | No HSTS / preload declared (Vercel default covers some) | Security | 🟢 | OPEN |
| F-016 | `/setpassword <pw>` sends password plaintext over Telegram chat | Privacy | 🟠 | ACK (single-user, see fix recipe below) |
| F-017 | `AUTH_SECRET` set only in production env, missing preview/dev | Security | 🟡 | OPEN |
| F-018 | `/api/health` reveals which env vars are set | Privacy | 🟢 | OPEN |
| F-019 | Login page `<title>` reveals product name to scanners | Privacy | 🔵 | ACK |
| F-020 | Several `try/catch { return null }` blocks swallow errors silently | Code Quality | 🟡 | OPEN |
| F-021 | No automated tests anywhere in the repo | Code Quality | 🟠 | OPEN |
| F-022 | Inline arbitrary Tailwind values (`bg-[#d97757]`) scattered — should be tokens | Code Quality | 🟢 | OPEN |
| F-023 | `NEXT_PUBLIC_APP_URL` hardcoded fallback won't update with custom domain | Code Quality | 🟢 | OPEN |
| F-024 | Worker has no `/health` endpoint — silent death possible | Operations | 🟡 | OPEN |
| F-025 | Job retry uses fixed attempt cap, no exponential backoff | Operations | 🟢 | OPEN |
| F-026 | No backup-restore drill for Neon | Operations | 🟡 | OPEN |
| F-027 | Worker job `result` JSON accumulates indefinitely in `jobs` table | Operations | 🟢 | OPEN |
| F-028 | Telegram notification on failure is best-effort — no retry on send failure | Operations | 🟢 | OPEN |
| F-029 | NextAuth Google provider has no `hd` (hosted-domain) hint | Security | 🟢 | OPEN |
| F-030 | Build emits many `LF will be replaced by CRLF` warnings on Windows | Code Quality | 🔵 | ACK |

---

## Findings

### F-001 — Sidebar nav rendered on unauthenticated `/login`

**Domain:** Privacy · **Severity:** 🟠 High · **Status:** FIXED (this turn)

**Description.** Anyone hitting `https://uteont.vercel.app/login` saw the full sidebar with all 10 agent names, the DATA / Keywords / Runs / Export section, Settings, and the product wordmark. No session required to see this structure. Visible to anyone who knew the URL and to search-engine crawlers.

**Root cause.** The root `app/layout.tsx` unconditionally wrapped every page (including `/login`) with `<Sidebar />`. The layout had no awareness of session state.

**How it appeared.** Standard Next.js App Router pattern — one root layout for everything. The `/login` page was added later but inherited the existing shell. Easy mistake when login is a late-add to an established codebase.

**Impact.** Reveals product topology, agent terminology, and feature surface to anonymous visitors. Modest direct risk; useful intel for a targeted attacker, and embarrassing if competitors land on it.

**Fix applied.** `app/layout.tsx` now `await auth()` server-side and conditionally renders the sidebar only when `session?.user` is present. Unauthenticated requests see just `{children}` on the cream background — that's just the login form.

**Prevention going forward.**
- Whenever a public/unauthenticated page is added, write a smoke test that fetches it as anonymous and asserts no sensitive markup is present (no `<aside>`, no agent names).
- Consider Next.js *route groups* (e.g. `app/(authed)/`) to physically separate authed vs anonymous layouts so this can't happen by accident.

---

### F-002 — "Google sign-in not yet configured" leaked operational state

**Domain:** Privacy · **Severity:** 🟢 Low · **Status:** FIXED (this turn)

**Description.** The login form rendered an italic info banner that said *"Google sign-in not yet configured. Use the password form below."* — telling visitors which auth providers exist and which are still pending.

**Root cause.** Defensive UX. I wanted to gracefully degrade if `GOOGLE_CLIENT_ID` was absent. Made the degraded state too talkative.

**Impact.** Tells an attacker the system is in a half-configured state (often the most vulnerable phase) and that there's a primary alternative auth path. Low direct risk; bad hygiene.

**Fix applied.** The conditional now just hides the Google button block entirely when not configured. Username/password form looks identical whether Google is on or off.

**Prevention.** Default to *invisible* when a feature is disabled. Don't narrate missing functionality on pre-auth surfaces.

---

### F-003 — "Credentials managed via Telegram bot" footer leaked architecture

**Domain:** Privacy · **Severity:** 🟢 Low · **Status:** FIXED (this turn)

**Description.** Tiny italic footer on `/login`: *"Single-user system. Credentials managed via Telegram bot."* This handed an attacker a useful piece of architecture (the auth path goes via Telegram → DB).

**Root cause.** Premature documentation in the UI. Helpful for the operator, terrible for security posture.

**Impact.** Tells an attacker the high-leverage compromise is the Telegram channel, not the website. Steers them toward bot-token exfiltration. Low standalone risk; multiplier in combination with F-006.

**Fix applied.** Removed entirely.

**Prevention.** Operator-facing docs go in README/admin docs, never the user-facing UI. Public-facing UI says only what an end-user needs.

---

### F-004 — `?next=<path>` in redirect URL exposed intended route

**Domain:** Privacy · **Severity:** 🟢 Low · **Status:** FIXED (this turn)

**Description.** When middleware redirected `/agents/research` (or any protected route) to `/login`, it appended `?next=%2Fagents%2Fresearch`. Anyone who saw the address bar after a redirect could see what route they were trying to reach — which leaks the existence of `/agents/research`, `/keywords`, etc. as paths.

**Root cause.** Industry-standard UX pattern (return user to original page after login). Implemented without considering the info-leak side effect for a private/single-user app.

**Impact.** Reveals the protected route structure to anyone who notices the URL. Trivial reconnaissance value.

**Fix applied.** Middleware now strips the search string entirely before redirecting: `loginUrl.search = ""`. After login, user always lands on `/` and can navigate from the dashboard.

**Trade-off.** Loses the "return to where I was" UX. Acceptable for a single-user system where there are <10 pages total.

**Prevention.** Store the next-URL in an httponly cookie if the UX is needed back later. Never expose state machine details in the URL bar.

---

### F-005 — No logout button anywhere

**Domain:** UX · **Severity:** 🟡 Medium · **Status:** FIXED (this turn)

**Description.** After logging in there was no way to sign out from the UI. You'd have to clear cookies manually or wait for the JWT to expire.

**Root cause.** Implementation scope creep — auth was big, logout was deferred and forgotten.

**Impact.** Operator inconvenience. On a shared device this is a real risk: walking away leaves the session live.

**Fix applied.** "Sign out" button added at the bottom of the sidebar (below all nav sections). Uses NextAuth `signOut({ redirectTo: "/login" })` via a server action. Hover state in error red (`#a33b2b`) so it's not easy to mis-click.

**Prevention.** Auth implementation checklist: sign-in form, session callback, **sign-out trigger** — all three needed before claiming auth is done.

---

### F-006 — Telegram bot token visible in this conversation history

**Domain:** Security · **Severity:** 🟠 High · **Status:** ACK

**Description.** During development the bot token was pasted in chat (twice — original and after `/revoke`). The current token, `<TELEGRAM_BOT_TOKEN_REDACTED>`, is in the chat history. Anyone with read access to this transcript can take over the bot.

**Root cause.** Necessary at the time — the operator needed to share the token so the LLM could set up the integration. No alternative channel was available.

**How attackable.** Anyone with the token can:
- Read all messages sent to the bot (including the operator's `/setpassword` commands)
- Send messages to all known chat IDs
- Set the webhook to a malicious URL and intercept all updates

**Mitigations in place.**
- Webhook secret means our `/api/telegram/webhook` endpoint won't accept malicious traffic.
- `TELEGRAM_CHAT_ID` admin gate prevents anyone else from running `/setpassword` even if they have the token (they'd need the matching chat to be 455633561, which is the operator's chat).

**Recommended fix.** Rotate again via `/revoke` after this conversation is no longer needed for diagnostics. Update Vercel `TELEGRAM_BOT_TOKEN`, re-register webhook with new token.

**Prevention going forward.**
- Treat any conversation with the LLM as potentially compromised storage. Never paste live secrets; instead share write-only handles (the operator runs the CLI command, only shares the success/failure result).
- Use Vercel CLI / dashboard for secret rotation, not chat.

---

### F-007 — `WORKER_SHARED_SECRET` visible in conversation history

**Domain:** Security · **Severity:** 🟠 High · **Status:** ACK

**Description.** Two `WORKER_SHARED_SECRET` values have appeared in this chat: `<WORKER_SECRET_REDACTED>` (rotated out) and `<WORKER_SECRET_REDACTED>` (currently live). Anyone with the current value can call `/api/jobs/claim` and impersonate the worker.

**Impact of compromise.** An attacker holding this secret can:
- Claim jobs the real worker would have run, returning fake results that get persisted into the DB (e.g., poison the keyword pipeline).
- Mark all jobs as failed and disrupt operations.
- Drain DB connection pool by claiming jobs in a tight loop.

Cannot directly access the DB, cannot read other secrets, cannot exfil credentials.

**Recommended fix.** Rotate the secret again after this conversation is archived. Update both Vercel and Railway.

**Prevention.** Same as F-006: never paste secrets into LLM chats. Use a paste-from-clipboard pattern or share a write-only setup link.

---

### F-008 — `GEMINI_API_KEY` visible in conversation history

**Domain:** Security · **Severity:** 🟡 Medium · **Status:** ACK

**Description.** The Gemini API key `<GEMINI_API_KEY_REDACTED>` is in chat (was pasted as part of a cURL test). Anyone with it can burn the operator's free-tier quota or rack up paid usage if quota is raised.

**Impact.** Financial risk capped by Google's free-tier limits (1500 req/day on Flash). Worst case: someone runs a content-generation farm against the key until rate limits or quota stops them.

**Recommended fix.** Revoke at https://aistudio.google.com/app/apikey, create a new key, swap in Railway env. Free + 2-minute operation.

**Prevention.** Same as F-006/F-007.

---

### F-009 — No rate limiting on `/api/auth/*` (credential brute force)

**Domain:** Security · **Severity:** 🟠 High · **Status:** OPEN

**Description.** The username/password login endpoint has no rate limit. An attacker can hit `/api/auth/callback/credentials` thousands of times per second and brute-force the password.

**How attackable.** With an 8-char password (current minimum), the search space is ~10^15 for printable ASCII. bcrypt at cost 10 is ~100ms per attempt on commodity hardware, but Vercel's serverless layer doesn't impose per-IP throttling for unauthenticated POSTs.

**Practical risk.** Low if password is strong (16+ chars random). High if a weak password is chosen. The current `/setpassword` Telegram command enforces only ≥8 chars (see F-011).

**Prevention.**
- **Application-level**: track failed login attempts per-username in a table, return 429 after N failures within a window.
- **Edge-level**: Vercel WAF (Pro plan) or Cloudflare in front of Vercel.
- **Cryptographic**: bump bcrypt cost to 12+ (see F-013) — each guess costs ~400ms instead of ~100ms.

**Mitigation today.** Pick a 20+ character random password and treat it as good enough until a rate-limiter ships.

---

### F-010 — No login attempt logging or alerts

**Domain:** Security · **Severity:** 🟡 Medium · **Status:** OPEN

**Description.** Failed (and successful) login attempts go nowhere — no DB row, no Telegram alert, nothing in Vercel logs at the application level.

**Impact.** Brute-force attempts are invisible. The operator wouldn't know they're under attack until the attacker succeeded.

**Prevention.**
- Insert a row into a `login_attempts` table on every authorize() call (success or fail).
- Cron job hourly: if N+ failures in last hour from a single IP, send Telegram alert.
- Bonus: if an unfamiliar IP succeeds, alert the operator immediately.

---

### F-011 — Password policy is length-only

**Domain:** Security · **Severity:** 🟢 Low · **Status:** OPEN

**Description.** `setPassword()` requires only `password.length >= 8`. A password like `aaaaaaaa` would be accepted.

**Impact.** Inversely depends on operator discipline. If they pick a strong password, no issue. If they pick `password123`, F-009 becomes immediately dangerous.

**Prevention.** Enforce in `setPassword()`:
- Minimum 12 chars
- At least one uppercase, one lowercase, one digit, one symbol
- Reject against the [HaveIBeenPwned top 1000](https://haveibeenpwned.com/Passwords) list (zxcvbn library)

---

### F-012 — Telegram admin gate trusts single env var

**Domain:** Security · **Severity:** 🟡 Medium · **Status:** OPEN

**Description.** Admin commands (`/setuser`, `/setpassword`, etc.) check `chatId === process.env.TELEGRAM_CHAT_ID`. If an attacker compromises Vercel env (e.g., via a leaked Vercel token), they can set `TELEGRAM_CHAT_ID` to their own chat ID and then run admin commands at will.

**Impact.** Requires Vercel-level access first. Probably unrealistic, but defense-in-depth fails here.

**Prevention.** Store the admin chat ID(s) in the `auth_config` DB table, not env. Set initially via a `/bootstrap <secret>` flow where the secret is a one-time token written to a file or env var that's then deleted.

---

### F-013 — bcryptjs cost factor 10

**Domain:** Security · **Severity:** 🟢 Low · **Status:** OPEN

**Description.** Password hashing uses bcryptjs at default cost 10 (~100ms on modern CPUs). OWASP currently recommends 12+ for bcrypt as of 2025.

**Impact.** F-009 brute-force is ~4x faster than it would be at cost 12.

**Prevention.** Change to `bcrypt.hash(pw, 12)` in `setPassword()`. Existing hash continues to work for verification (bcrypt stores cost in the hash itself).

---

### F-014 — No Content-Security-Policy headers

**Domain:** Security · **Severity:** 🟡 Medium · **Status:** OPEN

**Description.** No CSP header set in `next.config.ts` or `vercel.json`. A reflected-XSS bug anywhere on the app could be exploited freely.

**Impact.** No known XSS vector today, but the lack of CSP turns any future XSS bug into a credential-theft event.

**Prevention.** Add CSP via Next.js headers config: `default-src 'self'; script-src 'self' 'unsafe-inline' apis.google.com; ...`. Start with report-only mode (`Content-Security-Policy-Report-Only`) for a week, then enforce.

---

### F-015 — HSTS not declared in next.config

**Domain:** Security · **Severity:** 🟢 Low · **Status:** OPEN

**Description.** Vercel automatically sets `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (verified via curl). However, the app itself doesn't declare HSTS in code, so a future hosting change could drop it silently.

**Prevention.** Make it explicit in `next.config.ts` headers so it survives migrations.

---

### F-016 — `/setpassword <pw>` sends password plaintext over Telegram

**Domain:** Privacy · **Severity:** 🟠 High · **Status:** ACK

**Description.** Sending `/setpassword Why@p@$$w0rdin%20260!` in Telegram means the password is plaintext in:
- The operator's Telegram chat history
- Telegram's servers (encrypted in transit but stored unencrypted at rest unless using Secret Chats)
- This LLM conversation transcript (the operator pasted a screenshot)
- The Vercel webhook handler's request logs (briefly, if logging is on)

The DB only stores the bcrypt hash, but the plaintext exists in transit until the hash is computed.

**How attackable.** Anyone who gets the operator's phone unlocked, or compromises their Telegram account, can scroll back and see every password ever set.

**Mitigation in place.** The bot reply to `/setpassword` includes the warning: *"⚠️ Recommend deleting this message — your password is in the chat history."*

**Prevention recipes.**
1. **Inline edit + delete pattern**: send a placeholder, edit it to the password, then delete after the bot replies. Telegram clients still leak this through cached messages, but it shrinks the window.
2. **One-time URL pattern**: command `/setpassword-link` generates a one-time URL like `https://uteont.vercel.app/setup/abc123` that opens a password form. URL is single-use, expires in 10 min. Password never enters the chat.
3. **Out-of-band**: `/genpassword` returns a strong random password that the operator copies into the login form. The plaintext still exists in chat history briefly but for predictable values only.

Recommendation: implement #2 in a future iteration.

---

### F-017 — `AUTH_SECRET` set only in production env

**Domain:** Security · **Severity:** 🟡 Medium · **Status:** OPEN

**Description.** `AUTH_SECRET` was added to Vercel production only (the CLI rejected `preview` and `development` due to team's Sensitive Environment Variables Policy).

**Impact.** Preview deployments (PR builds) and local dev (`vercel env pull`) will lack `AUTH_SECRET`. NextAuth will fail on those environments or generate a per-instance random key (which means JWTs from one preview don't validate on another).

**Practical risk.** Low for now — no team members, no preview deployments in regular use.

**Prevention.** Generate a separate `AUTH_SECRET` for dev/preview (not the production one) and add via `--sensitive false` if the team policy allows it. Or downgrade from sensitive.

---

### F-018 — `/api/health` reveals env-var existence

**Domain:** Privacy · **Severity:** 🟢 Low · **Status:** OPEN

**Description.** `/api/health` is intentionally public (so monitoring works) and returns:
```json
{
  "ok": true,
  "env": { "databaseUrl": true, "workerSharedSecret": true, "cronSecret": false, ... }
}
```

It reveals booleans for whether each env var is set. An attacker can map the stack (Postgres, worker subsystem, Telegram, cron) in one HTTP call.

**Impact.** Reconnaissance value, no direct vuln.

**Prevention.** Return only `{ ok, db_reachable, timestamp }` for the public endpoint. Move the env-var diagnostic to an authenticated `/api/admin/health` route that only the operator's session can see.

---

### F-019 — Login page `<title>` reveals product name

**Domain:** Privacy · **Severity:** 🔵 Info · **Status:** ACK

**Description.** `<title>Sign in — UTEONT</title>` on `/login` reveals the product name to scanners, search engines, and tab thumbnails.

**Impact.** Negligible — `uteont.vercel.app` already reveals the name in the URL. Listed for completeness.

**Acceptance rationale.** Product name being publicly visible is fine; this app is the operator's, no obligation to hide its existence. Recorded so future "stealth mode" iterations remember to change it.

---

### F-020 — Several `try/catch { return null }` blocks swallow errors

**Domain:** Code Quality · **Severity:** 🟡 Medium · **Status:** OPEN

**Description.** Functions like `getAgentStats()`, `getAllAgentStats()`, `getAuthConfig()`, and `listRuns(...)` wrap DB queries in `try { ... } catch { return [] /* or null */ }` — masking errors so the UI degrades gracefully.

**Impact.** A real DB outage (e.g., connection pool exhausted) renders as "no data yet" instead of an alert. The operator wouldn't know.

**Prevention.**
- Log the caught error to a structured logger (Vercel logs, Sentry, etc.) before returning the empty/null value.
- Surface a "data unavailable" banner in the UI when the catch path is hit (via a separate `error` state, not just empty).

---

### F-021 — No automated tests anywhere

**Domain:** Code Quality · **Severity:** 🟠 High · **Status:** OPEN

**Description.** The repo has zero test files. No unit tests for the deterministic agents (qa-agent, seo-agent), no integration tests for API routes, no E2E test for the login flow.

**Impact.** Regressions are caught by user reports, not CI. Every change is high-trust.

**Prevention.** Start with:
- Vitest for unit tests on `worker/agents/*` and `src/lib/services/*`
- Playwright for one E2E flow: open `/`, redirected to `/login`, sign in, see dashboard, sign out
- Add to CI on every PR

Realistic next step: cover the auth flow first since it gates everything.

---

### F-022 — Inline arbitrary Tailwind values scattered

**Domain:** Code Quality · **Severity:** 🟢 Low · **Status:** OPEN

**Description.** Brand colors like `#d97757` and `#141413` appear inline in dozens of `bg-[#xxx]` / `text-[#xxx]` / `border-[#xxx]` arbitrary values. Tokens exist in `src/lib/theme.ts` but aren't wired into Tailwind config.

**Impact.** A rebrand requires hunting through ~30 files. Tailwind theme should be the source of truth.

**Prevention.** Extend `tailwind.config.ts` with named colors:
```ts
colors: { brand: { dark: '#141413', accent: '#d97757', ... } }
```
Then `bg-[#d97757]` becomes `bg-brand-accent`. Refactor incrementally.

---

### F-023 — Hardcoded fallback `NEXT_PUBLIC_APP_URL`

**Domain:** Code Quality · **Severity:** 🟢 Low · **Status:** OPEN

**Description.** Telegram webhook handler uses `process.env.NEXT_PUBLIC_APP_URL ?? "https://uteont.vercel.app"`. If you ever move to a custom domain, every deep link in bot messages still points at the vercel.app subdomain unless the env var is explicitly set.

**Prevention.** Always set `NEXT_PUBLIC_APP_URL` in Vercel env. Remove the hardcoded fallback so the build fails loud if missing.

---

### F-024 — Worker has no `/health` endpoint

**Domain:** Operations · **Severity:** 🟡 Medium · **Status:** OPEN

**Description.** The Python worker polls and acts but exposes no HTTP endpoint. If it crashes or hangs (e.g., Gemini timeout, network split), Railway shows it as Active until the next deployment cycle. The operator only finds out when a queued job goes stale.

**Prevention.** Add a tiny HTTP server alongside the poller:
- `GET /health` returns 200 with last-poll timestamp + claimed-job count
- Railway can poll it as a health check + auto-restart on failure
- Add a Vercel cron that hits the worker's `/health` daily and alerts via Telegram if down

---

### F-025 — Fixed-attempt retry, no backoff

**Domain:** Operations · **Severity:** 🟢 Low · **Status:** OPEN

**Description.** Jobs retry up to `maxAttempts` (default 3) on the next poll cycle (~5 seconds later). No exponential backoff. A genuinely flaky downstream (e.g., Gemini overloaded) gets hammered.

**Prevention.** Exponential backoff: 1st retry after 5s, 2nd after 30s, 3rd after 2min. Set `scheduled_at` field, claim only jobs where `scheduled_at <= NOW()`.

---

### F-026 — No backup-restore drill for Neon

**Domain:** Operations · **Severity:** 🟡 Medium · **Status:** OPEN

**Description.** Neon offers Point-in-Time Recovery by default (free tier: 24 hours; paid: 7 days). I've never actually executed a restore to confirm it works for this DB.

**Impact.** A DROP TABLE in a bad migration would test the recovery flow under stress. Better to test now.

**Prevention.** Quarterly drill:
1. Create a Neon branch from a 1-hour-old PITR snapshot
2. Verify all tables + recent data are present
3. Document the time-to-recovery

---

### F-027 — `result` JSON accumulates indefinitely in `jobs`

**Domain:** Operations · **Severity:** 🟢 Low · **Status:** OPEN

**Description.** Every completed job stores its full result payload (including full keyword arrays, idea lists, article bodies) in `jobs.result` as JSONB. Nothing purges old rows.

**Impact.** After ~1000 content-writing runs, `jobs` table will be several hundred MB. Neon free tier is 0.5 GB total.

**Prevention.** Vercel cron weekly: delete `jobs` rows older than 30 days where `status='done'`. The runs/keywords/ideas/articles tables are the durable record; jobs is just the queue.

---

### F-028 — Failed Telegram notification has no retry

**Domain:** Operations · **Severity:** 🟢 Low · **Status:** OPEN

**Description.** If `sendMessage()` fails (Telegram outage, transient error), the notification is marked failed and never retried. The operator misses the alert.

**Prevention.** When marking a notification failed, also schedule a retry via the worker queue. Cap at 3 attempts.

---

### F-029 — NextAuth Google provider has no `hd` hint

**Domain:** Security · **Severity:** 🟢 Low · **Status:** OPEN

**Description.** When Google OAuth is configured, the consent screen accepts ANY Google account. The allowlist check happens after sign-in (signIn callback). Bad UX: a wrong-account user gets through Google's flow then sees "access denied".

**Prevention.** Set `authorization.params.hd` to restrict the OAuth consent screen to a specific Google Workspace domain (only works if operator's email is on Workspace, not gmail.com).

**Alternative.** Pre-filter at the login page: ask the operator's email-prefix once, store in localStorage, hint it in the Google flow.

---

### F-030 — Build emits `LF will be replaced by CRLF` warnings on Windows

**Domain:** Code Quality · **Severity:** 🔵 Info · **Status:** ACK

**Description.** Every `git commit` from the Windows dev machine warns about line-ending normalization. Files have LF in repo, get CRLF on checkout.

**Impact.** None functional. Visual noise.

**Acceptance.** `git config core.autocrlf true` is the Windows default. Recorded for completeness; could be silenced via `.gitattributes` with `* text=auto eol=lf` but not worth a commit alone.

---

## Cross-cutting themes

Patterns to keep an eye on as the codebase grows:

1. **Secret hygiene.** F-006, F-007, F-008, F-016 are all variations on "secrets ended up where they shouldn't." Build muscle memory: never paste, always rotate after development sessions, treat conversation transcripts as untrusted storage.

2. **Defense in depth.** F-009 + F-011 + F-013 stack. A strong password makes F-009 a non-issue. F-013 alone is fine. Together they create a real brute-force window.

3. **Silent failure.** F-020 (try/catch returning null) and F-028 (Telegram retry) both let real failures vanish. Add structured logging once Sentry or equivalent is wired.

4. **Pre-auth surface area.** F-001 through F-004 are all "things shown to anonymous visitors." Audit pre-auth content quarterly.

5. **Operator-only context leaking into user UI.** F-002, F-003 are examples. Pattern: write copy as if the visitor is hostile.

## Suggested first-week action plan

If you only have a few hours, do these in order:

1. **Rotate Telegram bot token + worker secret + Gemini key** once this conversation is archived (mitigates F-006, F-007, F-008).
2. **Pick a 20+ character random password** for the credentials login (mitigates F-009 + F-011).
3. **Add `vercel-firewall` rate limit** on `/api/auth/*` (closes F-009 properly).
4. **Implement F-020 fix** (log caught errors) — high leverage for future debuggability.
5. **Add the smoke test from F-001 prevention** — guard against the next pre-auth leak.
