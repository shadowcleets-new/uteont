# UTEONT — Gaps & Issues Report

**A holistic audit of every known gap, bug, and risk in the codebase + deployment.**

> ### Reconciliation — 2026-06-22 (operator-authorized, DOC-1)
> Statuses were reconciled against the actual code: ~24 finding **bodies** still
> read `OPEN`/`ACK` while the **index** already recorded them `FIXED` (the drift
> DOC-1 flagged). Bodies now match the index, using the code + commit history as
> ground truth. This session also completed and marked: **F-020** (remaining
> swallow-catches, `d077b97`), **F-024** (worker monitoring, `a7003ae`),
> **F-025** (server-side backoff, `8f2b761`), **F-032** + **F-033** (pre-commit
> hook + CONTRIBUTING, `6466c8b`). Still genuinely open/owed: **F-026** (restore
> drill — operator), and the SEC-1 admin-password rotation tracked under F-031.
>
> The newer `N-xx` / `SEC-x` findings from this audit are tracked in
> **`REMEDIATION_PLAN.md`** (the forward plan), not duplicated here.

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
| F-001 | Sidebar nav rendered on unauthenticated `/login` | Privacy | 🟠 | FIXED (`559a046`) |
| F-002 | "Google sign-in not yet configured" leaked operational state | Privacy | 🟢 | FIXED (`559a046`) |
| F-003 | "Credentials managed via Telegram bot" footer leaked architecture | Privacy | 🟢 | FIXED (`559a046`) |
| F-004 | `?next=<path>` in redirect URL exposed intended route | Privacy | 🟢 | FIXED (`559a046`) |
| F-005 | No logout button — sessions had to be cleared via cookies | UX | 🟡 | FIXED (`559a046`) |
| F-006 | Telegram bot token visible in this conversation history | Security | 🔴 | FIXED — operator rotated via `/revoke` → @BotFather (2026-05-27); new token live in Vercel; webhook re-registered with rotated secret; old token returns 401 |
| F-007 | `WORKER_SHARED_SECRET` visible in this conversation history | Security | 🔴 | FIXED — operator rotated in both Vercel + Railway via Option A flow (no value in chat); worker observed claiming + completing jobs |
| F-008 | `GEMINI_API_KEY` visible in this conversation history | Security | 🔴 | FIXED — old key returns HTTP 400 (Google auto-revoked via Secret Scanning partner integration); new key set in Railway via dashboard, idea-generation jobs reaching Gemini and returning results |
| F-009 | No rate limiting on `/api/auth/*` (credential brute force) | Security | 🟠 | FIXED (`604e7d0`) |
| F-010 | No login attempt logging or alerts | Security | 🟡 | FIXED (`604e7d0`) |
| F-011 | Password policy is length-only (no complexity required) | Security | 🟢 | FIXED (`604e7d0`) |
| F-012 | Telegram admin gate trusts single env var `TELEGRAM_CHAT_ID` | Security | 🟡 | FIXED (`604e7d0`) |
| F-013 | bcryptjs cost factor 10 — industry now suggests 12+ | Security | 🟢 | FIXED (`604e7d0`) |
| F-014 | No Content-Security-Policy headers | Security | 🟡 | FIXED (`604e7d0`) |
| F-015 | No HSTS / preload declared (Vercel default covers some) | Security | 🟢 | FIXED (`604e7d0`) |
| F-016 | `/setpassword <pw>` sends password plaintext over Telegram chat | Privacy | 🟠 | FIXED (`604e7d0`) — `/setpassword-url` flow available |
| F-017 | `AUTH_SECRET` set only in production env, missing preview/dev | Security | 🟡 | ACK (team sensitive-vars policy blocks dev/preview; documented in OPERATIONS.md) |
| F-018 | `/api/health` reveals which env vars are set | Privacy | 🟢 | FIXED (`604e7d0`) — split public minimal vs authed full |
| F-019 | Login page `<title>` reveals product name to scanners | Privacy | 🔵 | FIXED (`604e7d0`) |
| F-020 | Several `try/catch { return null }` blocks swallow errors silently | Code Quality | 🟡 | FIXED (`604e7d0`) — log before returning empty |
| F-021 | No automated tests anywhere in the repo | Code Quality | 🟠 | FIXED (`e6849ae`) — Vitest scaffolded, 10/10 password-policy tests pass |
| F-022 | Inline arbitrary Tailwind values (`bg-[#d97757]`) scattered — should be tokens | Code Quality | 🟢 | FIXED (`e6849ae`) — brand-* tokens in @theme; gradual migration |
| F-023 | `NEXT_PUBLIC_APP_URL` hardcoded fallback won't update with custom domain | Code Quality | 🟢 | ACK — fallback documented in code, full removal would break local dev |
| F-024 | Worker has no `/health` endpoint — silent death possible | Operations | 🟡 | FIXED (`604e7d0`) — stdlib HTTP server on :8080 with counters |
| F-025 | Job retry uses fixed attempt cap, no exponential backoff | Operations | 🟢 | FIXED (`604e7d0`) — 5s × 2^attempts, cap 5min |
| F-026 | No backup-restore drill for Neon | Operations | 🟡 | DOCUMENTED (`e6849ae`) — OPERATIONS.md has procedure + RTO/RPO; first drill still owed |
| F-027 | Worker job `result` JSON accumulates indefinitely in `jobs` table | Operations | 🟢 | FIXED (`604e7d0`) — weekly cron purges done jobs > 30d |
| F-028 | Telegram notification on failure is best-effort — no retry on send failure | Operations | 🟢 | FIXED (`604e7d0`) — 3 attempts, 250ms/1s/4s backoff, skips 4xx |
| F-029 | NextAuth Google provider has no `hd` (hosted-domain) hint | Security | 🟢 | FIXED (`604e7d0`) — `GOOGLE_HOSTED_DOMAIN` env (optional) |
| F-030 | Build emits many `LF will be replaced by CRLF` warnings on Windows | Code Quality | 🔵 | FIXED (`604e7d0`) — `.gitattributes` |
| F-031 | **Live secrets pasted verbatim into committed GAPS_REPORT.md** | Security | 🔴 | FIXED (`9598ca0` history + CI guard; rotation completed via F-006/F-007/F-008) |
| F-032 | gitleaks runs at CI only, not pre-commit (bypass via `git push --no-verify` possible) | Security | 🟡 | FIXED (`6466c8b`) — `.husky/pre-commit` gitleaks scan (warn-skips when binary absent) |
| F-033 | Operator-facing "document containing secrets must be redacted before commit" checklist not formalized | Process | 🟡 | FIXED (`6466c8b`) — `CONTRIBUTING.md` redaction checklist |
| F-034 | **Silent migration drift — `db:migrate` reported success but migrations 0001 + 0002 never applied** | Operations | 🔴 | FIXED (`31bfead`) — `/api/db-status` endpoint surfaces schema mismatch; future drift detectable in one curl |
| F-035 | `getAuthConfig` swallowed schema errors as "no row" — produced misleading `/whoami` "not yet set" reply when table didn't exist | Code Quality | 🟠 | FIXED (`31bfead`) — three-state return distinguishes missing-table (`undefined`) from no-row (`null`); 42P01 logged as SCHEMA MISSING |
| F-036 | `/setuser` success message suggested `/setpassword` (chat-history-leaky) instead of `/setpassword-url` | Privacy | 🟢 | FIXED (`31bfead`) |
| F-037 | Setup form lacked visibility toggle, live match check, and live policy indicators | UX | 🟢 | FIXED (`c330b76`) — eye toggles, live match + colored border, live policy checklist with three-state per check (neutral/ok/fail), context-aware submit-button label |

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

