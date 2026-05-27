/**
 * Drizzle ORM schema for UTEONT — v1 complete backend.
 *
 * Tables:
 *   - cycles          one research-to-publish cycle (goal + status)
 *   - runs            every agent execution (telemetry)
 *   - jobs            queue for the browser worker
 *   - keywords        Research Agent output
 *   - ideas           Idea Generation output (article angles + briefs)
 *   - articles        Drafts + meta + publish state
 *   - approvals       Audit log of human gate decisions
 *   - notifications   Outbound notification log (Telegram, email)
 *   - agent_state     Per-agent KV (current job, cooldowns, etc.)
 *   - kv_settings     Generic app settings KV
 */

import {
  pgTable,
  serial,
  text,
  timestamp,
  jsonb,
  integer,
  real,
  boolean,
  index,
} from "drizzle-orm/pg-core";

export const cycles = pgTable(
  "cycles",
  {
    id:         serial("id").primaryKey(),
    goal:       text("goal").notNull(),
    seedTerms:  jsonb("seed_terms").$type<string[]>().notNull().default([]),
    status:     text("status").notNull().default("researching"),
      // researching | ideas-ready | drafting | qa | staged | published | archived
    createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byStatus: index("cycles_status_idx").on(t.status),
  }),
);

export const runs = pgTable(
  "runs",
  {
    id:          serial("id").primaryKey(),
    subjectKey:  text("subject_key").notNull(),
    category:    text("category").notNull(),
    action:      text("action").notNull(),
    cycleId:     integer("cycle_id").references(() => cycles.id),
    jobId:       integer("job_id"),
    startedAt:   timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt:  timestamp("finished_at", { withTimezone: true }),
    status:      text("status").notNull().default("running"),
    result:      jsonb("result"),
    error:       text("error"),
  },
  (t) => ({
    bySubject: index("runs_subject_idx").on(t.subjectKey),
    byStarted: index("runs_started_idx").on(t.startedAt.desc()),
    byCycle:   index("runs_cycle_idx").on(t.cycleId),
  }),
);

export const jobs = pgTable(
  "jobs",
  {
    id:           serial("id").primaryKey(),
    agentKey:     text("agent_key").notNull(),
    cycleId:      integer("cycle_id").references(() => cycles.id),
    payload:      jsonb("payload").notNull(),
    status:       text("status").notNull().default("queued"),
      // queued | claimed | done | failed
    claimedBy:    text("claimed_by"),
    claimedAt:    timestamp("claimed_at", { withTimezone: true }),
    finishedAt:   timestamp("finished_at", { withTimezone: true }),
    result:       jsonb("result"),
    error:        text("error"),
    attempts:     integer("attempts").notNull().default(0),
    maxAttempts:  integer("max_attempts").notNull().default(3),
    priority:     integer("priority").notNull().default(0),
    createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byStatus: index("jobs_status_idx").on(t.status),
    byAgent:  index("jobs_agent_idx").on(t.agentKey),
    byCycle:  index("jobs_cycle_idx").on(t.cycleId),
  }),
);

export const keywords = pgTable(
  "keywords",
  {
    id:                    serial("id").primaryKey(),
    cycleId:               integer("cycle_id").references(() => cycles.id),
    keyword:               text("keyword").notNull(),
    searchVolumeEstimate:  integer("search_volume_estimate").notNull(),
    competitionScore:      real("competition_score").notNull(),
    source:                text("source").notNull(),
    priorityRank:          integer("priority_rank").notNull(),
    status:                text("status").notNull().default("researched"),
      // researched | approved | in-progress | published | shelved
    shelvedReason:         text("shelved_reason"),
    approvedAt:            timestamp("approved_at", { withTimezone: true }),
    runId:                 integer("run_id").references(() => runs.id),
    createdAt:             timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byCycle:    index("keywords_cycle_idx").on(t.cycleId),
    byStatus:   index("keywords_status_idx").on(t.status),
    byPriority: index("keywords_priority_idx").on(t.priorityRank),
  }),
);

export const ideas = pgTable(
  "ideas",
  {
    id:           serial("id").primaryKey(),
    keywordId:    integer("keyword_id").references(() => keywords.id),
    cycleId:      integer("cycle_id").references(() => cycles.id),
    angle:        text("angle").notNull(),
    brief:        text("brief").notNull(),
    intent:       text("intent"),  // informational | transactional | navigational | commercial
    status:       text("status").notNull().default("proposed"),
      // proposed | approved | rejected | drafting | done
    rejectReason: text("reject_reason"),
    runId:        integer("run_id").references(() => runs.id),
    createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt:    timestamp("decided_at", { withTimezone: true }),
  },
  (t) => ({
    byCycle:   index("ideas_cycle_idx").on(t.cycleId),
    byKeyword: index("ideas_keyword_idx").on(t.keywordId),
    byStatus:  index("ideas_status_idx").on(t.status),
  }),
);

