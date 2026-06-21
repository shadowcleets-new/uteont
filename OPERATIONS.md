# UTEONT — Operations Runbook

Common operational tasks: deploys, backups, monitoring, incident response.
This document is operator-facing — keep it current when procedures change.

## Architecture

```
                    ┌──────────────────────────────────────┐
                    │  Operator (browser / Telegram phone) │
                    └────────────┬─────────────────────────┘
                                 │ HTTPS                ↑
                                 ↓                      │ approve/reject
                    ┌──────────────────────────────────────┐
                    │  Vercel — Next.js + serverless fns   │
                    │   uteont.vercel.app                  │
                    │   - /login (NextAuth)                │
                    │   - /api/auth/* (NextAuth handlers)  │
                    │   - /api/jobs/* (worker queue)       │
                    │   - /api/telegram/webhook (bot)      │
                    │   - /api/cron/* (Vercel cron)        │
                    └────┬───────────────────┬─────────────┘
                         │                   │
                         ↓                   ↓
              ┌──────────────────┐  ┌─────────────────────┐
              │  Neon Postgres   │  │  Railway worker     │
              │  Serverless      │  │  Python + Playwright│
              │  Drizzle ORM     │  │  Polls /api/jobs    │
              └──────────────────┘  └──────────┬──────────┘
                                               │
                                               ↓
                                    ┌──────────────────────┐
                                    │  Gemini Free API     │
                                    └──────────────────────┘
```

## Hosts + services

| Component | Provider | Region | Plan |
|---|---|---|---|
| Web app + serverless fns | Vercel | iad1 (US East default) | Hobby |
| Database | Neon Postgres (via Vercel integration) | us-east-1 | Free |
| Browser worker | Railway | US West | Free trial credit |
| Bot platform | Telegram | n/a | Free |
| LLM | Google Gemini (AI Studio API) | n/a | Free tier (1500 req/day) |

## Daily / weekly automation

| Cron | When | What |
|---|---|---|
| `/api/cron/daily` | Daily 06:00 UTC | Pulls Search Console for every site with a GSC integration; snapshots every active target |
| `/api/cron/digest` | Mondays 13:00 UTC | Sends Telegram digest + purges old jobs / login attempts (>30d) |

Both are auto-authed by Vercel (`CRON_SECRET`). Middleware rejects calls with the wrong bearer.

## Secrets inventory

| Secret | Where stored | Rotation procedure |
|---|---|---|
| `DATABASE_URL` | Vercel env (Neon-managed) | Rotate Neon password via Neon dashboard → `vercel env pull` |
| `AUTH_SECRET` | Vercel env (sensitive) | Generate new, `vercel env rm` + `vercel env add`, redeploy. All existing sessions invalidated. |
| `WORKER_SHARED_SECRET` | Vercel env (sensitive) + Railway variable | Rotate Vercel first, redeploy, update Railway second. ~30s outage of the worker queue. |
| `CRON_SECRET` | Vercel env (auto-managed) | Rotates automatically when crons change. Hands-off. |
| `TELEGRAM_BOT_TOKEN` | Vercel env (sensitive) | `/revoke` via @BotFather → update Vercel → re-register webhook via `setWebhook` |
| `TELEGRAM_WEBHOOK_SECRET` | Vercel env (sensitive) | Generate new, update Vercel, re-register webhook with new secret_token |
| `GEMINI_API_KEY` | Railway variable | Revoke at https://aistudio.google.com/app/apikey, create new, update Railway |
| `GOOGLE_CLIENT_ID` / `_SECRET` | Vercel env (when configured) | Regenerate in Google Cloud Console |
| `REDDIT_CLIENT_ID` / `_SECRET` | Railway variable (optional) | Regenerate at https://www.reddit.com/prefs/apps |

**Application credentials** (username + password for the login UI):
- Stored hashed in `auth_config` table (NOT env)
- Rotate via Telegram `/setpassword-url` (preferred) or `/setpassword <pw>`
- See *Password rotation* section below

## Backup + restore (Neon)

Neon's free tier includes **24 hours of Point-in-Time Recovery (PITR)**. Paid plans extend this.

### To verify backup works (quarterly drill)

1. Open the Neon dashboard for the UTEONT project
2. **Branches** → **+ Create branch**
3. Source: pick `production`, time: 1 hour ago
4. Branch name: `backup-drill-YYYY-MM-DD`
5. Wait ~30 seconds for the branch to provision
6. **Connection string** → copy the temporary `DATABASE_URL`
7. From local shell: `DATABASE_URL=<temp> node -e "..."` → run a sanity query like `SELECT COUNT(*) FROM keywords`
8. Confirm the row count matches what was in prod ~1 hour ago
9. Delete the drill branch from the Neon dashboard
10. Update the *Last drill* date below