**Domain:** Security · **Severity:** 🟠 High · **Status:** FIXED — operator rotated 2026-05-27 via `/revoke`; new token live, old returns 401

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

**Domain:** Security · **Severity:** 🟠 High · **Status:** FIXED — operator rotated 2026-05-27 in Vercel + Railway; worker confirmed claiming jobs

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

**Domain:** Security · **Severity:** 🟡 Medium · **Status:** FIXED — old key auto-revoked by Google Secret Scanning; new key live in Railway

**Description.** The Gemini API key `<GEMINI_API_KEY_REDACTED>` is in chat (was pasted as part of a cURL test). Anyone with it can burn the operator's free-tier quota or rack up paid usage if quota is raised.

**Impact.** Financial risk capped by Google's free-tier limits (1500 req/day on Flash). Worst case: someone runs a content-generation farm against the key until rate limits or quota stops them.

**Recommended fix.** Revoke at https://aistudio.google.com/app/apikey, create a new key, swap in Railway env. Free + 2-minute operation.

**Prevention.** Same as F-006/F-007.

---

### F-009 — No rate limiting on `/api/auth/*` (credential brute force)

**Domain:** Security · **Severity:** 🟠 High · **Status:** FIXED (`604e7d0`)

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

**Domain:** Security · **Severity:** 🟡 Medium · **Status:** FIXED (`604e7d0`)