export const articles = pgTable(
  "articles",
  {
    id:               serial("id").primaryKey(),
    ideaId:           integer("idea_id").references(() => ideas.id),
    cycleId:          integer("cycle_id").references(() => cycles.id),
    title:            text("title").notNull(),
    slug:             text("slug").notNull(),
    body:             text("body").notNull(),
    metaTitle:        text("meta_title"),
    metaDescription:  text("meta_description"),
    qaScore:          integer("qa_score"),
    qaReport:         jsonb("qa_report"),
    seoScore:         integer("seo_score"),
    seoReport:        jsonb("seo_report"),
    status:           text("status").notNull().default("draft"),
      // draft | qa-passed | approved | staged | published | rejected
    publishedAt:      timestamp("published_at", { withTimezone: true }),
    cmsUrl:           text("cms_url"),
    runId:            integer("run_id").references(() => runs.id),
    createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byCycle:   index("articles_cycle_idx").on(t.cycleId),
    byStatus:  index("articles_status_idx").on(t.status),
    bySlug:    index("articles_slug_idx").on(t.slug),
  }),
);

export const approvals = pgTable(
  "approvals",
  {
    id:           serial("id").primaryKey(),
    gate:         text("gate").notNull(),
      // A: idea-selection | B: content | C: production | D: major-changes | E: outreach
    targetType:   text("target_type").notNull(), // 'idea' | 'article' | 'change'
    targetId:     integer("target_id").notNull(),
    decision:     text("decision").notNull(),    // 'approve' | 'reject' | 'edit'
    note:         text("note"),
    decidedBy:    text("decided_by").notNull().default("user"),
    decidedAt:    timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
    channel:      text("channel").notNull().default("web"), // 'web' | 'telegram'
  },
  (t) => ({
    byGate:   index("approvals_gate_idx").on(t.gate),
    byTarget: index("approvals_target_idx").on(t.targetType, t.targetId),
  }),
);

export const notifications = pgTable(
  "notifications",
  {
    id:          serial("id").primaryKey(),
    channel:     text("channel").notNull(),  // 'telegram' | 'email'
    kind:        text("kind").notNull(),     // 'approval-request' | 'completion' | 'error' | 'digest'
    subject:     text("subject"),
    body:        text("body").notNull(),
    payload:     jsonb("payload"),
    status:      text("status").notNull().default("pending"),
      // pending | sent | failed
    sentAt:      timestamp("sent_at", { withTimezone: true }),
    error:       text("error"),
    createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byStatus: index("notifications_status_idx").on(t.status),
    byKind:   index("notifications_kind_idx").on(t.kind),
  }),
);

export const agentState = pgTable("agent_state", {
  agentKey:     text("agent_key").primaryKey(),
  paused:       boolean("paused").notNull().default(false),
  pauseReason:  text("pause_reason"),
  cooldownUntil:timestamp("cooldown_until", { withTimezone: true }),
  lastRunAt:    timestamp("last_run_at", { withTimezone: true }),
  config:       jsonb("config"),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const kvSettings = pgTable("kv_settings", {
  key:        text("key").primaryKey(),
  value:      jsonb("value").notNull(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Single-row table (id=1 always). Holds the user-facing auth credentials
// so they can be rotated via Telegram commands without redeploys.
// All fields nullable: empty DB → no login possible (set via Telegram first).
export const authConfig = pgTable("auth_config", {
  id:                  serial("id").primaryKey(),
  username:            text("username"),
  passwordHash:        text("password_hash"),
  allowedGoogleEmail:  text("allowed_google_email"),
  // Admin chat ID for Telegram bot commands. Takes precedence over the
  // TELEGRAM_CHAT_ID env var so it can be rotated without a redeploy.
  adminChatId:         text("admin_chat_id"),
  // One-time URL flow for setting password without putting it in chat.
  // /setpassword-url generates a token + expiry; /setup/<token> consumes it.
  setupToken:          text("setup_token"),
  setupTokenExpiresAt: timestamp("setup_token_expires_at", { withTimezone: true }),
  updatedAt:           timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Audit + rate-limit source. Every credentials sign-in attempt
// (success or fail) writes a row. A new attempt is rejected if
// >= N failures in the trailing M minutes from any source.
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id:         serial("id").primaryKey(),
    username:   text("username").notNull(),
    success:    boolean("success").notNull(),
    ipAddress:  text("ip_address"),
    userAgent:  text("user_agent"),
    createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byCreated: index("login_attempts_created_idx").on(t.createdAt),
    byUsername: index("login_attempts_username_idx").on(t.username),
  }),
);

export type Cycle = typeof cycles.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Keyword = typeof keywords.$inferSelect;
export type Idea = typeof ideas.$inferSelect;
export type Article = typeof articles.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AgentState = typeof agentState.$inferSelect;
export type KvSetting = typeof kvSettings.$inferSelect;
export type AuthConfig = typeof authConfig.$inferSelect;
export type LoginAttempt = typeof loginAttempts.$inferSelect;
