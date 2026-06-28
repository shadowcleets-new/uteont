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

## Operator Runbook — releasing the remediation work (2026-06-22)

The remediation fixes are now merged into `main` and live in the single project
folder `C:\Users\acer\.claude\projects\uteont` (no more worktrees). Beginner-
friendly, click-by-click. Do the four steps **in order** (Step 1 before Step 2 —
explained in Step 2). If anything on screen doesn't match what's written here,
stop and ask before clicking.

### Opening PowerShell (you'll need it for Steps 1 and 3)

1. Press the **Windows key** on your keyboard (or click the Start button).
2. Type the word **`powershell`**.
3. Click **Windows PowerShell** (blue icon) in the results. A dark window opens.
4. Click once inside that window so it's focused. (To paste later: **right-click**
   pastes whatever you copied, or use **Ctrl + V**. Always press **Enter** to run a
   line.)
5. Type or paste this line, then press **Enter** — it moves you into the project
   folder:
   ```powershell
   cd "C:\Users\acer\.claude\projects\uteont"
   ```
   The start of the line should now show that long path. If it says *"Cannot find
   path"*, stop and tell me — don't continue.

---

### STEP 1 — Add the new database column (`scheduled_at`)

*Goal: add the `scheduled_at` column the new code needs. Without it, creating jobs
breaks. `db:push` reads the column from the code's schema and adds it to the live
database. This runs against **production**, which is correct — that's why it's first.*

1. In the PowerShell window (still in the project folder from above), type and Enter:
   ```powershell
   npm run db:push
   ```
2. Wait 10–60 seconds while it contacts the database. Then one of two things happens:
   - It prints the changes and **applies them immediately**, returning to a normal
     prompt → you're done, go to step 4 below.
   - It prints the changes and **asks you to confirm** (a `[y/N]`, or a little menu
     you move through with the **arrow keys** + **Enter**).
3. **Read the list of changes.** ✅ It is safe to approve if every line is an
   *addition*, e.g.:
   - "add column `scheduled_at`" on the `jobs` table
   - "create index `jobs_claim_idx`"
   - "create table …" for any tables it says are missing
   To approve: type **`y`** and Enter, or pick the **"Yes / apply"** option and Enter.
4. 🛑 **Do NOT approve — press `Ctrl + C` to cancel — if you see** any of: *drop*,
   *delete*, *truncate*, *rename*, or any warning about **data loss**. Take a
   screenshot and send it to me instead.
5. **Confirm it worked:** open your browser, log in to the app, then visit:
   ```
   https://<your-app-domain>/api/db-status
   ```
   (same domain you log in to). It should report **no missing tables**. If it lists
   missing tables, tell me.

---

### STEP 2 — Rotate the leaked secrets & move prod creds off your laptop

**2a — Set a new admin password (MANDATORY).** *Your current one was captured in
old screenshots/chat; treat it as compromised.*

1. Open **Telegram** (phone or desktop).
2. Open the chat with your **UTEONT bot** (the one that sends you job alerts).
3. Type **`/setpassword-url`** and send it.
4. The bot replies with a **link** (`https://…`). Tap/click it — a password page opens.
5. Type a **brand-new** strong password (12+ characters, not a variant of the old
   one). Re-type it if asked. Click the **Save / Submit** button.
6. **Test it:** open the app's login page, log out if you're logged in, and log in
   with the **new** password. Then try the **old** one — it must be **rejected**.

**2b — Point your local `.env.local` at a safe copy of the database (RECOMMENDED).**
*Right now that file holds your production database address in plain text.*

1. In your browser go to **https://console.neon.tech** and log in.
2. Click your **UTEONT** project to open it.
3. In the left menu, click **Branches**.
4. Click **New Branch** (top-right, labeled "New Branch" / "Create branch").
5. Name it **`dev`**. For the source/parent pick your main branch (often `main` or
   `production`) and "from current data". Click **Create**.
6. Click the new **`dev`** branch, find **Connection string** (or a **Connect**
   button). If there's a "show password"/eye toggle, turn it on so the password is
   included. **Copy** the whole string (it starts with `postgresql://`).
7. Open the project folder: press **Windows key + E** (File Explorer), click the
   **address bar** at the top, paste this and Enter:
   ```
   C:\Users\acer\.claude\projects\uteont\.claude\worktrees\thirsty-satoshi-0601ab
   ```