**Description.** Failed (and successful) login attempts go nowhere — no DB row, no Telegram alert, nothing in Vercel logs at the application level.

**Impact.** Brute-force attempts are invisible. The operator wouldn't know they're under attack until the attacker succeeded.

**Prevention.**
- Insert a row into a `login_attempts` table on every authorize() call (success or fail).
- Cron job hourly: if N+ failures in last hour from a single IP, send Telegram alert.
- Bonus: if an unfamiliar IP succeeds, alert the operator immediately.

---

### F-011 — Password policy is length-only

**Domain:** Security · **Severity:** 🟢 Low · **Status:** FIXED (`604e7d0`)

**Description.** `setPassword()` requires only `password.length >= 8`. A password like `aaaaaaaa` would be accepted.

**Impact.** Inversely depends on operator discipline. If they pick a strong password, no issue. If they pick `password123`, F-009 becomes immediately dangerous.

**Prevention.** Enforce in `setPassword()`:
- Minimum 12 chars
- At least one uppercase, one lowercase, one digit, one symbol
- Reject against the [HaveIBeenPwned top 1000](https://haveibeenpwned.com/Passwords) list (zxcvbn library)

---

### F-012 — Telegram admin gate trusts single env var

**Domain:** Security · **Severity:** 🟡 Medium · **Status:** FIXED (`604e7d0`) — verified in code

**Description.** Admin commands (`/setuser`, `/setpassword`, etc.) check `chatId === process.env.TELEGRAM_CHAT_ID`. If an attacker compromises Vercel env (e.g., via a leaked Vercel token), they can set `TELEGRAM_CHAT_ID` to their own chat ID and then run admin commands at will.

**Impact.** Requires Vercel-level access first. Probably unrealistic, but defense-in-depth fails here.

**Prevention.** Store the admin chat ID(s) in the `auth_config` DB table, not env. Set initially via a `/bootstrap <secret>` flow where the secret is a one-time token written to a file or env var that's then deleted.

---

### F-013 — bcryptjs cost factor 10

**Domain:** Security · **Severity:** 🟢 Low · **Status:** FIXED (`604e7d0`)

**Description.** Password hashing uses bcryptjs at default cost 10 (~100ms on modern CPUs). OWASP currently recommends 12+ for bcrypt as of 2025.

**Impact.** F-009 brute-force is ~4x faster than it would be at cost 12.

**Prevention.** Change to `bcrypt.hash(pw, 12)` in `setPassword()`. Existing hash continues to work for verification (bcrypt stores cost in the hash itself).

---

### F-014 — No Content-Security-Policy headers

**Domain:** Security · **Severity:** 🟡 Medium · **Status:** FIXED (`604e7d0`)

**Description.** No CSP header set in `next.config.ts` or `vercel.json`. A reflected-XSS bug anywhere on the app could be exploited freely.

**Impact.** No known XSS vector today, but the lack of CSP turns any future XSS bug into a credential-theft event.

**Prevention.** Add CSP via Next.js headers config: `default-src 'self'; script-src 'self' 'unsafe-inline' apis.google.com; ...`. Start with report-only mode (`Content-Security-Policy-Report-Only`) for a week, then enforce.

---

### F-015 — HSTS not declared in next.config

**Domain:** Security · **Severity:** 🟢 Low · **Status:** FIXED (`604e7d0`)

**Description.** Vercel automatically sets `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (verified via curl). However, the app itself doesn't declare HSTS in code, so a future hosting change could drop it silently.

**Prevention.** Make it explicit in `next.config.ts` headers so it survives migrations.

---

### F-016 — `/setpassword <pw>` sends password plaintext over Telegram

**Domain:** Privacy · **Severity:** 🟠 High · **Status:** FIXED (`604e7d0`) — `/setpassword-url` flow replaces plaintext-over-chat

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

**Domain:** Security · **Severity:** 🟡 Medium · **Status:** ACK — dev/preview missing AUTH_SECRET is accepted residual (team sensitive-vars policy); set in production. Documented in OPERATIONS.md.

**Description.** `AUTH_SECRET` was added to Vercel production only (the CLI rejected `preview` and `development` due to team's Sensitive Environment Variables Policy).

**Impact.** Preview deployments (PR builds) and local dev (`vercel env pull`) will lack `AUTH_SECRET`. NextAuth will fail on those environments or generate a per-instance random key (which means JWTs from one preview don't validate on another).

**Practical risk.** Low for now — no team members, no preview deployments in regular use.

**Prevention.** Generate a separate `AUTH_SECRET` for dev/preview (not the production one) and add via `--sensitive false` if the team policy allows it. Or downgrade from sensitive.

---

### F-018 — `/api/health` reveals env-var existence

**Domain:** Privacy · **Severity:** 🟢 Low · **Status:** FIXED (`604e7d0`) — split public-minimal vs authed-full

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

**Domain:** Privacy · **Severity:** 🔵 Info · **Status:** FIXED (`604e7d0`)

**Description.** `<title>Sign in — UTEONT</title>` on `/login` reveals the product name to scanners, search engines, and tab thumbnails.

**Impact.** Negligible — `uteont.vercel.app` already reveals the name in the URL. Listed for completeness.

**Acceptance rationale.** Product name being publicly visible is fine; this app is the operator's, no obligation to hide its existence. Recorded so future "stealth mode" iterations remember to change it.

---

### F-020 — Several `try/catch { return null }` blocks swallow errors

**Domain:** Code Quality · **Severity:** 🟡 Medium · **Status:** FIXED (`604e7d0`); remaining swallow-catches completed via N-11 (`d077b97`)

**Description.** Functions like `getAgentStats()`, `getAllAgentStats()`, `getAuthConfig()`, and `listRuns(...)` wrap DB queries in `try { ... } catch { return [] /* or null */ }` — masking errors so the UI degrades gracefully.

**Impact.** A real DB outage (e.g., connection pool exhausted) renders as "no data yet" instead of an alert. The operator wouldn't know.

**Prevention.**
- Log the caught error to a structured logger (Vercel logs, Sentry, etc.) before returning the empty/null value.
- Surface a "data unavailable" banner in the UI when the catch path is hit (via a separate `error` state, not just empty).

---

### F-021 — No automated tests anywhere

**Domain:** Code Quality · **Severity:** 🟠 High · **Status:** FIXED (`e6849ae`) — Vitest scaffolded; suite now 394 passing

**Description.** The repo has zero test files. No unit tests for the deterministic agents (qa-agent, seo-agent), no integration tests for API routes, no E2E test for the login flow.

**Impact.** Regressions are caught by user reports, not CI. Every change is high-trust.

**Prevention.** Start with:
- Vitest for unit tests on `worker/agents/*` and `src/lib/services/*`
- Playwright for one E2E flow: open `/`, redirected to `/login`, sign in, see dashboard, sign out
- Add to CI on every PR

Realistic next step: cover the auth flow first since it gates everything.

---

### F-022 — Inline arbitrary Tailwind values scattered

**Domain:** Code Quality · **Severity:** 🟢 Low · **Status:** FIXED (`e6849ae`) — brand-* tokens in @theme

**Description.** Brand colors like `#d97757` and `#141413` appear inline in dozens of `bg-[#xxx]` / `text-[#xxx]` / `border-[#xxx]` arbitrary values. Tokens exist in `src/lib/theme.ts` but aren't wired into Tailwind config.

**Impact.** A rebrand requires hunting through ~30 files. Tailwind theme should be the source of truth.

**Prevention.** Extend `tailwind.config.ts` with named colors:
```ts
colors: { brand: { dark: '#141413', accent: '#d97757', ... } }
```
Then `bg-[#d97757]` becomes `bg-brand-accent`. Refactor incrementally.

---

### F-023 — Hardcoded fallback `NEXT_PUBLIC_APP_URL`

**Domain:** Code Quality · **Severity:** 🟢 Low · **Status:** ACK — hardcoded `NEXT_PUBLIC_APP_URL` fallback documented in code; full removal would break local dev.

**Description.** Telegram webhook handler uses `process.env.NEXT_PUBLIC_APP_URL ?? "https://uteont.vercel.app"`. If you ever move to a custom domain, every deep link in bot messages still points at the vercel.app subdomain unless the env var is explicitly set.

**Prevention.** Always set `NEXT_PUBLIC_APP_URL` in Vercel env. Remove the hardcoded fallback so the build fails loud if missing.

---

### F-024 — Worker has no `/health` endpoint

**Domain:** Operations · **Severity:** 🟡 Medium · **Status:** FIXED — `/health` endpoint (`604e7d0`) + stale-worker monitoring cron (`a7003ae`)

**Description.** The Python worker polls and acts but exposes no HTTP endpoint. If it crashes or hangs (e.g., Gemini timeout, network split), Railway shows it as Active until the next deployment cycle. The operator only finds out when a queued job goes stale.

**Prevention.** Add a tiny HTTP server alongside the poller:
- `GET /health` returns 200 with last-poll timestamp + claimed-job count
- Railway can poll it as a health check + auto-restart on failure
- Add a Vercel cron that hits the worker's `/health` daily and alerts via Telegram if down

---

### F-025 — Fixed-attempt retry, no backoff

**Domain:** Operations · **Severity:** 🟢 Low · **Status:** FIXED — in-worker backoff (`604e7d0`) + server-side `scheduled_at` gate (`8f2b761`, migration 0011)

**Description.** Jobs retry up to `maxAttempts` (default 3) on the next poll cycle (~5 seconds later). No exponential backoff. A genuinely flaky downstream (e.g., Gemini overloaded) gets hammered.

**Prevention.** Exponential backoff: 1st retry after 5s, 2nd after 30s, 3rd after 2min. Set `scheduled_at` field, claim only jobs where `scheduled_at <= NOW()`.

---

### F-026 — No backup-restore drill for Neon

**Domain:** Operations · **Severity:** 🟡 Medium · **Status:** DOCUMENTED (`e6849ae`) — procedure + RTO/RPO in OPERATIONS.md; first restore drill still owed (operator).

**Description.** Neon offers Point-in-Time Recovery by default (free tier: 24 hours; paid: 7 days). I've never actually executed a restore to confirm it works for this DB.

**Impact.** A DROP TABLE in a bad migration would test the recovery flow under stress. Better to test now.

**Prevention.** Quarterly drill:
1. Create a Neon branch from a 1-hour-old PITR snapshot
2. Verify all tables + recent data are present
3. Document the time-to-recovery

---

### F-027 — `result` JSON accumulates indefinitely in `jobs`

**Domain:** Operations · **Severity:** 🟢 Low · **Status:** FIXED (`604e7d0`) — weekly cron purges done jobs > 30d

**Description.** Every completed job stores its full result payload (including full keyword arrays, idea lists, article bodies) in `jobs.result` as JSONB. Nothing purges old rows.

**Impact.** After ~1000 content-writing runs, `jobs` table will be several hundred MB. Neon free tier is 0.5 GB total.

**Prevention.** Vercel cron weekly: delete `jobs` rows older than 30 days where `status='done'`. The runs/keywords/ideas/articles tables are the durable record; jobs is just the queue.

---

### F-028 — Failed Telegram notification has no retry

**Domain:** Operations · **Severity:** 🟢 Low · **Status:** FIXED (`604e7d0`) — 3 attempts w/ backoff, skips 4xx

**Description.** If `sendMessage()` fails (Telegram outage, transient error), the notification is marked failed and never retried. The operator misses the alert.

**Prevention.** When marking a notification failed, also schedule a retry via the worker queue. Cap at 3 attempts.

---

### F-029 — NextAuth Google provider has no `hd` hint

**Domain:** Security · **Severity:** 🟢 Low · **Status:** FIXED (`604e7d0`) — optional `GOOGLE_HOSTED_DOMAIN` hint

**Description.** When Google OAuth is configured, the consent screen accepts ANY Google account. The allowlist check happens after sign-in (signIn callback). Bad UX: a wrong-account user gets through Google's flow then sees "access denied".

**Prevention.** Set `authorization.params.hd` to restrict the OAuth consent screen to a specific Google Workspace domain (only works if operator's email is on Workspace, not gmail.com).

**Alternative.** Pre-filter at the login page: ask the operator's email-prefix once, store in localStorage, hint it in the Google flow.

---

### F-030 — Build emits `LF will be replaced by CRLF` warnings on Windows

**Domain:** Code Quality · **Severity:** 🔵 Info · **Status:** FIXED (`604e7d0`)

**Description.** Every `git commit` from the Windows dev machine warns about line-ending normalization. Files have LF in repo, get CRLF on checkout.

**Impact.** None functional. Visual noise.

**Fix applied.** Added `.gitattributes` with `* text=auto eol=lf` plus explicit binary markers for `*.png`, `*.woff2`, etc., and `*.bat text eol=crlf` so Windows batch files keep CRLF as the OS expects.

---

### F-031 — Live secrets pasted verbatim into committed GAPS_REPORT.md

**Domain:** Security · **Severity:** 🔴 Critical · **Status:** FIXED (`9598ca0`) for history + CI guard; secret rotations completed (F-006/7/8). New admin-password rotation (SEC-1) tracked in REMEDIATION_PLAN.md.

**Description.** While documenting F-006, F-007, F-008 (secrets exposed in this conversation transcript), the LLM included the actual literal secret values in the committed audit report instead of redacted forms. The report was pushed to the public GitHub repo. GitHub Secret Scanning detected the Google API key and the Telegram bot token within minutes and emailed the operator.

Specifically leaked via commits `559a046`, `604e7d0`, and `3c919bc` (now rewritten):
- One current Telegram bot token + one previously-rotated one
- One Google Gemini API key
- Three `WORKER_SHARED_SECRET` values across rotations

**Root cause.** Process failure. The author of the audit document failed to apply the redaction policy they were documenting. Treated the value strings as "evidence" rather than as live credentials. No pre-commit secrets scan was in place to catch the mistake.

**How it appeared.** The audit document narrative ("the current token is X, in chat history") naturally invited including the value. Subjectively, the secrets felt "already known" because they'd been pasted in chat — but committing them to a public repo escalates the exposure dramatically (from one chat transcript to anyone scraping GitHub).

**Impact.** GitHub indexes public commits within seconds, so the secrets must be treated as compromised by external parties:
- Telegram bot token: full bot takeover possible until revoked
- Gemini API key: free-tier quota abuse possible until revoked; Google may have auto-revoked as a Secret Scanning partner
- `WORKER_SHARED_SECRET`: ability to impersonate the worker, poison the keyword pipeline, return false results until rotated

**Fix applied (this audit's mitigation).**
1. `git filter-repo --replace-text` rewrote every commit on `main` to substitute each secret string with `<REDACTED>` placeholders. 21 commits processed.
2. Force-pushed (`3c919bc` → `e6849ae` → `9598ca0`). GitHub no longer has any commit containing the live values.
3. Added `.gitleaks.toml` + `.github/workflows/secrets-scan.yml`. Gitleaks runs on every push and PR with default ruleset + custom rules for Telegram bot tokens, Google AI Studio keys, and worker secrets in our naming convention. Allowlist for `<*_REDACTED>` placeholders so the audit report itself doesn't trigger false positives.
4. `WORKER_SHARED_SECRET` rotated in Vercel (new value live; old returns 401 on `/api/jobs/claim`).

**Still pending operator (rotation cannot be done remotely).**
- Telegram bot: `/revoke` via @BotFather, share new token, I update Vercel + re-register webhook.
- Gemini API key: delete + regenerate at https://aistudio.google.com/app/apikey, share new value, I update Railway env.
- `WORKER_SHARED_SECRET`: pull new value from Vercel (via `vercel env pull .env.tmp --environment=production`) and paste into Railway env.

**Prevention going forward.**
- Any file whose name or content references secrets, tokens, keys, or credentials is automatically suspect. Run `npx gitleaks detect --no-git --source <file>` before staging.
- Audit documentation may NEVER contain literal secret values. Only `<REDACTED>`, `8979...c` truncated form, or descriptions of the secret's shape.
- Pre-commit hook (see F-032) would catch this even if discipline lapses.
- The gitleaks GitHub Action is the secondary safety net for PR-based workflows; pre-commit is the primary.

---

### F-032 — gitleaks runs at CI only, not pre-commit

**Domain:** Security · **Severity:** 🟡 Medium · **Status:** FIXED (`6466c8b`) — gitleaks pre-commit hook (warn-skips when binary absent so it never blocks a clone)

**Description.** The gitleaks safety net added in F-031 runs on `git push` (when GitHub Actions fire). It does not run on `git commit`, so a developer can locally make a contaminated commit and not realize until the push fails. Worse: `git push --no-verify` bypasses it entirely if the bypass is at the GitHub Actions level (it isn't — Actions can't be skipped via `--no-verify` — but the principle stands for any future pre-commit hook).

**Impact.** A momentary lapse on a local machine can create a commit that contains secrets in its diff, which sits in local history until pushed. If `git filter-repo` is needed again, it's another round of force-push-and-rewrite — disruptive.

**Prevention.** Add `husky` + a `pre-commit` hook that runs `gitleaks protect --staged` on every commit. Makes the local feedback loop instant and pre-empts the CI failure.

---

### F-033 — Operator-facing "secrets must be redacted before commit" checklist not formalized

**Domain:** Process · **Severity:** 🟡 Medium · **Status:** FIXED (`6466c8b`) — `CONTRIBUTING.md` redaction checklist added

**Description.** The lesson from F-031 lives in this report and the incident-response Telegram messages but is not encoded as a process control. There's no PR template, no CONTRIBUTING.md section, no auto-attached comment from a bot.

**Impact.** When future operators (or future LLM sessions) work on this repo, the discipline depends on remembering. Pre-commit gitleaks (F-032) covers most cases, but a process artifact reinforces it.

**Prevention.** Add a `CONTRIBUTING.md` section + a PR template checkbox: "I confirm no committed file contains a live secret. Audit/security docs reference secrets only via redacted forms (`<REDACTED>`, partial truncation, or by shape)."

---

## Cross-cutting themes

Patterns to keep an eye on as the codebase grows:

1. **Secret hygiene.** F-006, F-007, F-008, F-016 are all variations on "secrets ended up where they shouldn't." Build muscle memory: never paste, always rotate after development sessions, treat conversation transcripts as untrusted storage.

2. **Defense in depth.** F-009 + F-011 + F-013 stack. A strong password makes F-009 a non-issue. F-013 alone is fine. Together they create a real brute-force window.

3. **Silent failure.** F-020 (try/catch returning null) and F-028 (Telegram retry) both let real failures vanish. Add structured logging once Sentry or equivalent is wired.

4. **Pre-auth surface area.** F-001 through F-004 are all "things shown to anonymous visitors." Audit pre-auth content quarterly.

5. **Operator-only context leaking into user UI.** F-002, F-003 are examples. Pattern: write copy as if the visitor is hostile.

## Suggested first-week action plan

Updated 2026-05-27 after the rotation cluster + migration-drift incident landed.
The urgent F-031 rotation is now complete. Remaining priorities, ordered:

1. **Install `husky` + gitleaks pre-commit hook** (closes F-032).
2. **Add `CONTRIBUTING.md` with the redaction policy** (closes F-033).
3. **Run the first Neon backup-restore drill** documented in OPERATIONS.md (closes F-026's "first drill still owed").
4. **Add an external uptime probe** that hits `/api/db-status` (auth'd) on a schedule — would have caught F-034 within minutes instead of weeks.
5. **Move login-attempts purge to its own cron** if `cron/digest` ever gets noisy (currently bundled — fine for now).

---

## Resolution log

Chronological record of when findings were addressed. Append-only — every batch of fixes adds an entry. Commit shas reference the rewritten history (post-`9598ca0`).

### 2026-05-27 · UI privacy + UX (`559a046`)

- F-001 Sidebar nav on /login → fixed (conditional render based on session)
- F-002 "Google sign-in not configured" wording → removed
- F-003 "Credentials managed via Telegram bot" footer → removed
- F-004 `?next=<path>` in redirect URL → stripped
- F-005 No logout button → added to sidebar footer
- F-016 plain-text `/setpassword` → `/setpassword-url` one-time URL flow available

### 2026-05-27 · Auth + observability + queue resilience (`604e7d0`)

- F-009 + F-010 Rate limiting + login attempt audit (login_attempts table, 10 fails / 15 min lockout)
- F-011 + F-013 Password policy (12+ chars, 3 of 4 char classes, blocklist) + bcrypt cost 12
- F-012 Admin chat ID DB-backed with env fallback (new `/setadmin` command)
- F-014 + F-015 CSP, HSTS, X-Frame-Options DENY, Permissions-Policy headers
- F-018 `/api/health` split: anonymous = minimal, authed = full env diagnostic
- F-019 Login page title generic ("Sign in")
- F-020 try/catch returns log error before returning empty
- F-024 Worker `/health` HTTP endpoint on :8080
- F-025 Exponential backoff: 5s × 2^attempts, cap 5min
- F-027 Weekly cron purges done jobs > 30 days
- F-028 Telegram sendMessage retries 3× with 250ms / 1s / 4s backoff
- F-029 Google `hd` hint via `GOOGLE_HOSTED_DOMAIN` env (optional)
- F-030 `.gitattributes` for LF normalization

### 2026-05-27 · Tests + theme tokens + ops doc (`e6849ae`)

- F-021 Vitest scaffolded, 10/10 password-policy tests pass
- F-022 Brand palette as Tailwind theme tokens (`brand-*`)
- F-026 OPERATIONS.md runbook (architecture, secret rotation procedures, Neon backup-restore drill, incident playbooks)

### 2026-05-27 · Secrets cleanup (`9598ca0`)

- F-031 (new) Live secrets pasted into committed GAPS_REPORT.md
  - History rewritten via `git filter-repo --replace-text` across all 21 commits
  - Force-pushed to overwrite `main` on GitHub
  - `.gitleaks.toml` + `.github/workflows/secrets-scan.yml` added as CI guard
  - `WORKER_SHARED_SECRET` rotated in Vercel
- F-032 (new) gitleaks runs CI-only, not pre-commit — OPEN
- F-033 (new) No formal redaction checklist for audit-class documents — ACK

### 2026-05-27 · Secret rotations completed

- F-006 Telegram bot token — rotated by operator via `/revoke` → @BotFather
  - First read of the new token from screenshot OCR misread three chars
    (`l` vs `I`, `0` vs `O`); operator pasted token as text → rotation
    succeeded
  - New `TELEGRAM_BOT_TOKEN` + freshly rotated `TELEGRAM_WEBHOOK_SECRET`
    set in Vercel
  - Webhook re-registered against new token; old token returns 401
  - Test message id=12 delivered to admin chat
- F-007 `WORKER_SHARED_SECRET` synchronized in Railway (Option A —
  operator-types-once, no value ever in chat history). Worker observed
  successfully claiming + completing jobs (Idea Generation job 5
  visible in admin chat) → end-to-end confirmation
- F-008 Gemini API key — Google's Secret Scanning partner integration
  auto-revoked the leaked key (now returns HTTP 400). New key created
  in AI Studio, set in Railway via dashboard (with my browser-MCP
  staging the edit; operator clicked Deploy Changes). Idea-generation
  jobs reaching Gemini and returning results

### 2026-05-27 · Migration-drift incident + UX polish (`31bfead`, `c330b76`)

- F-034 (new) 🔴 Silent migration drift
  - During the F-009/F-010 + F-011 etc. batch, `npm run db:migrate`
    reported `[✓] migrations applied successfully!` but only migration
    0000 was actually applied. Migrations 0001 (auth_config table) and
    0002 (login_attempts + auth_config columns) silently skipped.
    Cause: drizzle-kit + Neon-HTTP edge case; the migrations were in
    the journal but never executed against the DB.
  - Symptom: `/setuser shadowcleets` got no Telegram reply at all
    (silent failure). `/whoami` returned misleading "Auth config not
    yet set" instead of "schema missing".
  - Diagnosis path: queried Neon directly → "relation auth_config does
    not exist" → 10 tables present, 12 expected → re-ran db:migrate
    → 3 migrations now in `drizzle.__drizzle_migrations`, all 12
    tables present.
  - Prevention: new auth'd `/api/db-status` endpoint returns
    `tablesPresent`, `tablesMissing`, `migrationsApplied`. One-shot
    health check for future schema drift.
- F-035 (new) 🟠 `getAuthConfig` swallowed schema errors as "no row"
  - Three-state return now: `AuthConfig` row (data) / `null` (no row,
    safe state) / `undefined` (schema missing or DB error, loud state).
  - Postgres error 42P01 specifically detected and logged as
    "SCHEMA MISSING — run npm run db:migrate".
- F-036 (new) 🟢 `/setuser` reply suggested unsafe `/setpassword`
  - Bot reply now reads: "Username set to '<name>'. Next: use
    /setpassword-url for the secure flow (password never enters this
    chat history)."
- F-037 (new) 🟢 Setup form lacked visibility + live feedback
  - `/setup/[token]` now has eye/eye-off toggles on both fields
    (independent, `tabIndex=-1`, aria-labeled)
  - Live confirm-match indicator: empty/match/mismatch states with
    colored border on the confirm input
  - Live policy checklist: 12-char floor with live count, blocklist
    check, char-class diversity counter showing N/4 with one row per
    class. Three-state per row: neutral (empty) / ✓ green / ✗ red
  - Submit button disabled until ready, with context-aware label:
    "Fill both fields" → "Password doesn't meet requirements" →
    "Passwords don't match" → "Set password"

---

## Update policy reminder

> This file is **append-only and human-controlled**. The LLM modifies it only when the operator explicitly says *"update the gaps report"*. New findings get new IDs (next: F-034). When a finding is resolved, the **Status** column is updated with the commit sha but the **Description / Root cause / Impact** sections are preserved verbatim as audit history. Old "Status" lines are not deleted — they live in git history if anyone needs to know what the status used to be.