**Last drill**: never (TODO — first one is overdue)

### To actually restore from backup (real incident)

Scenario: bad migration drops a column or destroys data.

1. **Stop writes** — pause Vercel cron, kill Railway worker (set replicas to 0 in Railway dashboard)
2. Create a recovery branch from N minutes ago (before the bad change)
3. Test the recovery branch with a couple read queries — confirm the data is there
4. Promote: in the Neon dashboard, **Settings** → **Promote branch to default**
   - OR: copy the recovery branch's `DATABASE_URL` into Vercel env (this is the lower-risk option for a single-incident recovery)
5. Redeploy Vercel so it picks up the new `DATABASE_URL`
6. Restart Railway worker (set replicas back to 1)
7. Resume cron (it's auto, will fire on schedule)

**RTO** (recovery time objective): ~15 min in practice. **RPO** (max data loss): ~5 min on free tier (Neon's PITR granularity).

## Monitoring + alerts

Today's monitoring is minimal:

- **Vercel function logs** — last 1 hour by default, searchable
- **Railway worker logs** — same, separate UI
- **Telegram** — only outbound: digest, completion notifications, failure alerts
- **`/api/health`** — public endpoint suitable for an external uptime monitor (UptimeRobot free tier works)

**Recommended additions** (not yet wired):
- UptimeRobot (or similar) hitting `/api/health` every 5 min, alerting via email/Telegram on failure
- Vercel log drains → Logflare or Axiom for searchable history > 1h
- Sentry for unhandled exceptions in serverless functions

## Incident response

### Worker isn't claiming jobs

1. Check `/api/health` (authed) — is the worker secret set?
2. Open Railway dashboard → uteont service → Logs
3. Common causes:
   - Worker secret mismatch — Vercel + Railway disagree (re-pull from both and compare prefixes only, don't log values)
   - Gemini API key missing or quota exceeded — check Railway env
   - Worker container crashed — look at the last log lines for traceback
   - Railway free trial credit exhausted — check the billing widget in dashboard

### Login is broken / can't sign in

1. Open Telegram → `/whoami` — does the username show? Is password marked `set ✓`?
2. If neither set: `/setuser <username>` then `/setpassword-url`
3. If set but login fails: check the login_attempts table for recent failures
4. If 10+ recent failures: you're rate-limited. Wait 15 min OR run `/lockout CONFIRM` then re-set creds
5. Emergency: from local shell with prod DATABASE_URL: `DELETE FROM login_attempts WHERE success = false`

### Telegram bot stops responding

1. Hit `https://api.telegram.org/bot<TOKEN>/getMe` from a local terminal
   - 200 + `ok: true` → token still valid
   - 401 → token was revoked; create new via @BotFather and update Vercel
2. Hit `getWebhookInfo` → check `last_error_message` field
3. Common: webhook URL is pointed at an old Vercel deployment that no longer exists; re-register with current URL

### Costs spiking

1. Vercel dashboard → Usage → check the Functions, Bandwidth, Data Transfer meters
2. Railway dashboard → check current month's credits remaining
3. Most likely cause: a runaway worker stuck in a retry loop. Set Railway replicas to 0, investigate the failing job, then resume.

## Local dev

```bash
# Pull latest secrets (writes .env.local)
vercel env pull .env.local

# Sync the DB schema. Use db:push for an EXISTING database (it diffs the live
# schema and applies only what's missing — safe, idempotent). Use db:migrate
# only when provisioning a brand-new/empty database.
npm run db:push

# Start dev server
npm run dev
```

Worker locally (in a separate terminal, requires GEMINI_API_KEY in env):

```bash
cd worker/
pip install -r requirements.txt
# Set env vars or export from shell
UTEONT_API_BASE=http://localhost:3000 \
WORKER_SHARED_SECRET=<from-vercel-env> \
GEMINI_API_KEY=<from-aistudio> \
python worker.py
```

## Tests

```bash
npm test            # run once
npm run test:watch  # watch mode
npm run test:coverage
```

Coverage today is intentionally minimal (password policy only). Add tests when you find a regression — the easiest expansion path.

## Recovery commands

| Task | Command |
|---|---|
| Wipe all credentials | Telegram: `/lockout CONFIRM` |
| Reset login rate limit | `DELETE FROM login_attempts WHERE success = false;` |
| Re-queue a stuck failed job | `UPDATE jobs SET status='queued', attempts=0, error=NULL WHERE id=<id>;` |
| Force redeploy | `vercel deploy --prod --yes` |
| Tail Vercel logs | `vercel logs --follow` |
| Pull production env | `vercel env pull .env.local --environment=production` |

## Document control

This file is updated by the operator when procedures change. Most-recent change: initial draft.
