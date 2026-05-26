# UTEONT

Multi-agent SEO orchestrator. Human-supervised, semi-autonomous, free-API only.

## Architecture (the two-host model)

```
       ┌──────────────────────────────────────────────────────────────────┐
       │  YOU                                                             │
       │  Web browser (laptop / phone / tablet) + Telegram                │
       └──────────────────┬───────────────────────────────────────────────┘
                          │
                          ▼
       ┌──────────────────────────────────────────────────────────────────┐
       │  ① VERCEL                                                        │
       │  - Next.js 16 frontend (App Router, server components)           │
       │  - Serverless functions: QA, SEO Optimization, Tracking          │
       │  - Postgres (Neon, via Vercel integration)                       │
       │  - Telegram webhook handler                                       │
       │  - Daily cron jobs                                                │
       └──────────────────┬───────────────────────────────────────────────┘
                          │ writes jobs to jobs table; worker polls
                          ▼
       ┌──────────────────────────────────────────────────────────────────┐
       │  ② BROWSER WORKER (Railway / Fly / VPS — see worker/README.md)   │
       │  - Python + Playwright + Chromium                                │
       │  - Drives AI Studio (Gemini 3.1 Pro) for Idea Gen, Content,      │
       │    Outreach drafting                                              │
       │  - Polls jobs table, writes results back                          │
       └──────────────────────────────────────────────────────────────────┘
```

**Why two hosts?** Vercel serverless can't keep a Chromium browser alive
between requests. Anything that needs persistent browser sessions or
long-running work (10+ min content drafts) runs on a separate worker.
Everything else — fast logic, the UI, the database, scheduled jobs,
Telegram webhooks — lives on Vercel.

## Project layout

```
uteont/
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── page.tsx          # Dashboard
│   │   ├── agents/[key]/     # Per-agent pages
│   │   ├── settings/
│   │   └── api/              # Serverless functions
│   ├── components/           # React components (+ shadcn/ui)
│   │   └── ui/
│   └── lib/
│       ├── agents/registry.ts   # The 10-agent definition
│       ├── db/schema.ts         # Drizzle schema (runs, jobs, keywords)
│       ├── db/client.ts         # Neon serverless connection
│       └── theme.ts             # Brand tokens
├── drizzle.config.ts
├── worker/                   # Python browser worker (separate deployment)
│   ├── agents/               # Research, QA, SEO (Python impls)
│   ├── browser_automation/   # Playwright + AI Studio driver
│   └── README.md             # Deployment guide
├── .env.example
├── vercel.json
└── README.md (this file)
```

## The 10 agents

| # | Agent | Runtime | Status |
|---|---|---|---|
| 1 | Research | worker (Python: pytrends, Wikipedia, opt. Reddit) | ✅ |
| 2 | Idea Generation | worker (AI Studio / Gemini) | ⏳ |
| 3 | Content Writing | worker (AI Studio / Gemini) | ⏳ |
| 4 | QA / Validation | fn (Vercel serverless) | ✅ (Python; TS port planned) |
| 5 | SEO Optimization | fn (Vercel serverless) | ✅ (Python; TS port planned) |
| 6 | Technical SEO | fn | ⏳ |
| 7 | Publishing | fn (WordPress REST API) | ⏳ |
| 8 | Backlink / Outreach | worker | ⏳ |
| 9 | Performance Tracking | fn (daily cron, GSC + GA4) | ⏳ |
| 10 | Revenue Optimization | fn | ⏳ |

## Local development

```bash
npm install
cp .env.example .env.local
# Fill DATABASE_URL (or run the Vercel bootstrap flow — see below)
npm run dev
```

App at `http://localhost:3000`.

## Vercel + database bootstrap

```bash
vercel link
vercel integration add neon   # provisions Neon Postgres + DATABASE_URL
vercel env pull .env.local
# Once db scripts are added:
# npm run db:push
npm run dev
```

## Browser worker (separate)

See `worker/README.md`. The worker is a separate deployment (Railway,
Fly.io, or a small VPS) that polls the `jobs` table in Postgres and
executes browser-driven agents using Playwright + AI Studio.

## How you interact with it

| Surface | When | What |
|---|---|---|
| Web app (this) | At a computer | Set goals, deep review, configure |
| Telegram bot | On the go | Quick approve / reject, summaries |
| Weekly email | Once a week | Glanceable performance digest |

## Constraints

- **No paid APIs.** Free tools only — pytrends, Wikipedia, PRAW, GSC.
- **No CMS yet.** Publishing Agent currently stubbed; WordPress REST API
  when a domain is connected.
- **Temperature is locked at 1.0** for all Gemini agents per Gemini 3
  guidance. Do not lower.

## License

Private.
