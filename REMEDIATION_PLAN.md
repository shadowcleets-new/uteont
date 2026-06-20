# UTEONT — Findings Summary & Remediation Plan

**Generated:** 2026-06-20 · **Branch:** `claude/thirsty-satoshi-0601ab`

A holistic findings summary + prioritized fix plan, produced by a 7-dimension parallel
audit (finders ran real `tsc` / `vitest` / `next build` / `py_compile`) plus an automated
security pass. Companion to `GAPS_REPORT.md` — this file is the **forward plan**;
GAPS_REPORT remains the append-only historical ledger.

> ID scheme: `F-0xx` = documented in GAPS_REPORT (status reconciled here to real code);
> `N-xx` = newly discovered this audit; `SEC-x` = secret-hygiene pass; `DOC-x` = ledger drift.

## Table of contents
1. State of the application
2. Findings by severity
3. Cross-cutting themes
4. Remediation plan (Wave 0–3)
5. Quick wins
6. Ownership: operator vs. engineer

---

## 1. State of the application

UTEONT is a human-supervised multi-agent SEO growth engine: Next.js 16 / Drizzle-Neon on
Vercel + a Python/Playwright worker on Railway driving Gemini. **The foundations are
solid** — `tsc --noEmit` and `next build` pass clean, 366 tests pass, no server/client
component violations, auth is centralized correctly in `middleware.ts`, and the documented
security cluster (F-009–F-015, F-018, F-029) is genuinely fixed in code.

**The problem is the newest layer.** The "moat" engine (cost-ledger, redact-pii,
content-safety, feature-flags, cannibalization, scoring) shipped as well-tested **pure
cores that are almost entirely unwired from the live path** — they guard nothing yet. Two
**correctness defects in the job lifecycle** can corrupt data (non-idempotent completion +
dedup-replay re-inserts). The **migration pipeline is broken the same way the F-034
incident was**: `db:migrate` (the documented prod path) silently skips migrations
0010–0014, the next `drizzle-kit generate` will collide with them, and the drift-detector
built to catch exactly that is blind to 7 tables.

Overlaying everything, **`GAPS_REPORT.md` is not trustworthy for triage**: its index marks
~16 findings FIXED while the finding bodies still say OPEN, and some "FIXED" items are only
partial. **The single biggest risk is the job idempotency defect (N-01)** — it silently
duplicates published content, approvals, and notifications on any slow/flaky completion.

---

## 2. Findings by severity