8. If you don't see a file called **`.env.local`**: in File Explorer click the
   **View** menu → tick **Hidden items**.
9. **Right-click `.env.local` → Open with → Notepad.**
10. Find the line that starts with **`DATABASE_URL=`**. Carefully select everything
    **after** the `=` and replace it with the `dev` connection string you copied.
    Keep `DATABASE_URL=` at the front, no spaces, no quotes (match the other lines).
11. **Save** (Ctrl + S) and close Notepad. Local work now uses the safe `dev` copy.

**2c — Rotate the production DB password (ONLY if the laptop was shared/synced, or
to be safe).**

1. Neon console → your project → left menu **Roles** (or **Settings → Roles**).
2. Find the role whose name matches your production connection string. Click its
   **⋯** menu → **Reset password**. Confirm. Neon shows a **new** password / new
   connection string — copy it.
3. Put the new string in **two** places:
   - **Vercel:** https://vercel.com → log in → click the **UTEONT** project →
     **Settings** (top) → **Environment Variables** (left) → find `DATABASE_URL`,
     click **Edit** (pencil / ⋯), make sure **Production** is ticked, paste, **Save**.
   - **Railway (the worker):** https://railway.app → log in → open the UTEONT worker
     → **Variables** tab → click `DATABASE_URL`, paste the new value, **Save**
     (Railway redeploys itself).
4. **Redeploy Vercel:** Vercel → your project → **Deployments** tab → on the newest
   one click **⋯ → Redeploy → Redeploy**.
5. ⚠️ **The `CONNECTION_ENCRYPTION_KEY` is different — leave it alone unless you
   believe that key itself leaked.** Changing it makes stored integration logins
   (e.g. Google Search Console) undecryptable, and you'd have to reconnect them
   (Settings → Integrations → reconnect).

---

### STEP 3 — Switch on the pre-commit secret scanner

1. Back in **PowerShell** (still in the project folder), type and Enter:
   ```powershell
   npm run prepare
   ```
   It finishes in a second or two.
2. **Confirm it worked** — type and Enter:
   ```powershell
   git config core.hooksPath
   ```
   It should print **`.husky`**. (If it prints nothing, run `npm install` and retry.)
3. **Optional** (makes the scan actually run; without it the check just prints a
   notice and lets you commit). Type and Enter:
   ```powershell
   winget install gitleaks.gitleaks
   ```
   If it asks you to agree to source terms, type **`y`** and Enter. If `winget`
   isn't found or it errors, skip this — nothing breaks.

---

### STEP 4 — Backup-restore drill (and write down the timings)

Follow the existing **"Backup + restore (Neon) → To verify backup works"** procedure
above (steps 1–10). In short:

1. Neon console → **Branches → New Branch** → source **`production`**, time **1 hour
   ago**, name **`backup-drill-2026-06-22`** → **Create**.
2. Open that branch's **SQL Editor** (left menu, with the drill branch selected) and run:
   ```sql
   select count(*) from jobs;
   select count(*) from sites;
   ```
   Confirm you get sensible row counts (data is present, no errors).
3. Note **how long** the whole thing took from start to seeing data (**RTO**) and how
   far back Neon let you go (**RPO** = its retention window, ~24h on the free tier).
4. **Delete** the drill branch (Branches → the drill branch → ⋯ → Delete).
5. Edit line **"Last drill: never"** in the *Backup + restore* section above to read,
   e.g.: `**Last drill**: 2026-06-22 — RTO ~5 min, RPO 24h`.

---

### Done-when checklist
- [ ] **1** `npm run db:push` approved (additions only) → `/api/db-status` shows no missing tables
- [ ] **2a** new admin password set via Telegram, old one rejected
- [ ] **2b** `.env.local` `DATABASE_URL` now points at the Neon `dev` branch
- [ ] **2c** *(if needed)* prod password rotated in Neon + Vercel + Railway + redeployed
- [ ] **3** `git config core.hooksPath` prints `.husky`
- [ ] **4** drill done, "Last drill" line updated above

Once **1** and **2** are done, this branch is safe to merge/deploy.

## Document control

This file is updated by the operator when procedures change. Most-recent change:
added the 2026-06-22 release runbook (remediation work merged into `main`).