| ID | Title | Domain | Sev | Status | Effort | Location |
|----|-------|--------|-----|--------|--------|----------|
| SEC-1 | Live admin password in `.playwright-mcp/` captures (10 files) | Security | 🔴→✅ | contained (gitignored+purged); rotation owed | S | `.playwright-mcp/*` |
| N-01 | `completeJob`/`failJob` non-idempotent → worker re-queues completed job on lost/timed-out complete → duplicate content, double notifications | Correctness | 🔴 | new | M | `jobs.ts:335-359,499-516`; `worker.py:244-264` |
| N-02 | `db:migrate` (documented path) silently skips migrations 0010–0014 → half-migrated schema (F-034 redux) | Data | 🔴 | open | M | `drizzle/meta/_journal.json`; `OPERATIONS.md:164` |
| N-03 | Dedup-cache replay re-inserts articles/ideas/keywords on every cache HIT | Correctness | 🟠 | new | S | `jobs.ts:89-101,186-219` |
| N-04 | No `error.tsx`/`not-found.tsx`/`global-error.tsx` anywhere → throws & `notFound()` hit bare dead-end pages | Next.js | 🟠 | new | M | `src/app/**` |
| N-05 | Guardrail cores (cost-ledger, redact-pii, content-safety, flags) never called in prod path | Ops | 🟠 | new | M | `cost-ledger.ts`, `redact-pii.ts`, `content-safety.ts`, `flags.ts` |
| N-06 | No budget cap before Gemini calls → unbounded spend (`checkBudgetCap` is dead) | Ops | 🟠 | new | M | `gemini.ts:85-190` |
| N-07 | Next `drizzle-kit generate` will collide with the orphaned 0010–0014 files | Data | 🟠 | open | M | `drizzle/meta/0009_snapshot.json` vs `schema.ts` |
| N-08 | `/api/db-status` `EXPECTED_TABLES` omits 7 real tables → false all-clear (drift detector blind) | Data | 🟠 | partial | S | `db-status/route.ts:19-38` |
| N-09 | `ResilientFetcher` delegates SSRF guard to non-existent `assert_public_url`; raw `urlopen` | Worker/Sec | 🟠 | new (latent) | M | `worker/lib/fetcher.py:157,232` |
| N-10 | Login lockout is global, never resets, self-amplifies → attacker locks operator out indefinitely (DoS) | Security | 🟡 | partial | S | `login-attempts.ts:40-58`; `auth.ts:57-62` |
| SEC-2 | `.env.local` holds **production** Neon creds + AES `CONNECTION_ENCRYPTION_KEY` in plaintext on disk | Security | 🟡 | new | S | `.env.local:8-12` |
| N-11 | F-020 only partially done — `getCheckpoint`/`isAgentPaused`/auth-config still swallow errors silently | Correctness | 🟡 | partial | S | `checkpoints.ts:76`, `agent-state.ts:36`, +3 |
| N-12 | `/pipeline?cycleId=abc` → unhandled 500 (NaN reaches int column), user-triggerable | Next.js | 🟡 | new | S | `pipeline/page.tsx:37-40` → `snapshot.ts:222` |
| N-13 | Dashboard white-screens when DB down (`getActiveSiteIdServer` doesn't degrade) | Next.js | 🟡 | new | S | `page.tsx:19-27,41-45` |
| F-024 | Worker `/health` exists but **nothing monitors it** → hung worker still silent | Ops | 🟡 | partial | S | `worker.py:148-186`; `railway.json` |
| F-025 | Backoff is in-worker `sleep` only — no `scheduled_at` gate → defeated under concurrency/restart | Ops | 🟡 | partial | M | `worker.py:255-264`; `jobs.ts` claim |
| N-14 | Daily cron cannibalization writes **non-idempotent** decision records → dupes on retry/re-fire | Ops | 🟡 | new | S | `cron/daily/route.ts:99-122` |
| N-15 | `job_events` grows unbounded & is orphaned by the F-027 jobs purge | Data | 🟡 | new | S | `job-events.ts:23`; `cron/digest` |
| F-026 | Neon backup-restore drill never executed ("Last drill: never") | Ops | 🟡 | partial | S | `OPERATIONS.md:92` |
| N-16 | `robots.txt` fetch has no timeout → can hang fetch path; re-fetches on every failure | Worker | 🟡 | new | M | `worker/lib/fetcher.py:200-212` |
| F-032 | gitleaks is CI-only — no pre-commit hook | Security | 🟢 | open | S | `secrets-scan.yml` |
| N-17 | GSC OAuth `state` unsigned, not session-bound (OAuth CSRF) | Security | 🟢 | new | M | `integrations/gsc/connect+callback` |
| N-18 | Setup-token compared with `!==` (non-constant-time) | Security | 🟢 | open | S | `setup-token.ts:67` |
| N-19 | Telegram webhook trusts body `chat.id` behind shared-secret header only | Security | 🟢 | new | S | `telegram/webhook/route.ts` |
| N-20 | `GET /api/sites/[id]` → unhandled 500 leaking Postgres error on non-numeric id | Next.js | 🟢 | new | S | `sites/[id]/route.ts:7-11` |
| N-21 | SSE agent-stream loop uncapped — no client-abort/timeout, double `close()` | Next.js | 🟢 | new | M | `agents/[key]/stream/route.ts:81-84` |
| N-22 | `runDirectorReport` persists a synthetic `user` message → pollutes history/compaction | Correctness | 🟢 | new | M | `director.ts:480-505` |
| N-23 | `redactPII` comment says "fail closed" but returns raw text (fails **open**) | Correctness | 🟢 | new | S | `redact-pii.ts:62-72` |
| N-24 | Hot worker-claim query lacks composite/partial index | Data | 🟢 | new | S | `jobs.ts:297-303`; `schema.ts:144` |
| N-25 | `intelligence_engine` flag defined but read nowhere → no kill switch | Ops | 🟢 | new | S | `flags.ts:22-23` |
| N-26 | `content-safety`/`publishing` unwired (no live publish executor yet) | Ops | 🟢 | new | S | `content-safety.ts`, `publishing.ts` |
| N-27 | `psycopg[binary]` pinned but never imported (dead heavy dep) | Worker | 🟢 | new | S | `worker/requirements.txt:14` |
| N-28 | `WORKER_HEALTH_PORT` disable-guard is a truthiness no-op | Worker | 🟢 | new | S | `worker.py:203-204` |
| N-29 | Malformed claim payload (`job['id']`) = unhandled `KeyError` kills poll loop | Worker | 🟢 | new | S | `worker.py:227-228` |
| DOC-1 | **GAPS_REPORT index says FIXED for ~16 findings while bodies say OPEN** (+ some "FIXED" are partial) | Process | 🔵 | doc-drift | S | `GAPS_REPORT.md` throughout |
| INFO | Verified genuinely fixed: F-001, F-012. tsc/build clean, 366 tests pass, worker compiles. CI `pytest`-only run silently skips semantic/serp `unittest` tests | — | 🔵 | info | — | — |

---

## 3. Cross-cutting themes

1. **Unwired guardrails (false safety).** N-05/N-06/N-25/N-26: the guardrail layer is
   tested cores with no production caller. The app advertises budget caps, PII scrubbing,
   content-safety, and a kill switch — none are in effect.
2. **Job lifecycle is not at-least-once-safe.** N-01 + N-03 + F-025: completion isn't
   idempotent, replay re-persists, retries aren't time-gated. This is the data-integrity
   heart of the system.
3. **Migration drift is structurally re-armed.** N-02/N-07/N-08: the journal stops at
   0009, the documented apply path skips the new tables, the next `generate` collides, and
   the detector is blind. F-034 will recur.
4. **Missing failure surfaces.** N-04/N-11/N-13: no error boundaries, several silent
   `catch {}`, degrade-paths that don't degrade — real failures render as "no data" or
   dead-end pages.
5. **Secret hygiene is the recurring weak point.** SEC-1 (just contained), SEC-2, F-032,
   plus historical F-006/7/8/F-031. Pre-commit enforcement is the missing control.
6. **The ledger lies (DOC-1).** GAPS_REPORT index and bodies disagree on ~16 findings.

---

## 4. Remediation plan — waves

### Wave 0 — Blockers (before any deploy of this branch)

- [ ] **SEC-1 — Operator: rotate the admin login password.** Leak is contained in git, but
  the value was on-disk + in transcript. *Done when:* new password set via
  `/setpassword-url`, old one rejected.
- [x] **N-01 idempotency** ✅ DONE *(2026-06-20)* — terminal-state guards in `completeJob`/`failJob`;
  ideally atomic `UPDATE … WHERE id=$1 AND status='claimed' RETURNING *`.
  Files: `jobs.ts:335-359,499-516`. *Done when:* a re-delivered complete/fail on a `done`
  job is a no-op (`jobs-idempotency.test.ts`).
- [x] **N-03 dedup replay** ✅ DONE *(2026-06-20)* — skip domain-table persistence when `jobId == null`.
  File: `jobs.ts:89-101,208-215`. *Done when:* a cache HIT inserts no new
  articles/ideas/keywords (test).
- [ ] **N-02 + N-07 migration journal** *(engineer regenerates, operator applies)* — reconcile
  the journal: regenerate 0010–0014 via `drizzle-kit generate` (or delete the hand-written
  files and let generate own them); stop documenting `db:migrate` until clean.
  *Done when:* `_journal.json` lists 0010–0014 and a fresh `migrate` on an empty DB creates
  all 25 tables exactly once.
- [x] **N-08 db-status detector** ✅ DONE *(2026-06-20)* — `EXPECTED_TABLES` now derived from the
  Drizzle schema via `getTableConfig` (stronger than copying a list — can't drift again).
  File: `db-status/route.ts`. Misleading `db:migrate` hint also corrected (points to `db:push`).
  *Done when:* `/api/db-status` reports `tablesMissing` for the engine tables when absent. ✓
- [ ] **Operator: apply migrations 0012–0014 + push branch** (only after the four above).
  *Done when:* `/api/db-status` shows zero missing tables in prod.

### Wave 1 — This week (resilience + active risk)

- [ ] **N-04/N-12/N-13/N-20 error surfaces** *(engineer)* — add root `error.tsx`,
  `not-found.tsx`, `global-error.tsx`; guard NaN params in `pipeline/page.tsx` and
  `sites/[id]/route.ts`; wrap `getActiveSiteIdServer` to degrade. *Done when:*
  `/pipeline?cycleId=abc`, `/api/sites/abc`, and DB-down all render inside the app shell.
- [ ] **N-06 budget cap + N-25 flag gate** *(engineer)* — call `checkBudgetCap()` in
  `gemini.complete()` before fetch (cap from env, unlimited when unset); gate engine
  entrypoints behind `getFlag('intelligence_engine')`. *Done when:* over-cap throws
  `GeminiError`; flag=false stops the cannibalization/metrics block.
- [ ] **N-10 login DoS** *(engineer)* — don't record a failure while locked; forgive window
  on success; consider per-IP. Files: `login-attempts.ts`, `auth.ts`. *Done when:* correct
  password logs in despite an active attacker flood (test).
- [ ] **F-024 worker monitoring** *(engineer + operator deploy)* — set
  `railway.json deploy.healthcheckPath='/health'` and/or a Vercel cron that pings worker
  `/health` and Telegram-alerts on stale `last_poll_at`. *Done when:* a hung worker triggers
  a restart or alert.
- [ ] **F-025 server-side backoff** *(engineer → operator migrate)* — add `jobs.scheduled_at`;
  set on retry; add `AND scheduled_at <= NOW()` to claim. *Done when:* a requeued job isn't
  claimable until its backoff elapses, regardless of worker count.
- [ ] **N-14 cron idempotency** *(engineer)* — `recordDecision` via `onConflictDoNothing` on
  `(siteId, query, day)`. *Done when:* double-running `/api/cron/daily` inserts no duplicate
  decision rows.
- [ ] **N-11 finish F-020 logging** *(engineer)* — add `console.warn` to the remaining bare
  catches; make `getCheckpoint` distinguish DB-error from not-found. *Done when:* a DB blip
  during a checkpoint decision surfaces as retryable, not "not found".
- [ ] **N-16 robots.txt timeout** *(engineer)* — manual `urlopen(timeout=self.timeout)` +
  negative-cache failures. *Done when:* a hanging robots host can't stall `get()` (test).
- [ ] **SEC-2 — Operator** — point local `.env.local` at a throwaway Neon branch + dev-only
  secrets; rotate prod Neon password + encryption key if this disk was ever shared.

### Wave 2 — This month (hardening + ops debt)

- [ ] **F-032** husky pre-commit `gitleaks protect --staged` *(engineer)*.
- [ ] **N-15** purge `job_events` (and a retention policy for
  `metrics_timeseries`/`decision_records`) in the digest cron *(engineer)*.
- [ ] **N-09** implement a real `assert_public_url` and call it in `ResilientFetcher.get()`
  *(engineer)*.
- [ ] **N-17** sign/nonce the GSC OAuth `state` *(engineer)*.
- [ ] **N-24** add partial composite index
  `jobs (agent_key, priority DESC, id) WHERE status='queued'` *(engineer → migrate)*.
- [ ] **N-29/N-28/N-27** worker hardening: `.get()` the claim payload, fix HEALTH_PORT guard,
  drop `psycopg` *(engineer)*.
- [ ] **N-23** make `redactPII` fail closed *(engineer)*. **N-21** SSE abort/timeout caps
  *(engineer)*.
- [ ] CI: make `unittest` worker tests pytest-discoverable so they aren't silently skipped
  *(engineer)*.
- [ ] **F-026 — Operator:** run the Neon restore drill once; record RTO/RPO.

### Wave 3 — Polish / process

- [ ] **DOC-1** reconcile every GAPS_REPORT body status to match code (and downgrade the
  "FIXED" labels that are really partial) — *operator-controlled file; requires explicit
  go-ahead.*
- [ ] **N-18** `crypto.timingSafeEqual` for setup-token. **N-22** stop persisting synthetic
  `user` messages in `runDirectorReport`. **N-26** wire `content-safety` when the publish
  executor lands. **F-033** add `CONTRIBUTING.md` redaction checklist.

---

## 5. Quick wins (highest value-to-effort, all ~S)

1. **N-08** db-status `EXPECTED_TABLES` — one-list change makes migration drift detectable again.
2. **N-10** login-lockout DoS — small logic fix removes an availability attack on the sole operator.
3. **N-03** dedup-replay guard — one conditional stops silent duplicate-content accumulation.
4. **N-12 + N-20** NaN param guards — two `Number.isInteger` checks kill user-triggerable 500s.
5. **N-25** flag gate on the engine — restores a real kill switch before this branch goes live.

---

## 6. Ownership: operator vs. engineer

**Already done (this audit session):** SEC-1 contained — `.playwright-mcp/` gitignored,
23 capture files purged, verified no password remains in the worktree.

**Operator-only (cannot be done in-repo):**
- Rotate the admin login password (SEC-1) and prod Neon creds + encryption key (SEC-2).
- Apply migrations 0012–0014 and push the branch (after the Wave 0 journal fix).
- Run the Neon backup-restore drill (F-026).

**Engineer/Claude (unattended-safe):** every other item above — code fixes, schema changes
(generating migrations for operator to apply), tests, and doc reconciliation (DOC-1 only
with explicit go-ahead, since GAPS_REPORT is operator-controlled).
